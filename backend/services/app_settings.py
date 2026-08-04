from datetime import datetime, timezone
from string import Formatter

from fastapi import HTTPException

from backend.core.config import get_settings
from backend.core.database import db
from backend.models.schemas import (
    EmailTemplatesResponse,
    EmailTemplatesUpdateRequest,
    SMTPSettingsResponse,
    SMTPSettingsUpdateRequest,
)

_settings = get_settings()
_COLLECTION = db['AppSettings']
_SMTP_DOCUMENT_KEY = 'smtp'
_EMAIL_TEMPLATES_DOCUMENT_KEY = 'email_templates'


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def _default_email_templates() -> dict:
    return {
        'brand_with_distributors': {
            'subject': 'Distributor Verification Request - {brand_name}',
            'body': '''Dear {recipient_label} Team,

I hope this message finds you well.

We are conducting authorized distributor research for {brand_name} in {country} and have identified the following companies that appear to carry or distribute your brand.

Could you please review this list and confirm:
1. Which of these are officially authorized distributors of {brand_name}?
2. Are there any on this list that are NOT authorized?
3. Are there any official distributors we may have missed?

--- Identified Distributors ---
{distributor_list}
-------------------------------

Your confirmation will help us ensure we are sourcing through the correct authorized channels only.

We are serious buyers looking to establish a long-term business relationship and want to work exclusively through your official distribution network.

Thank you for your time. We look forward to your response.

Best regards,
[Your Name]
[Your Company]
[Your Phone Number]''',
        },
        'brand_without_distributors': {
            'subject': 'Distributor Inquiry - {brand_name} in {country}',
            'body': '''Dear {recipient_label} Team,

I hope this message finds you well.

We are actively looking to source {brand_name} products in {country} and were unable to locate an official distributor list through public channels.

Could you please:
1. Share your official distributor list for the {country} region, or
2. Confirm who the authorized distributors or wholesale partners are for {brand_name} in {country}, or
3. Point us to the right contact or department who handles distributor partnerships?

We are serious buyers looking to establish a long-term business relationship and want to ensure we are working through your official authorized channels.

Thank you for your time. We look forward to hearing from you.

Best regards,
[Your Name]
[Your Company]
[Your Phone Number]''',
        },
        'distributor_outreach': {
            'subject': 'Verification Request: {distributor_name} and {brand_name}',
            'body': '''Hello {distributor_name} team,

We are currently reviewing supplier and distribution channels for {brand_name} in {country}.

Your company appeared in our research as a business that may distribute or carry {brand_name}. Could you please confirm:
1. Whether you are currently an authorized or active distributor of {brand_name}
2. Whether you distribute the brand directly or through another upstream supplier
3. The best point of contact for commercial purchasing if you do handle this brand

If you are not a distributor for {brand_name}, a short clarification would still be very helpful.

Thank you for your time.

Best regards,
IR Solutions Team
IR Solutions
contact@irsolutions.com
+1-800-000-0000''',
        },
    }


def _merge_nested_dict(defaults: dict, stored: dict) -> dict:
    merged = {}
    for key, value in defaults.items():
        if isinstance(value, dict):
            merged[key] = dict(value)
            stored_value = stored.get(key) or {}
            if isinstance(stored_value, dict):
                for nested_key, nested_value in stored_value.items():
                    if nested_value is not None:
                        merged[key][nested_key] = nested_value
        else:
            merged[key] = stored.get(key, value)
    return merged


def load_smtp_settings() -> dict:
    values = _base_smtp_settings()
    doc = _COLLECTION.find_one({'key': _SMTP_DOCUMENT_KEY}) or {}
    stored = doc.get('values') or {}
    for key in values:
        if key in stored and stored[key] is not None:
            values[key] = stored[key]
    return values


def load_email_templates() -> dict:
    defaults = _default_email_templates()
    doc = _COLLECTION.find_one({'key': _EMAIL_TEMPLATES_DOCUMENT_KEY}) or {}
    stored = doc.get('values') or {}
    return _merge_nested_dict(defaults, stored)


def get_smtp_settings() -> SMTPSettingsResponse:
    merged = load_smtp_settings()
    doc = _COLLECTION.find_one({'key': _SMTP_DOCUMENT_KEY}) or {}
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


def get_email_templates() -> EmailTemplatesResponse:
    merged = load_email_templates()
    doc = _COLLECTION.find_one({'key': _EMAIL_TEMPLATES_DOCUMENT_KEY}) or {}
    return EmailTemplatesResponse(updated_at=doc.get('updated_at'), **merged)


def update_smtp_settings(payload: SMTPSettingsUpdateRequest) -> SMTPSettingsResponse:
    existing = _COLLECTION.find_one({'key': _SMTP_DOCUMENT_KEY}) or {}
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
        {'key': _SMTP_DOCUMENT_KEY},
        {
            '$set': {
                'key': _SMTP_DOCUMENT_KEY,
                'values': values,
                'updated_at': _utcnow_iso(),
            }
        },
        upsert=True,
    )
    return get_smtp_settings()


def update_email_templates(payload: EmailTemplatesUpdateRequest) -> EmailTemplatesResponse:
    values = payload.model_dump()
    for template_key, template in values.items():
        if not template.get('subject', '').strip():
            raise HTTPException(status_code=400, detail=f'Template subject is required for {template_key}')
        if not template.get('body', '').strip():
            raise HTTPException(status_code=400, detail=f'Template body is required for {template_key}')

    _COLLECTION.update_one(
        {'key': _EMAIL_TEMPLATES_DOCUMENT_KEY},
        {
            '$set': {
                'key': _EMAIL_TEMPLATES_DOCUMENT_KEY,
                'values': values,
                'updated_at': _utcnow_iso(),
            }
        },
        upsert=True,
    )
    return get_email_templates()


def render_template(template: str, context: dict) -> str:
    safe_context = {key: '' if value is None else str(value) for key, value in context.items()}
    formatter = Formatter()
    chunks = []
    for literal_text, field_name, format_spec, conversion in formatter.parse(template):
        chunks.append(literal_text)
        if field_name is None:
            continue
        value = safe_context.get(field_name, '')
        chunks.append(value)
    return ''.join(chunks).strip()


def require_smtp_settings() -> dict:
    settings = load_smtp_settings()
    if not settings.get('smtp_host') or not settings.get('smtp_from_email'):
        raise HTTPException(status_code=500, detail='SMTP settings are not configured')
    return settings
