from typing import Optional

from fastapi import APIRouter

from backend.models.schemas import BulkEmailStartRequest
from backend.services.bulk_email import (
    clear_bulk_email_batch,
    get_bulk_email_batch_detail,
    list_bulk_email_batches,
    pause_bulk_email_batch,
    resume_bulk_email_batch,
    start_bulk_email_batch,
)
from backend.services.email_activity import (
    get_email_activity_summary,
    list_brand_email_activity,
    list_distributor_email_activity,
)
from backend.services.emailing import (
    resend_brand_email_attempt,
    resend_distributor_email_attempt,
)

router = APIRouter(tags=['email-activity'])


@router.get('/email-activity/summary')
def email_activity_summary():
    return get_email_activity_summary()


@router.get('/email-activity/brand-emails')
def get_brand_email_activity(
    q: Optional[str] = None,
    success: Optional[bool] = None,
    error_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
):
    return list_brand_email_activity(q, success, error_type, skip, limit)


@router.get('/email-activity/distributor-attempts')
def get_distributor_email_activity(
    q: Optional[str] = None,
    success: Optional[bool] = None,
    error_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
):
    return list_distributor_email_activity(q, success, error_type, skip, limit)


@router.post('/email-activity/brand-emails/{attempt_id}/resend')
async def resend_brand_email_activity_attempt(attempt_id: str):
    return await resend_brand_email_attempt(attempt_id)


@router.post('/email-activity/distributor-attempts/{attempt_id}/resend')
async def resend_distributor_email_activity_attempt(attempt_id: str):
    return await resend_distributor_email_attempt(attempt_id)

@router.post('/email-activity/bulk-send')
async def start_bulk_email(payload: BulkEmailStartRequest):
    return await start_bulk_email_batch(payload.daily_limit)


@router.get('/email-activity/bulk-send/batches')
def get_bulk_email_batches(skip: int = 0, limit: int = 10):
    return list_bulk_email_batches(skip, limit)


@router.get('/email-activity/bulk-send/batches/{batch_id}')
def get_bulk_email_batch(batch_id: str):
    return get_bulk_email_batch_detail(batch_id)

@router.post('/email-activity/bulk-send/batches/{batch_id}/pause')
async def pause_bulk_email(batch_id: str):
    return await pause_bulk_email_batch(batch_id)


@router.post('/email-activity/bulk-send/batches/{batch_id}/resume')
async def resume_bulk_email(batch_id: str):
    return await resume_bulk_email_batch(batch_id)

@router.post('/email-activity/bulk-send/batches/{batch_id}/clear')
async def clear_bulk_email(batch_id: str):
    return await clear_bulk_email_batch(batch_id)

