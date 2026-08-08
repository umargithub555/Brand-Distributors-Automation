from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException

from backend.core.database import db
from backend.core.queue import get_arq_pool
from backend.models.schemas import BrandUpdateRequest, BulkUploadRequest, DistributorRequest, Output


class BrandProcessingCancelled(Exception):
    """Raised when a queued or running brand research job is cancelled by the user."""

from backend.services.research import find_distributors
from backend.utils.mongo import encode_document
from backend.utils.query import build_search_query


BRANDS = db['Brands']
VALID_RESEARCH_MODES = {'detailed', 'short'}
ACTIVE_PROCESSING_STATUSES = {'queued', 'running', 'cancelling'}


def ensure_brand_indexes():
    BRANDS.create_index([('deleted', 1), ('processed', 1), ('processed_at', -1)])
    BRANDS.create_index([('deleted', 1), ('created_at', -1)])
    BRANDS.create_index([('deleted', 1), ('processing_status', 1)])
    BRANDS.create_index([('deleted', 1), ('emails_found', 1), ('email_sent', 1)])
    BRANDS.create_index([('deleted', 1), ('distributors_found', 1)])
    BRANDS.create_index([('brand', 1)], unique=False)


def active_brand_query(base: dict | None = None) -> dict:
    query = dict(base or {})
    query['deleted'] = {'$ne': True}
    return query


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def list_processed_brands(email_sent, distributors_found, emails_found, q, skip, limit, processed=None):
    base_query = {'processed': processed} if processed is not None else {}
    query = active_brand_query(base_query)
    if email_sent is not None:
        query['email_sent'] = email_sent
    if distributors_found is not None:
        query['distributors_found'] = distributors_found
    if emails_found is not None:
        query['emails_found'] = emails_found
    query = build_search_query(query, q, ['brand', 'country', 'parent_company', 'product_context'])

    total = BRANDS.count_documents(query)
    sort_field = 'processed_at' if processed is True else 'created_at'
    items = list(BRANDS.find(query).sort(sort_field, -1).skip(skip).limit(limit))
    return {
        'items': encode_document(items),
        'total': total,
        'skip': skip,
        'limit': limit,
    }


def get_stats():
    total_records = BRANDS.count_documents(active_brand_query())
    total = BRANDS.count_documents(active_brand_query({'processed': True}))
    unprocessed = BRANDS.count_documents(active_brand_query({'processed': {'$ne': True}}))
    distributors_found = BRANDS.count_documents(active_brand_query({'distributors_found': True}))
    emails_found = BRANDS.count_documents(active_brand_query({'emails_found': True}))
    email_sent = BRANDS.count_documents(active_brand_query({'email_sent': True}))
    queued = BRANDS.count_documents(active_brand_query({'processing_status': {'$in': ['queued', 'cancelling']}}))
    running = BRANDS.count_documents(active_brand_query({'processing_status': 'running'}))
    failed = BRANDS.count_documents(active_brand_query({'processing_status': 'failed'}))
    ready_for_outreach = BRANDS.count_documents(
        active_brand_query({'processed': True, 'emails_found': True, 'email_sent': {'$ne': True}})
    )
    return {
        'total_records': total_records,
        'total': total,
        'unprocessed': unprocessed,
        'distributors_found': distributors_found,
        'emails_found': emails_found,
        'email_sent': email_sent,
        'pending_emails': emails_found - email_sent,
        'queued': queued,
        'running': running,
        'failed': failed,
        'ready_for_outreach': ready_for_outreach,
    }


