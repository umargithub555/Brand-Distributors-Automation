from fastapi import APIRouter

from backend.models.schemas import SMTPSettingsResponse, SMTPSettingsUpdateRequest
from backend.services.app_settings import get_smtp_settings, update_smtp_settings

router = APIRouter(tags=['settings'])


@router.get('/settings/smtp', response_model=SMTPSettingsResponse)
def fetch_smtp_settings():
    return get_smtp_settings()


@router.put('/settings/smtp', response_model=SMTPSettingsResponse)
def save_smtp_settings(payload: SMTPSettingsUpdateRequest):
    return update_smtp_settings(payload)
