import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException

from backend.core.database import db
from backend.core.queue import get_arq_pool
from backend.models.schemas import BulkEmailBatchDetail, BulkEmailBatchResponse, BulkEmailTargetStatus
from backend.services.distributor_outreach import (
    _build_distributor_email_content,
    _get_sent_distributor_keys,
    _normalize_distributor_key,
)
from backend.services.emailing import (
    _build_brand_attempt_record,
    _build_email_content,
    _choose_recipient,
    send_email_message_sync,
)
from backend.utils.email_errors import classify_smtp_error
from backend.utils.mongo import encode_document

BRANDS = db['Brands']
BATCHES = db['BulkEmailBatches']
TARGETS = db['BulkEmailTargets']
DISTRIBUTOR_ATTEMPTS = db['DistributorEmailAttempts']

MIN_SEND_DELAY_SECONDS = 120
MAX_SEND_DELAY_SECONDS = 300
ACTIVE_BATCH_STATUSES = ['queued', 'running', 'paused']
ACTIVE_TARGET_STATUSES = ['scheduled', 'sending']


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _utcnow_iso() -> str:
    return _utcnow().isoformat()


def _server_local_date() -> str:
    return datetime.now().date().isoformat()


def ensure_bulk_email_indexes():
    BATCHES.create_index([('status', 1), ('created_at', -1)])
    BATCHES.create_index([('send_date', 1), ('created_at', -1)])
    TARGETS.create_index([('batch_id', 1), ('order_index', 1)])
    TARGETS.create_index([('send_date', 1), ('status', 1)])
    TARGETS.create_index([('status', 1), ('scheduled_for', 1)])
    TARGETS.create_index([('brand_id', 1), ('email_kind', 1), ('to_email', 1)])


def _today_reserved_count() -> int:
    return TARGETS.count_documents({
        'send_date': _server_local_date(),
        'status': {'$in': ['scheduled', 'sending', 'sent', 'failed']},
    })


def _batch_snapshot(batch: dict) -> BulkEmailBatchResponse:
    return BulkEmailBatchResponse(
        batch_id=str(batch['_id']),
        status=batch.get('status', 'queued'),
        daily_limit=int(batch.get('daily_limit', 0)),
        requested_limit=int(batch.get('requested_limit', 0)),
        available_slots=int(batch.get('available_slots', 0)),
        total_targets=int(batch.get('total_targets', 0)),
        queued_targets=int(batch.get('queued_targets', 0)),
        sent_targets=int(batch.get('sent_targets', 0)),
        failed_targets=int(batch.get('failed_targets', 0)),
        skipped_targets=int(batch.get('skipped_targets', 0)),
        created_at=batch.get('created_at', ''),
        updated_at=batch.get('updated_at'),
    )


def _target_snapshot(target: dict) -> BulkEmailTargetStatus:
    return BulkEmailTargetStatus(
        target_id=str(target['_id']),
        email_kind=target.get('email_kind', ''),
        brand_id=str(target.get('brand_id', '')),
        brand_name=target.get('brand_name', ''),
        recipient_name=target.get('recipient_name', ''),
        to_email=target.get('to_email'),
        subject=target.get('subject', ''),
        status=target.get('status', 'scheduled'),
        scheduled_for=target.get('scheduled_for'),
        sent_at=target.get('sent_at'),
        last_error=target.get('last_error'),
        last_error_type=target.get('last_error_type'),
        order_index=int(target.get('order_index', 0)),
    )


