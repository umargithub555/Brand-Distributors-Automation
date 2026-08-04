from fastapi import APIRouter

from backend.models.schemas import (
    EmailTemplatesResponse,
    EmailTemplatesUpdateRequest,
    SMTPSettingsResponse,
    SMTPSettingsUpdateRequest,
)
from backend.services.app_settings import (
    get_email_templates,
    get_smtp_settings,
    update_email_templates,
    update_smtp_settings,
)

router = APIRouter(tags=['settings'])


@router.get('/settings/smtp', response_model=SMTPSettingsResponse)
def fetch_smtp_settings():
    return get_smtp_settings()


@router.put('/settings/smtp', response_model=SMTPSettingsResponse)
def save_smtp_settings(payload: SMTPSettingsUpdateRequest):
    return update_smtp_settings(payload)


@router.get('/settings/email-templates', response_model=EmailTemplatesResponse)
def fetch_email_templates():
    return get_email_templates()


@router.put('/settings/email-templates', response_model=EmailTemplatesResponse)
def save_email_templates(payload: EmailTemplatesUpdateRequest):
    return update_email_templates(payload)
