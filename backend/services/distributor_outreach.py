from datetime import datetime, timedelta, timezone
import random
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException

from backend.core.config import get_settings
from backend.core.database import db
from backend.core.queue import get_arq_pool
from backend.models.schemas import (
    DistributorOutreachApproveRequest,
    DistributorOutreachCampaignDetail,
    DistributorOutreachCampaignResponse,
    DistributorOutreachDraftItem,
    DistributorOutreachDraftPreview,
)
from backend.services.app_settings import load_email_templates, render_template
from backend.utils.email_errors import classify_smtp_error
from backend.utils.mongo import encode_document

_settings = get_settings()
OUTREACH_MIN_SEND_DELAY_SECONDS = 120
OUTREACH_MAX_SEND_DELAY_SECONDS = 300
CAMPAIGNS = db['DistributorEmailCampaigns']
TARGETS = db['DistributorEmailTargets']
ATTEMPTS = db['DistributorEmailAttempts']


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_brand_or_404(brand_id: str):
    try:
        oid = ObjectId(brand_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid brand ID') from exc

    brand = db['Brands'].find_one({'_id': oid, 'deleted': {'$ne': True}})
    if not brand:
        raise HTTPException(status_code=404, detail='Brand not found')
    return oid, brand


def _normalize_distributor_key(distributor_name: str | None, email: str | None = None) -> str:
    name = (distributor_name or '').strip().lower()
    email_value = (email or '').strip().lower()
    return f"{name}::{email_value}" if email_value else name


def _get_sent_distributor_keys(brand_id: ObjectId) -> set[str]:
    sent_attempts = ATTEMPTS.find({'brand_id': brand_id, 'success': True}, {'distributor_name': 1, 'to_email': 1})
    keys: set[str] = set()
    for attempt in sent_attempts:
        keys.add(_normalize_distributor_key(attempt.get('distributor_name'), attempt.get('to_email')))
        fallback_name = (attempt.get('distributor_name') or '').strip().lower()
        if fallback_name:
            keys.add(fallback_name)
    return keys


def _build_distributor_email_content(brand: dict, distributor: dict) -> tuple[str, str]:
    brand_name = brand.get('brand') or 'this brand'
    country = brand.get('country', 'USA')
    distributor_name = distributor.get('name') or 'your company'
    templates = load_email_templates()
    template = templates.get('distributor_outreach', {})
    context = {
        'brand_name': brand_name,
        'country': country,
        'distributor_name': distributor_name,
    }
    subject = render_template(template.get('subject', ''), context)
    body = render_template(template.get('body', ''), context)
    return subject, body


def _campaign_snapshot(campaign: dict) -> dict:
    return {
        'campaign_id': str(campaign['_id']),
        'status': campaign.get('status', 'queued'),
        'queued_targets': campaign.get('queued_targets', 0),
        'sent_targets': campaign.get('sent_targets', 0),
        'failed_targets': campaign.get('failed_targets', 0),
        'skipped_targets': campaign.get('skipped_targets', 0),
        'total_targets': campaign.get('total_targets', 0),
        'updated_at': campaign.get('updated_at'),
    }


def _refresh_campaign_counts(campaign_id: ObjectId) -> dict:
    total_targets = TARGETS.count_documents({'campaign_id': campaign_id})
    queued_targets = TARGETS.count_documents({'campaign_id': campaign_id, 'status': {'$in': ['queued', 'scheduled', 'sending', 'retry_scheduled']}})
    sent_targets = TARGETS.count_documents({'campaign_id': campaign_id, 'status': 'sent'})
    failed_targets = TARGETS.count_documents({'campaign_id': campaign_id, 'status': 'failed'})
    skipped_targets = TARGETS.count_documents({'campaign_id': campaign_id, 'status': 'skipped_no_email'})

    if queued_targets > 0:
        status = 'running' if sent_targets or failed_targets else 'queued'
    elif failed_targets > 0 and sent_targets > 0:
        status = 'completed_with_errors'
    elif failed_targets > 0:
        status = 'failed'
    else:
        status = 'completed'

    update = {
        'status': status,
        'total_targets': total_targets,
        'queued_targets': queued_targets,
        'sent_targets': sent_targets,
        'failed_targets': failed_targets,
        'skipped_targets': skipped_targets,
        'updated_at': _utcnow_iso(),
    }
    CAMPAIGNS.update_one({'_id': campaign_id}, {'$set': update})

    campaign = CAMPAIGNS.find_one({'_id': campaign_id})
    if campaign:
        db['Brands'].update_one(
            {'_id': campaign['brand_id']},
            {
                '$set': {
                    'latest_distributor_outreach': _campaign_snapshot(campaign),
                    'distributor_outreach_status': status,
                }
            },
        )
    return update


def get_distributor_outreach_draft(brand_id: str) -> DistributorOutreachDraftPreview:
    _oid, brand = _get_brand_or_404(brand_id)
    sent_distributor_keys = _get_sent_distributor_keys(_oid)
    distributors = brand.get('distributors') or []
    if not distributors:
        raise HTTPException(status_code=400, detail='No distributors found for this brand')

    drafts: list[DistributorOutreachDraftItem] = []
    ready_targets = 0
    missing_email_targets = 0
    already_sent_targets = 0

    for distributor in distributors:
        subject, body = _build_distributor_email_content(brand, distributor)
        distributor_name = distributor.get('name') or 'Unknown distributor'
        email = (distributor.get('email') or '').strip() or None
        distributor_key = _normalize_distributor_key(distributor_name, email)
        if distributor_key in sent_distributor_keys:
            already_sent_targets += 1
            drafts.append(
                DistributorOutreachDraftItem(
                    distributor_name=distributor_name,
                    to_email=email,
                    subject=subject,
                    body=body,
                    status='already_sent',
                    reason='A distributor outreach email was already sent successfully to this distributor.',
                )
            )
        elif email:
            ready_targets += 1
            drafts.append(
                DistributorOutreachDraftItem(
                    distributor_name=distributor_name,
                    to_email=email,
                    subject=subject,
                    body=body,
                    status='ready',
                )
            )
        else:
            missing_email_targets += 1
            drafts.append(
                DistributorOutreachDraftItem(
                    distributor_name=distributor_name,
                    to_email=None,
                    subject=subject,
                    body=body,
                    status='missing_email',
                    reason=distributor.get('email_unavailable_reason') or 'No distributor email was found in the research record.',
                )
            )

    return DistributorOutreachDraftPreview(
        brand_id=brand_id,
        brand_name=brand.get('brand', ''),
        total_targets=len(distributors),
        ready_targets=ready_targets,
        missing_email_targets=missing_email_targets,
        already_sent_targets=already_sent_targets,
        drafts=drafts,
    )


async def queue_distributor_outreach_campaign(
    brand_id: str,
    approval: DistributorOutreachApproveRequest | None = None,
) -> DistributorOutreachCampaignResponse:
    oid, brand = _get_brand_or_404(brand_id)
    distributors = brand.get('distributors') or []
    if not distributors:
        raise HTTPException(status_code=400, detail='No distributors found for this brand')

    existing_active = CAMPAIGNS.find_one(
        {'brand_id': oid, 'status': {'$in': ['queued', 'running']}},
        sort=[('created_at', -1)],
    )
    if existing_active:
        raise HTTPException(status_code=409, detail='A distributor outreach campaign is already queued or running for this brand')

    if approval and not approval.drafts:
        raise HTTPException(status_code=400, detail='No approved distributor drafts were provided')

    distributor_map = {
        (distributor.get('name') or '').strip().lower(): distributor
        for distributor in distributors
    }

    approved_drafts = approval.drafts if approval else get_distributor_outreach_draft(brand_id).drafts
    actionable_drafts = [draft for draft in approved_drafts if draft.status == 'ready' and (draft.to_email or '').strip()]
    if not actionable_drafts:
        raise HTTPException(status_code=400, detail='No remaining unsent distributor emails are available to queue')

    campaign_doc = {
        'brand_id': oid,
        'brand_name': brand.get('brand'),
        'status': 'queued',
        'total_targets': 0,
        'queued_targets': 0,
        'sent_targets': 0,
        'failed_targets': 0,
        'skipped_targets': 0,
        'created_at': _utcnow_iso(),
        'updated_at': _utcnow_iso(),
    }
    campaign_id = CAMPAIGNS.insert_one(campaign_doc).inserted_id

    pool = await get_arq_pool()
    queued_targets = 0
    skipped_targets = 0
    cumulative_delay_seconds = 0

    for draft in actionable_drafts:
        distributor_name = (draft.distributor_name or '').strip()
        distributor = distributor_map.get(distributor_name.lower())
        if not distributor:
            raise HTTPException(status_code=400, detail=f'Approved draft references unknown distributor: {distributor_name}')

        email = (draft.to_email or '').strip() or None
        subject = draft.subject.strip()
        body = draft.body
        if not subject or not body.strip():
            raise HTTPException(status_code=400, detail=f'Approved draft for {distributor_name} is missing subject or body')

        status = 'queued' if email else 'skipped_no_email'
        scheduled_for = None
        defer_seconds = 0
        if email:
            defer_seconds = cumulative_delay_seconds
            scheduled_for = (
                datetime.now(timezone.utc) + timedelta(seconds=defer_seconds)
            ).isoformat()
            cumulative_delay_seconds += random.randint(OUTREACH_MIN_SEND_DELAY_SECONDS, OUTREACH_MAX_SEND_DELAY_SECONDS)

        target_doc = {
            'campaign_id': campaign_id,
            'brand_id': oid,
            'brand_name': brand.get('brand'),
            'distributor_name': distributor_name,
            'distributor_snapshot': distributor,
            'to_email': email,
            'subject': subject,
            'body': body,
            'status': status,
            'attempt_count': 0,
            'last_error': None,
            'last_error_type': None,
            'scheduled_for': scheduled_for,
            'sent_at': None,
            'created_at': _utcnow_iso(),
            'updated_at': _utcnow_iso(),
        }
        target_id = TARGETS.insert_one(target_doc).inserted_id

        if email:
            queued_targets += 1
            await pool.enqueue_job(
                'send_distributor_outreach_email',
                str(campaign_id),
                str(target_id),
                _defer_by=timedelta(seconds=defer_seconds),
            )
        else:
            skipped_targets += 1

    CAMPAIGNS.update_one(
        {'_id': campaign_id},
        {
            '$set': {
                'total_targets': len(actionable_drafts),
                'queued_targets': queued_targets,
                'skipped_targets': skipped_targets,
                'updated_at': _utcnow_iso(),
            }
        },
    )
    campaign = CAMPAIGNS.find_one({'_id': campaign_id})
    if campaign:
        db['Brands'].update_one(
            {'_id': oid},
            {
                '$set': {
                    'latest_distributor_outreach': _campaign_snapshot(campaign),
                    'distributor_outreach_status': campaign.get('status', 'queued'),
                }
            },
        )

    return DistributorOutreachCampaignResponse(
        campaign_id=str(campaign_id),
        brand_id=brand_id,
        brand_name=brand.get('brand', ''),
        status='queued',
        queued_targets=queued_targets,
        skipped_targets=skipped_targets,
        total_targets=len(actionable_drafts),
    )


async def get_brand_outreach_campaigns(brand_id: str) -> list[dict]:
    oid, _brand = _get_brand_or_404(brand_id)
    campaigns = list(CAMPAIGNS.find({'brand_id': oid}).sort('created_at', -1).limit(10))
    return encode_document(campaigns)


async def get_outreach_campaign_detail(campaign_id: str) -> DistributorOutreachCampaignDetail:
    try:
        oid = ObjectId(campaign_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid campaign ID') from exc

    campaign = CAMPAIGNS.find_one({'_id': oid})
    if not campaign:
        raise HTTPException(status_code=404, detail='Campaign not found')

    targets = list(TARGETS.find({'campaign_id': oid}).sort('created_at', 1))
    return DistributorOutreachCampaignDetail(
        campaign_id=str(campaign['_id']),
        brand_id=str(campaign['brand_id']),
        brand_name=campaign.get('brand_name', ''),
        status=campaign.get('status', 'queued'),
        total_targets=campaign.get('total_targets', 0),
        queued_targets=campaign.get('queued_targets', 0),
        sent_targets=campaign.get('sent_targets', 0),
        failed_targets=campaign.get('failed_targets', 0),
        skipped_targets=campaign.get('skipped_targets', 0),
        created_at=campaign.get('created_at', ''),
        updated_at=campaign.get('updated_at'),
        targets=[
            {
                'target_id': str(target['_id']),
                'distributor_name': target.get('distributor_name', ''),
                'email': target.get('to_email'),
                'status': target.get('status', 'queued'),
                'attempt_count': target.get('attempt_count', 0),
                'last_error': target.get('last_error'),
                'scheduled_for': target.get('scheduled_for'),
                'sent_at': target.get('sent_at'),
            }
            for target in targets
        ],
    )


def build_distributor_attempt_record(target: dict, success: bool, error: Optional[str] = None, error_type: Optional[str] = None):
    ATTEMPTS.insert_one(
        {
            'campaign_id': target['campaign_id'],
            'target_id': target['_id'],
            'brand_id': target['brand_id'],
            'brand_name': target.get('brand_name'),
            'distributor_name': target.get('distributor_name'),
            'to_email': target.get('to_email'),
            'attempt_number': int(target.get('attempt_count', 0)) + 1,
            'subject': target.get('subject'),
            'body': target.get('body'),
            'success': success,
            'error': error,
            'error_type': error_type,
            'created_at': _utcnow_iso(),
        }
    )


def update_target_after_send(target_id: ObjectId, success: bool, error: Optional[str] = None, error_type: Optional[str] = None):
    target = TARGETS.find_one({'_id': target_id})
    if not target:
        return

    new_attempt_count = int(target.get('attempt_count', 0)) + 1
    status = 'sent' if success else 'failed'
    update = {
        'attempt_count': new_attempt_count,
        'status': status,
        'last_error': error,
        'last_error_type': error_type,
        'updated_at': _utcnow_iso(),
    }
    if success:
        update['sent_at'] = _utcnow_iso()
    TARGETS.update_one({'_id': target_id}, {'$set': update})
    build_distributor_attempt_record(target, success=success, error=error, error_type=error_type)
    _refresh_campaign_counts(target['campaign_id'])


def mark_target_sending(target_id: ObjectId):
    TARGETS.update_one(
        {'_id': target_id},
        {'$set': {'status': 'sending', 'updated_at': _utcnow_iso()}}
    )
    target = TARGETS.find_one({'_id': target_id})
    if target:
        CAMPAIGNS.update_one(
            {'_id': target['campaign_id']},
            {'$set': {'status': 'running', 'updated_at': _utcnow_iso()}}
        )