def _refresh_batch_counts(batch_id: ObjectId) -> dict:
    total = TARGETS.count_documents({'batch_id': batch_id})
    queued = TARGETS.count_documents({'batch_id': batch_id, 'status': {'$in': ACTIVE_TARGET_STATUSES}})
    sent = TARGETS.count_documents({'batch_id': batch_id, 'status': 'sent'})
    failed = TARGETS.count_documents({'batch_id': batch_id, 'status': 'failed'})
    skipped = TARGETS.count_documents({'batch_id': batch_id, 'status': {'$regex': '^(skipped|cancelled)'}})
    batch = BATCHES.find_one({'_id': batch_id}) or {}

    if queued > 0 and batch.get('status') == 'paused':
        status = 'paused'
    elif queued > 0:
        status = 'running' if sent or failed else 'queued'
    elif batch.get('status') == 'cancelled':
        status = 'cancelled'
    elif failed > 0 and sent > 0:
        status = 'completed_with_errors'
    elif failed > 0:
        status = 'failed'
    else:
        status = 'completed'

    update = {
        'status': status,
        'total_targets': total,
        'queued_targets': queued,
        'sent_targets': sent,
        'failed_targets': failed,
        'skipped_targets': skipped,
        'updated_at': _utcnow_iso(),
    }
    BATCHES.update_one({'_id': batch_id}, {'$set': update})
    return update


def _already_has_successful_brand_attempt(brand: dict) -> bool:
    if brand.get('email_sent'):
        return True
    return db['BrandEmailAttempts'].count_documents({'brand_id': brand['_id'], 'success': True}) > 0


def _build_brand_target(brand: dict) -> Optional[dict]:
    if _already_has_successful_brand_attempt(brand):
        return None
    try:
        to_email, email_type, subject, body = _build_email_content(brand)
    except HTTPException:
        return None
    if not to_email:
        return None
    return {
        'email_kind': 'brand',
        'brand_id': brand['_id'],
        'brand_name': brand.get('brand') or '',
        'recipient_name': brand.get('parent_company') or brand.get('brand') or '',
        'to_email': to_email,
        'email_type': email_type,
        'subject': subject,
        'body': body,
    }


def _build_distributor_targets(brand: dict) -> list[dict]:
    sent_keys = _get_sent_distributor_keys(brand['_id'])
    targets: list[dict] = []
    for distributor in brand.get('distributors') or []:
        distributor_name = distributor.get('name') or 'Unknown distributor'
        email = (distributor.get('email') or '').strip()
        if not email:
            continue
        distributor_key = _normalize_distributor_key(distributor_name, email)
        if distributor_key in sent_keys:
            continue
        subject, body = _build_distributor_email_content(brand, distributor)
        targets.append({
            'email_kind': 'distributor',
            'brand_id': brand['_id'],
            'brand_name': brand.get('brand') or '',
            'recipient_name': distributor_name,
            'distributor_snapshot': distributor,
            'to_email': email,
            'subject': subject,
            'body': body,
        })
    return targets


def _select_bulk_targets(limit: int) -> list[dict]:
    selected: list[dict] = []
    brands = BRANDS.find(
        {'deleted': {'$ne': True}, 'processed': True},
    ).sort([('processed_at', 1), ('created_at', 1)])

    for brand in brands:
        brand_target = _build_brand_target(brand)
        if brand_target:
            selected.append(brand_target)
            if len(selected) >= limit:
                break

        for distributor_target in _build_distributor_targets(brand):
            selected.append(distributor_target)
            if len(selected) >= limit:
                break
        if len(selected) >= limit:
            break
    return selected