def bulk_upload_brands(payload: BulkUploadRequest):
    if not payload.brands:
        raise HTTPException(status_code=400, detail='No brands provided')

    inserted = []
    inserted_records = []
    skipped = []
    for item in payload.brands:
        existing = BRANDS.find_one({'brand': item.brand})
        if existing and not existing.get('deleted'):
            skipped.append(item.brand)
            continue

        if existing and existing.get('deleted'):
            BRANDS.update_one(
                {'_id': existing['_id']},
                {
                    '$set': {
                        'brand': item.brand,
                        'country': item.country,
                        'deleted': False,
                        'deleted_at': None,
                        'processed': False,
                        'processing_status': 'idle',
                        'processing_error': None,
                        'product_context': item.product_context.strip() if item.product_context else None,
                        'processing_research_mode': _normalize_research_mode(item.research_mode),
                        'updated_at': _utcnow_iso(),
                    }
                },
            )
            restored = BRANDS.find_one({'_id': existing['_id']})
            inserted.append(str(existing['_id']))
            if restored:
                inserted_records.append(restored)
            continue

        doc = {
            'brand': item.brand,
            'country': item.country,
            'product_context': item.product_context.strip() if item.product_context else None,
            'processed': False,
            'processing_status': 'idle',
            'processing_research_mode': _normalize_research_mode(item.research_mode),
            'created_at': _utcnow_iso(),
            'deleted': False,
            'deleted_at': None,
        }
        result = BRANDS.insert_one(doc)
        created = BRANDS.find_one({'_id': result.inserted_id})
        inserted.append(str(result.inserted_id))
        if created:
            inserted_records.append(created)

    return {
        'inserted': len(inserted),
        'skipped': len(skipped),
        'ids': inserted,
        'items': encode_document(inserted_records),
    }


def list_queue_brands(q, processed, skip, limit):
    query = active_brand_query()
    if processed is not None:
        query['processed'] = processed
    query = build_search_query(query, q, ['brand', 'country'])

    total = BRANDS.count_documents(query)
    items = list(BRANDS.find(query).sort('created_at', -1).skip(skip).limit(limit))
    return {
        'items': encode_document(items),
        'total': total,
        'skip': skip,
        'limit': limit,
    }


