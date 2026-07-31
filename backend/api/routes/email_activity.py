from typing import Optional

from fastapi import APIRouter

from backend.services.email_activity import (
    get_email_activity_summary,
    list_brand_email_activity,
    list_distributor_email_activity,
)

router = APIRouter(tags=['email-activity'])


@router.get('/email-activity/summary')
def email_activity_summary():
    return get_email_activity_summary()


@router.get('/email-activity/brand-emails')
def get_brand_email_activity(
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
):
    return list_brand_email_activity(q, skip, limit)


@router.get('/email-activity/distributor-attempts')
def get_distributor_email_activity(
    q: Optional[str] = None,
    success: Optional[bool] = None,
    skip: int = 0,
    limit: int = 20,
):
    return list_distributor_email_activity(q, success, skip, limit)