async def start_bulk_email_batch(daily_limit: int) -> BulkEmailBatchResponse:
    active_batch = BATCHES.find_one({'status': {'$in': ['queued', 'running']}})
    if active_batch:
        raise HTTPException(status_code=409, detail='A bulk email batch is already queued or running')

    send_date = _server_local_date()
    already_reserved = _today_reserved_count()
    available_slots = max(0, daily_limit - already_reserved)
    if available_slots <= 0:
        raise HTTPException(status_code=400, detail='Daily email limit has already been reached for today')

    selected_targets = _select_bulk_targets(available_slots)
    if not selected_targets:
        raise HTTPException(status_code=400, detail='No unsent brand or distributor emails are available')

    batch_doc = {
        'status': 'queued',
        'send_date': send_date,
        'daily_limit': daily_limit,
        'requested_limit': daily_limit,
        'already_reserved_today': already_reserved,
        'available_slots': available_slots,
        'total_targets': len(selected_targets),
        'queued_targets': len(selected_targets),
        'sent_targets': 0,
        'failed_targets': 0,
        'skipped_targets': 0,
        'delay_min_seconds': MIN_SEND_DELAY_SECONDS,
        'delay_max_seconds': MAX_SEND_DELAY_SECONDS,
        'created_at': _utcnow_iso(),
        'updated_at': _utcnow_iso(),
    }
    batch_id = BATCHES.insert_one(batch_doc).inserted_id

    pool = await get_arq_pool()
    cumulative_delay = 0
    now = _utcnow()
    for index, target in enumerate(selected_targets):
        if index > 0:
            cumulative_delay += random.randint(MIN_SEND_DELAY_SECONDS, MAX_SEND_DELAY_SECONDS)
        scheduled_for = (now + timedelta(seconds=cumulative_delay)).isoformat()
        dispatch_token = uuid.uuid4().hex
        target_doc = {
            **target,
            'batch_id': batch_id,
            'send_date': send_date,
            'status': 'scheduled',
            'order_index': index + 1,
            'scheduled_for': scheduled_for,
            'dispatch_token': dispatch_token,
            'sent_at': None,
            'last_error': None,
            'last_error_type': None,
            'created_at': _utcnow_iso(),
            'updated_at': _utcnow_iso(),
        }
        target_id = TARGETS.insert_one(target_doc).inserted_id
        await pool.enqueue_job(
            'send_bulk_email_target',
            str(batch_id),
            str(target_id),
            dispatch_token,
            _defer_by=timedelta(seconds=cumulative_delay),
        )

    batch = BATCHES.find_one({'_id': batch_id})
    return _batch_snapshot(batch)


def list_bulk_email_batches(skip: int = 0, limit: int = 10) -> dict:
    total = BATCHES.count_documents({})
    items = list(BATCHES.find({}).sort('created_at', -1).skip(skip).limit(limit))
    return {'items': encode_document(items), 'total': total, 'skip': skip, 'limit': limit}