def delete_brand(brand_id: str):
    try:
        oid = ObjectId(brand_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid brand ID') from exc

    result = BRANDS.update_one(
        {'_id': oid, 'deleted': {'$ne': True}},
        {
            '$set': {
                'deleted': True,
                'deleted_at': _utcnow_iso(),
                'updated_at': _utcnow_iso(),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Brand not found')
    return {'success': True, 'brand_id': brand_id, 'deleted': True}


def update_brand_details(brand_id: str, payload: BrandUpdateRequest):
    oid, brand = _get_brand_or_404(brand_id)

    distributors = [item.model_dump() for item in payload.distributors]
    brand_emails = [email.strip() for email in payload.brand_emails if email and email.strip()]
    brand_email = brand_emails[0] if brand_emails else None
    parent_email = payload.parent_company_email.strip() if payload.parent_company_email else None

    update_doc = {
        'brand': payload.brand.strip(),
        'country': payload.country.strip() or 'USA',
        'product_context': payload.product_context.strip() if payload.product_context else None,
        'parent_company': payload.parent_company.strip() if payload.parent_company else None,
        'official_website': payload.official_website.strip() if payload.official_website else None,
        'brand_address': payload.brand_address.strip() if payload.brand_address else None,
        'brand_postal_code': payload.brand_postal_code.strip() if payload.brand_postal_code else None,
        'brand_contact_page': payload.brand_contact_page.strip() if payload.brand_contact_page else None,
        'parent_company_contact_page': payload.parent_company_contact_page.strip() if payload.parent_company_contact_page else None,
        'brand_phone': payload.brand_phone.strip() if payload.brand_phone else None,
        'parent_company_phone': payload.parent_company_phone.strip() if payload.parent_company_phone else None,
        'all_brand_emails': brand_emails,
        'brand_emails': brand_emails,
        'brand_email': brand_email,
        'brand_email_unavailable_reason': payload.brand_email_unavailable_reason.strip() if payload.brand_email_unavailable_reason else None,
        'parent_company_email': parent_email,
        'parent_company_email_type': payload.parent_company_email_type.strip() if payload.parent_company_email_type else None,
        'parent_company_email_unavailable_reason': payload.parent_company_email_unavailable_reason.strip() if payload.parent_company_email_unavailable_reason else None,
        'distributors': distributors,
        'distributors_found': len(distributors) > 0,
        'emails_found': brand_email is not None or parent_email is not None,
        'updated_at': _utcnow_iso(),
    }

    BRANDS.update_one({'_id': oid}, {'$set': update_doc})
    updated = BRANDS.find_one({'_id': oid}) or brand
    return encode_document(updated)


def mark_brand_processed(brand_id: str):
    try:
        oid = ObjectId(brand_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid brand ID') from exc

    result = BRANDS.update_one(
        {'_id': oid, 'deleted': {'$ne': True}},
        {
            '$set': {
                'processed': True,
                'processing_status': 'completed',
                'processed_at': _utcnow_iso(),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Brand not found')
    return {'success': True, 'brand_id': brand_id}


def _flatten_research_result(brand_id: str, output: Output, research_mode: str, product_context: str | None = None) -> dict:
    distributors = output.distributors or []
    brand_emails = output.brand_emails or []
    brand_email = brand_emails[0] if brand_emails else None
    parent_email = output.parent_company_email or None
    return {
        'product_context': product_context.strip() if product_context else None,
        'parent_company': output.parent_company,
        'official_website': output.official_website,
        'brand_address': output.brand_address,
        'brand_postal_code': output.brand_postal_code,
        'all_brand_emails': brand_emails,
        'brand_email': brand_email,
        'brand_phone': output.brand_phone,
        'parent_company_phone': output.parent_company_phone,
        'brand_contact_page': output.brand_contact_page,
        'brand_email_unavailable_reason': output.brand_email_unavailable_reason,
        'parent_company_contact_page': output.parent_company_contact_page,
        'parent_company_email': parent_email,
        'parent_company_email_type': output.parent_company_email_type,
        'parent_company_email_unavailable_reason': output.parent_company_email_unavailable_reason,
        'distributors': [d.model_dump() for d in distributors],
        'distributors_found': len(distributors) > 0,
        'emails_found': brand_email is not None or parent_email is not None,
        'email_sent': False,
        'processed': True,
        'processing_status': 'completed',
        'processing_error': None,
        'processing_research_mode': research_mode,
        'processed_at': _utcnow_iso(),
        'research_metrics': output.research_metrics.model_dump() if output.research_metrics else None,
    }


def _get_brand_or_404(brand_id: str):
    try:
        oid = ObjectId(brand_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid brand ID') from exc

    brand = BRANDS.find_one({'_id': oid, 'deleted': {'$ne': True}})
    if not brand:
        raise HTTPException(status_code=404, detail='Brand not found')
    return oid, brand


def _normalize_research_mode(research_mode: str | None) -> str:
    normalized = (research_mode or 'short').strip().lower()
    if normalized not in VALID_RESEARCH_MODES:
        raise HTTPException(status_code=400, detail=f'Invalid research_mode: {normalized}')
    return normalized


def _set_brand_processing_queued(oid: ObjectId, research_mode: str):
    BRANDS.update_one(
        {'_id': oid},
        {
            '$set': {
                'processed': False,
                'processing_status': 'queued',
                'processing_error': None,
                'processing_research_mode': research_mode,
                'processing_requested_at': _utcnow_iso(),
                'processing_cancel_requested': False,
                'processing_cancelled_at': None,
                'processing_cancel_requested_at': None,
            },
            '$unset': {
                'processed_at': '',
                'processing_started_at': '',
                'processing_completed_at': '',
            },
        },
    )


def _set_brand_processing_cancelled(oid: ObjectId, research_mode: str | None = None, reason: str = 'Processing stopped by user.'):
    update_fields = {
        'processed': False,
        'processing_status': 'cancelled',
        'processing_error': reason,
        'processing_cancel_requested': False,
        'processing_cancelled_at': _utcnow_iso(),
        'processing_completed_at': _utcnow_iso(),
    }
    if research_mode is not None:
        update_fields['processing_research_mode'] = research_mode
    BRANDS.update_one({'_id': oid}, {'$set': update_fields})


def _assert_brand_not_cancelled(brand_doc: dict, research_mode: str | None = None):
    status = brand_doc.get('processing_status')
    if brand_doc.get('processing_cancel_requested') or status in {'cancelled', 'cancelling'}:
        oid = brand_doc.get('_id')
        if oid is not None:
            _set_brand_processing_cancelled(oid, research_mode=research_mode)
        raise BrandProcessingCancelled('Processing stopped by user.')


def _build_cancel_response(brand_id: str, brand_name: str, status: str, research_mode: str | None = None, message: str | None = None):
    return {
        'success': True,
        'brand_id': brand_id,
        'brand_name': brand_name,
        'status': status,
        'research_mode': research_mode,
        'message': message or f'Brand processing {status}.',
    }


async def _enqueue_brand_processing_job(pool, brand_id: str, research_mode: str, brand_name: str):
    await pool.enqueue_job('process_brand_research_job', brand_id, research_mode)
    return {
        'success': True,
        'brand_id': brand_id,
        'brand_name': brand_name,
        'status': 'queued',
        'research_mode': research_mode,
        'message': f'Brand processing queued successfully using {research_mode} mode.',
    }


async def queue_brand_processing(brand_id: str, research_mode: str = 'short'):
    research_mode = _normalize_research_mode(research_mode)
    oid, brand = _get_brand_or_404(brand_id)

    processing_status = brand.get('processing_status')
    if processing_status in ACTIVE_PROCESSING_STATUSES:
        return {
            'success': True,
            'brand_id': brand_id,
            'brand_name': brand['brand'],
            'status': processing_status,
            'research_mode': brand.get('processing_research_mode', research_mode),
            'message': f'Brand processing is already {processing_status}.',
        }

    _set_brand_processing_queued(oid, research_mode)
    pool = await get_arq_pool()
    return await _enqueue_brand_processing_job(pool, brand_id, research_mode, brand['brand'])


async def queue_bulk_brand_processing(brand_ids: list[str], research_mode: str = 'short'):
    research_mode = _normalize_research_mode(research_mode)
    unique_brand_ids = []
    seen = set()
    for brand_id in brand_ids:
        normalized_id = (brand_id or '').strip()
        if normalized_id and normalized_id not in seen:
            seen.add(normalized_id)
            unique_brand_ids.append(normalized_id)

    if not unique_brand_ids:
        raise HTTPException(status_code=400, detail='No brand IDs were provided for bulk processing')

    pool = await get_arq_pool()
    results = []
    queued_count = 0
    already_active_count = 0
    for brand_id in unique_brand_ids:
        oid, brand = _get_brand_or_404(brand_id)
        processing_status = brand.get('processing_status')
        if processing_status in ACTIVE_PROCESSING_STATUSES:
            response = {
                'success': True,
                'brand_id': brand_id,
                'brand_name': brand['brand'],
                'status': processing_status,
                'research_mode': brand.get('processing_research_mode', research_mode),
                'message': f'Brand processing is already {processing_status}.',
            }
            already_active_count += 1
        else:
            _set_brand_processing_queued(oid, research_mode)
            response = await _enqueue_brand_processing_job(pool, brand_id, research_mode, brand['brand'])
            queued_count += 1
        results.append(response)

    return {
        'success': True,
        'research_mode': research_mode,
        'total_requested': len(unique_brand_ids),
        'queued_count': queued_count,
        'already_active_count': already_active_count,
        'results': results,
        'message': f'Queued {queued_count} brand(s) for processing using {research_mode} mode.',
    }


async def cancel_brand_processing(brand_id: str):
    oid, brand = _get_brand_or_404(brand_id)
    status = brand.get('processing_status') or ('completed' if brand.get('processed') else 'idle')
    research_mode = brand.get('processing_research_mode', 'detailed')

    if status == 'queued':
        _set_brand_processing_cancelled(oid, research_mode=research_mode)
        return _build_cancel_response(brand_id, brand['brand'], 'cancelled', research_mode, 'Queued brand processing was stopped.')

    if status == 'running':
        BRANDS.update_one(
            {'_id': oid},
            {
                '$set': {
                    'processing_status': 'cancelling',
                    'processing_cancel_requested': True,
                    'processing_cancel_requested_at': _utcnow_iso(),
                    'updated_at': _utcnow_iso(),
                }
            },
        )
        return _build_cancel_response(brand_id, brand['brand'], 'cancelling', research_mode, 'Running brand processing will stop at the next safe checkpoint.')

    if status == 'cancelling':
        return _build_cancel_response(brand_id, brand['brand'], 'cancelling', research_mode, 'Cancellation is already in progress for this brand.')

    if status == 'cancelled':
        return _build_cancel_response(brand_id, brand['brand'], 'cancelled', research_mode, 'This brand has already been stopped.')

    return _build_cancel_response(brand_id, brand['brand'], status, research_mode, 'This brand is not currently queued or running.')


async def cancel_bulk_brand_processing(brand_ids: list[str]):
    unique_brand_ids = []
    seen = set()
    for brand_id in brand_ids:
        normalized_id = (brand_id or '').strip()
        if normalized_id and normalized_id not in seen:
            seen.add(normalized_id)
            unique_brand_ids.append(normalized_id)

    if not unique_brand_ids:
        raise HTTPException(status_code=400, detail='No brand IDs were provided for cancellation')

    results = []
    cancelled_count = 0
    cancelling_count = 0
    for brand_id in unique_brand_ids:
        response = await cancel_brand_processing(brand_id)
        if response['status'] == 'cancelled':
            cancelled_count += 1
        elif response['status'] == 'cancelling':
            cancelling_count += 1
        results.append(response)

    return {
        'success': True,
        'total_requested': len(unique_brand_ids),
        'cancelled_count': cancelled_count,
        'cancelling_count': cancelling_count,
        'results': results,
        'message': f'Stopped {cancelled_count} queued brand(s). {cancelling_count} running brand(s) are stopping at the next safe checkpoint.',
    }


async def process_brand_job(brand_id: str, research_mode: str | None = None):
    oid, brand = _get_brand_or_404(brand_id)
    effective_research_mode = _normalize_research_mode(research_mode or brand.get('processing_research_mode', 'detailed'))
    _assert_brand_not_cancelled(brand, effective_research_mode)

    BRANDS.update_one(
        {'_id': oid},
        {
            '$set': {
                'processed': False,
                'processing_status': 'running',
                'processing_started_at': _utcnow_iso(),
                'processing_error': None,
                'processing_research_mode': effective_research_mode,
            }
        },
    )

    async def checkpoint():
        latest_brand = BRANDS.find_one({'_id': oid, 'deleted': {'$ne': True}})
        if not latest_brand:
            raise BrandProcessingCancelled('Processing stopped because the brand was removed from the active workspace.')
        _assert_brand_not_cancelled(latest_brand, effective_research_mode)

    try:
        await checkpoint()
        output = await find_distributors(
            DistributorRequest(
                brand=brand['brand'],
                country=brand.get('country', 'USA'),
                product_context=brand.get('product_context'),
            ),
            research_mode=effective_research_mode,
            checkpoint=checkpoint,
        )
        await checkpoint()
        update_doc = _flatten_research_result(brand_id, output, effective_research_mode, brand.get('product_context'))
        update_doc['processing_completed_at'] = _utcnow_iso()
        BRANDS.update_one({'_id': oid}, {'$set': update_doc})
        return {
            'success': True,
            'brand_id': brand_id,
            'brand_name': brand.get('brand'),
            'status': 'completed',
            'research_mode': effective_research_mode,
        }
    except BrandProcessingCancelled as exc:
        _set_brand_processing_cancelled(oid, research_mode=effective_research_mode, reason=str(exc))
        print(f"[brands] background processing cancelled for {brand.get('brand', brand_id)}: {exc}")
        return {
            'success': True,
            'brand_id': brand_id,
            'brand_name': brand.get('brand'),
            'status': 'cancelled',
            'research_mode': effective_research_mode,
            'message': str(exc),
        }
    except Exception as exc:
        error_message = getattr(exc, 'detail', None) or str(exc)
        BRANDS.update_one(
            {'_id': oid},
            {
                '$set': {
                    'processed': False,
                    'processing_status': 'failed',
                    'processing_error': error_message,
                    'processing_research_mode': effective_research_mode,
                    'processing_cancel_requested': False,
                    'processing_completed_at': _utcnow_iso(),
                }
            },
        )
        print(f"[brands] background processing failed for {brand.get('brand', brand_id)}: {error_message}")
        return {
            'success': False,
            'brand_id': brand_id,
            'brand_name': brand.get('brand'),
            'status': 'failed',
            'research_mode': effective_research_mode,
            'error': error_message,
        }
