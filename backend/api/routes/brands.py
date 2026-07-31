from typing import Optional

from fastapi import APIRouter, BackgroundTasks

from backend.models.schemas import (
    BrandEmailSendRequest,
    BrandProcessingTriggerRequest,
    BrandUpdateRequest,
    BulkUploadRequest,
    DistributorOutreachApproveRequest,
)
from backend.services.brands import (
    bulk_upload_brands,
    delete_brand,
    get_stats,
    list_processed_brands,
    list_queue_brands,
    mark_brand_processed,
    process_brand_in_background,
    queue_brand_processing,
    update_brand_details,
)
from backend.services.distributor_outreach import (
    get_brand_outreach_campaigns,
    get_distributor_outreach_draft,
    get_outreach_campaign_detail,
    queue_distributor_outreach_campaign,
)
from backend.services.emailing import get_brand_email_draft, send_brand_email, send_brand_email_approved

router = APIRouter(tags=['brands'])


@router.get('/brands')
async def get_brands(
    email_sent: Optional[bool] = None,
    distributors_found: Optional[bool] = None,
    emails_found: Optional[bool] = None,
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
):
    return await list_processed_brands(email_sent, distributors_found, emails_found, q, skip, limit)


@router.get('/brands/stats')
def brand_stats():
    return get_stats()


@router.post('/brands/bulk')
def upload_brands(payload: BulkUploadRequest):
    return bulk_upload_brands(payload)


@router.get('/brands/unprocessed')
def get_unprocessed_brands(
    q: Optional[str] = None,
    processed: Optional[bool] = None,
    skip: int = 0,
    limit: int = 15,
):
    return list_queue_brands(q, processed, skip, limit)


@router.delete('/brands/{brand_id}')
def remove_brand(brand_id: str):
    return delete_brand(brand_id)


@router.put('/brands/{brand_id}')
def edit_brand(brand_id: str, payload: BrandUpdateRequest):
    return update_brand_details(brand_id, payload)


@router.post('/brands/{brand_id}/process')
def mark_processed(brand_id: str):
    return mark_brand_processed(brand_id)


@router.post('/brands/{brand_id}/trigger')
def trigger_brand_processing(
    brand_id: str,
    background_tasks: BackgroundTasks,
    payload: BrandProcessingTriggerRequest | None = None,
):
    research_mode = payload.research_mode if payload else 'detailed'
    response = queue_brand_processing(brand_id, research_mode=research_mode)
    if response['status'] == 'queued':
        background_tasks.add_task(process_brand_in_background, brand_id)
    return response


@router.get('/brands/{brand_id}/email-draft')
def brand_email_draft(brand_id: str):
    return get_brand_email_draft(brand_id)


@router.post('/brands/{brand_id}/send-email')
async def trigger_brand_email(brand_id: str):
    return await send_brand_email(brand_id)


@router.post('/brands/{brand_id}/send-email-approved')
async def trigger_brand_email_approved(brand_id: str, payload: BrandEmailSendRequest):
    return await send_brand_email_approved(brand_id, payload.to_email, payload.subject, payload.body)


@router.get('/brands/{brand_id}/distributor-outreach-draft')
async def distributor_outreach_draft(brand_id: str):
    return get_distributor_outreach_draft(brand_id)


@router.post('/brands/{brand_id}/distributor-outreach')
async def trigger_distributor_outreach(brand_id: str):
    return await queue_distributor_outreach_campaign(brand_id)


@router.post('/brands/{brand_id}/distributor-outreach-approved')
async def trigger_distributor_outreach_approved(brand_id: str, payload: DistributorOutreachApproveRequest):
    return await queue_distributor_outreach_campaign(brand_id, approval=payload)


@router.get('/brands/{brand_id}/distributor-outreach-campaigns')
async def list_distributor_outreach_campaigns(brand_id: str):
    return await get_brand_outreach_campaigns(brand_id)


@router.get('/distributor-outreach-campaigns/{campaign_id}')
async def get_distributor_outreach_campaign(campaign_id: str):
    return await get_outreach_campaign_detail(campaign_id)