def get_bulk_email_batch_detail(batch_id: str) -> BulkEmailBatchDetail:
    try:
        oid = ObjectId(batch_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid bulk email batch ID') from exc
    batch = BATCHES.find_one({'_id': oid})
    if not batch:
        raise HTTPException(status_code=404, detail='Bulk email batch not found')
    targets = list(TARGETS.find({'batch_id': oid}).sort('order_index', 1))
    return BulkEmailBatchDetail(
        batch=_batch_snapshot(batch),
        targets=[_target_snapshot(target) for target in targets],
    )



async def pause_bulk_email_batch(batch_id: str) -> BulkEmailBatchResponse:
    try:
        oid = ObjectId(batch_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid bulk email batch ID') from exc

    batch = BATCHES.find_one({'_id': oid})
    if not batch:
        raise HTTPException(status_code=404, detail='Bulk email batch not found')
    if batch.get('status') not in ['queued', 'running']:
        raise HTTPException(status_code=400, detail='Only queued or running batches can be paused')

    BATCHES.update_one(
        {'_id': oid},
        {'$set': {'status': 'paused', 'paused_at': _utcnow_iso(), 'updated_at': _utcnow_iso()}},
    )
    _refresh_batch_counts(oid)
    return _batch_snapshot(BATCHES.find_one({'_id': oid}))


async def resume_bulk_email_batch(batch_id: str) -> BulkEmailBatchResponse:
    try:
        oid = ObjectId(batch_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid bulk email batch ID') from exc

    batch = BATCHES.find_one({'_id': oid})
    if not batch:
        raise HTTPException(status_code=404, detail='Bulk email batch not found')
    if batch.get('status') != 'paused':
        raise HTTPException(status_code=400, detail='Only paused batches can be resumed')

    remaining_targets = list(TARGETS.find({'batch_id': oid, 'status': 'scheduled'}).sort('order_index', 1))
    if not remaining_targets:
        _refresh_batch_counts(oid)
        return _batch_snapshot(BATCHES.find_one({'_id': oid}))

    pool = await get_arq_pool()
    cumulative_delay = 0
    now = _utcnow()
    for index, target in enumerate(remaining_targets):
        if index > 0:
            cumulative_delay += random.randint(MIN_SEND_DELAY_SECONDS, MAX_SEND_DELAY_SECONDS)
        dispatch_token = uuid.uuid4().hex
        scheduled_for = (now + timedelta(seconds=cumulative_delay)).isoformat()
        TARGETS.update_one(
            {'_id': target['_id']},
            {'$set': {
                'status': 'scheduled',
                'scheduled_for': scheduled_for,
                'dispatch_token': dispatch_token,
                'updated_at': _utcnow_iso(),
            }},
        )
        await pool.enqueue_job(
            'send_bulk_email_target',
            str(oid),
            str(target['_id']),
            dispatch_token,
            _defer_by=timedelta(seconds=cumulative_delay),
        )

    BATCHES.update_one(
        {'_id': oid},
        {'$set': {'status': 'queued', 'resumed_at': _utcnow_iso(), 'updated_at': _utcnow_iso()}},
    )
    _refresh_batch_counts(oid)
    return _batch_snapshot(BATCHES.find_one({'_id': oid}))


async def clear_bulk_email_batch(batch_id: str) -> BulkEmailBatchResponse:
    try:
        oid = ObjectId(batch_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid bulk email batch ID') from exc

    batch = BATCHES.find_one({'_id': oid})
    if not batch:
        raise HTTPException(status_code=404, detail='Bulk email batch not found')

    cancellable_targets = list(TARGETS.find({'batch_id': oid, 'status': 'scheduled'}).sort('order_index', 1))
    if not cancellable_targets:
        _refresh_batch_counts(oid)
        return _batch_snapshot(BATCHES.find_one({'_id': oid}))

    error_message = 'Bulk email queue was emptied before this message was sent.'
    error_type = 'cancelled'
    cancelled_at = _utcnow_iso()

    for target in cancellable_targets:
        if target.get('email_kind') == 'brand':
            _record_brand_failure(target, error_message, error_type)
        else:
            _record_distributor_attempt(target, success=False, error=error_message, error_type=error_type)
        TARGETS.update_one(
            {'_id': target['_id'], 'status': 'scheduled'},
            {'$set': {
                'status': 'cancelled',
                'last_error': error_message,
                'last_error_type': error_type,
                'cancelled_at': cancelled_at,
                'dispatch_token': uuid.uuid4().hex,
                'updated_at': cancelled_at,
            }},
        )

    remaining_active = TARGETS.count_documents({'batch_id': oid, 'status': {'$in': ACTIVE_TARGET_STATUSES}})
    BATCHES.update_one(
        {'_id': oid},
        {'$set': {
            'status': 'running' if remaining_active else 'cancelled',
            'cancelled_at': cancelled_at,
            'updated_at': cancelled_at,
        }},
    )
    _refresh_batch_counts(oid)
    return _batch_snapshot(BATCHES.find_one({'_id': oid}))

def _record_distributor_attempt(target: dict, success: bool, error: Optional[str] = None, error_type: Optional[str] = None):
    DISTRIBUTOR_ATTEMPTS.insert_one({
        'bulk_batch_id': target['batch_id'],
        'bulk_target_id': target['_id'],
        'target_id': target['_id'],
        'brand_id': target['brand_id'],
        'brand_name': target.get('brand_name'),
        'distributor_name': target.get('recipient_name'),
        'to_email': target.get('to_email'),
        'attempt_number': 1,
        'subject': target.get('subject'),
        'body': target.get('body'),
        'success': success,
        'error': error,
        'error_type': error_type,
        'created_at': _utcnow_iso(),
    })


def _mark_target_sending(target_id: ObjectId):
    TARGETS.update_one(
        {'_id': target_id, 'status': 'scheduled'},
        {'$set': {'status': 'sending', 'updated_at': _utcnow_iso()}},
    )


def _mark_target_done(target: dict, success: bool, error: Optional[str] = None, error_type: Optional[str] = None):
    update = {
        'status': 'sent' if success else 'failed',
        'last_error': error,
        'last_error_type': error_type,
        'updated_at': _utcnow_iso(),
    }
    if success:
        update['sent_at'] = _utcnow_iso()
    TARGETS.update_one({'_id': target['_id']}, {'$set': update})
    _refresh_batch_counts(target['batch_id'])


def _mark_brand_sent(target: dict):
    brand = BRANDS.find_one({'_id': target['brand_id'], 'deleted': {'$ne': True}})
    if not brand:
        raise RuntimeError('Brand not found')
    _build_brand_attempt_record(
        brand,
        target['to_email'],
        target.get('email_type') or _choose_recipient(brand)[1],
        target['subject'],
        target['body'],
        success=True,
        error=None,
        error_type=None,
    )
    BRANDS.update_one(
        {'_id': brand['_id']},
        {'$set': {
            'email_sent': True,
            'email_sent_to': target['to_email'],
            'email_sent_at': _utcnow_iso(),
            'email_sent_type': target.get('email_type') or _choose_recipient(brand)[1],
            'email_subject': target['subject'],
            'email_body': target['body'],
            'email_activity_logged': True,
            'email_last_error': None,
            'email_last_error_type': None,
            'email_last_attempt_at': _utcnow_iso(),
        }},
    )


def _record_brand_failure(target: dict, error: str, error_type: str):
    brand = BRANDS.find_one({'_id': target['brand_id'], 'deleted': {'$ne': True}})
    if not brand:
        return
    _build_brand_attempt_record(
        brand,
        target['to_email'],
        target.get('email_type') or _choose_recipient(brand)[1],
        target['subject'],
        target['body'],
        success=False,
        error=error,
        error_type=error_type,
    )
    BRANDS.update_one(
        {'_id': brand['_id']},
        {'$set': {
            'email_last_error': error,
            'email_last_error_type': error_type,
            'email_last_attempt_at': _utcnow_iso(),
        }},
    )


async def send_bulk_email_target(ctx, batch_id: str, target_id: str, dispatch_token: Optional[str] = None) -> dict:
    try:
        batch_oid = ObjectId(batch_id)
        target_oid = ObjectId(target_id)
    except Exception:
        return {'success': False, 'reason': 'invalid_id'}

    target = TARGETS.find_one({'_id': target_oid, 'batch_id': batch_oid})
    if not target:
        return {'success': False, 'reason': 'target_not_found'}
    batch = BATCHES.find_one({'_id': batch_oid})
    if not batch:
        return {'success': False, 'reason': 'batch_not_found'}
    if batch.get('status') == 'paused':
        return {'success': False, 'reason': 'batch_paused'}
    if dispatch_token and target.get('dispatch_token') and dispatch_token != target.get('dispatch_token'):
        return {'success': False, 'reason': 'stale_dispatch'}
    if target.get('status') == 'sent':
        return {'success': True, 'reason': 'already_sent'}
    if target.get('status') != 'scheduled':
        return {'success': False, 'reason': f"target_{target.get('status')}"}
    if not target.get('to_email'):
        TARGETS.update_one({'_id': target_oid}, {'$set': {'status': 'skipped_no_email', 'updated_at': _utcnow_iso()}})
        _refresh_batch_counts(batch_oid)
        return {'success': False, 'reason': 'no_email'}

    _mark_target_sending(target_oid)
    BATCHES.update_one({'_id': batch_oid}, {'$set': {'status': 'running', 'updated_at': _utcnow_iso()}})

    try:
        await asyncio.to_thread(send_email_message_sync, target['to_email'], target['subject'], target['body'])
        if target.get('email_kind') == 'brand':
            _mark_brand_sent(target)
        else:
            _record_distributor_attempt(target, success=True)
        _mark_target_done(target, success=True)
        return {'success': True, 'target_id': target_id}
    except Exception as exc:
        error_message = str(exc)
        error_type = classify_smtp_error(error_message)
        if target.get('email_kind') == 'brand':
            _record_brand_failure(target, error_message, error_type)
        else:
            _record_distributor_attempt(target, success=False, error=error_message, error_type=error_type)
        _mark_target_done(target, success=False, error=error_message, error_type=error_type)
        return {'success': False, 'target_id': target_id, 'error': error_message, 'error_type': error_type}
