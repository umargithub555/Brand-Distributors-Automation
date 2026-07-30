from datetime import datetime, timezone

from fastapi import HTTPException

from backend.core.config import get_settings
from backend.core.database import db
from backend.models.schemas import SMTPSettingsResponse, SMTPSettingsUpdateRequest

_settings = get_settings()
_COLLECTION = db['AppSettings']
_DOCUMENT_KEY = 'smtp'


def _base_smtp_settings() -> dict:
    return {
        'smtp_host': _settings.smtp_host or '',
        'smtp_port': _settings.smtp_port,
        'smtp_username': _settings.smtp_username or '',
        'smtp_password': _settings.smtp_password or '',
        'smtp_from_email': _settings.smtp_from_email or '',
        'smtp_from_name': _settings.smtp_from_name or '',
        'smtp_use_tls': _settings.smtp_use_tls,
        'smtp_use_ssl': _settings.smtp_use_ssl,
    }


def load_smtp_settings() -> dict:
    values = _base_smtp_settings()
    doc = _COLLECTION.find_one({'key': _DOCUMENT_KEY}) or {}
    stored = doc.get('values') or {}
    for key in values:
        if key in stored and stored[key] is not None:
            values[key] = stored[key]
    return values


def get_smtp_settings() -> SMTPSettingsResponse:
    merged = load_smtp_settings()
    doc = _COLLECTION.find_one({'key': _DOCUMENT_KEY}) or {}
    stored = doc.get('values') or {}
    return SMTPSettingsResponse(
        smtp_host=merged.get('smtp_host', ''),
        smtp_port=int(merged.get('smtp_port', 587) or 587),
        smtp_username=merged.get('smtp_username', ''),
        smtp_from_email=merged.get('smtp_from_email', ''),
        smtp_from_name=merged.get('smtp_from_name', ''),
        smtp_use_tls=bool(merged.get('smtp_use_tls', True)),
        smtp_use_ssl=bool(merged.get('smtp_use_ssl', False)),
        has_password=bool(merged.get('smtp_password')),
        password_source='database' if 'smtp_password' in stored and stored.get('smtp_password') else ('environment' if _settings.smtp_password else 'unset'),
        updated_at=doc.get('updated_at'),
    )


def update_smtp_settings(payload: SMTPSettingsUpdateRequest) -> SMTPSettingsResponse:
    existing = _COLLECTION.find_one({'key': _DOCUMENT_KEY}) or {}
    values = existing.get('values') or {}

    updates = payload.model_dump(exclude_none=True)
    clear_password = updates.pop('clear_password', False)

    for key, value in updates.items():
        if key == 'smtp_password':
            if value:
                values['smtp_password'] = value
            continue
        values[key] = value

    if clear_password:
        values['smtp_password'] = ''

    values.setdefault('smtp_port', 587)
    values.setdefault('smtp_use_tls', True)
    values.setdefault('smtp_use_ssl', False)

    if values.get('smtp_use_ssl'):
        values['smtp_use_tls'] = False

    _COLLECTION.update_one(
        {'key': _DOCUMENT_KEY},
        {
            '$set': {
                'key': _DOCUMENT_KEY,
                'values': values,
                'updated_at': datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )
    return get_smtp_settings()


def require_smtp_settings() -> dict:
    settings = load_smtp_settings()
    if not settings.get('smtp_host') or not settings.get('smtp_from_email'):
        raise HTTPException(status_code=500, detail='SMTP settings are not configured')
    return settings
