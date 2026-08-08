import asyncio
from datetime import datetime, timezone
import smtplib
from email.message import EmailMessage
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException

from backend.core.database import db
from backend.models.schemas import BrandEmailDraftPreview
from backend.services.app_settings import load_email_templates, render_template, require_smtp_settings
from backend.utils.email_errors import classify_smtp_error

BRAND_ATTEMPTS = db['BrandEmailAttempts']
DISTRIBUTOR_ATTEMPTS = db['DistributorEmailAttempts']


def _build_distributor_list(distributors: list[dict]) -> str:
    lines = []
    for index, distributor in enumerate(distributors, start=1):
        location = ', '.join([
            part for part in [
                distributor.get('city'),
                distributor.get('state'),
                distributor.get('country'),
            ] if part
        ])
        website = f" ({distributor.get('website')})" if distributor.get('website') else ''
        suffix = f" - {location}" if location else ''
        lines.append(f"{index}. {distributor.get('name')}{suffix}{website}")
    return "\n".join(lines)


def _get_brand_or_404(brand_id: str):
    try:
        oid = ObjectId(brand_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid brand ID') from exc

    brand = db['Brands'].find_one({'_id': oid, 'deleted': {'$ne': True}})
    if not brand:
        raise HTTPException(status_code=404, detail='Brand not found')
    return oid, brand


def _choose_recipient(brand: dict) -> tuple[Optional[str], str]:
    parent_email = brand.get('parent_company_email')
    brand_email = brand.get('brand_email')
    if parent_email:
        return parent_email, 'parent'
    if brand_email:
        return brand_email, 'brand'
    return None, 'unknown'


def _build_email_content(brand: dict) -> tuple[str, str, str, str]:
    send_to, email_type = _choose_recipient(brand)
    if not send_to:
        raise HTTPException(status_code=400, detail='No email available for this brand')

    brand_name = brand.get('brand') or ''
    country = brand.get('country', 'USA')
    parent_company = brand.get('parent_company') or ''
    recipient_label = f"{brand_name} / {parent_company}" if parent_company else brand_name
    distributor_list = _build_distributor_list(brand.get('distributors', [])) if brand.get('distributors_found') else ''
    templates = load_email_templates()
    template_key = 'brand_with_distributors' if brand.get('distributors_found') else 'brand_without_distributors'
    template = templates.get(template_key, {})
    context = {
        'brand_name': brand_name,
        'country': country,
        'parent_company': parent_company,
        'recipient_label': recipient_label,
        'distributor_list': distributor_list,
    }
    subject = render_template(template.get('subject', ''), context)
    body = render_template(template.get('body', ''), context)
    return send_to, email_type, subject, body


def get_brand_email_draft(brand_id: str) -> BrandEmailDraftPreview:
    _oid, brand = _get_brand_or_404(brand_id)
    if brand.get('email_sent'):
        raise HTTPException(status_code=409, detail='A verification email has already been sent for this brand')
    send_to, email_type, subject, body = _build_email_content(brand)
    return BrandEmailDraftPreview(
        brand_id=brand_id,
        brand_name=brand.get('brand', ''),
        to_email=send_to,
        email_type=email_type,
        subject=subject,
        body=body,
    )


def _build_brand_attempt_record(
    brand: dict,
    to_email: str,
    email_type: str,
    subject: str,
    body: str,
    success: bool,
    error: Optional[str] = None,
    error_type: Optional[str] = None,
):
    BRAND_ATTEMPTS.insert_one(
        {
            'brand_id': brand['_id'],
            'brand_name': brand.get('brand'),
            'country': brand.get('country'),
            'parent_company': brand.get('parent_company'),
            'to_email': to_email,
            'email_type': email_type,
            'subject': subject,
            'body': body,
            'success': success,
            'error': error,
            'error_type': error_type,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }
    )


def send_email_message_sync(to_email: str, subject: str, body: str):
    smtp_settings = require_smtp_settings()

    message = EmailMessage()
    from_email = smtp_settings['smtp_from_email']
    from_name = smtp_settings.get('smtp_from_name') or ''
    message['From'] = f'{from_name} <{from_email}>' if from_name else from_email
    message['To'] = to_email
    message['Subject'] = subject
    message.set_content(body)

    smtp_host = smtp_settings['smtp_host']
    smtp_port = int(smtp_settings['smtp_port'])
    smtp_username = smtp_settings.get('smtp_username') or ''
    smtp_password = smtp_settings.get('smtp_password') or ''

    if smtp_settings.get('smtp_use_ssl'):
        with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30) as server:
            if smtp_username and smtp_password:
                server.login(smtp_username, smtp_password)
            server.send_message(message)
    else:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
            if smtp_settings.get('smtp_use_tls'):
                server.starttls()
            if smtp_username and smtp_password:
                server.login(smtp_username, smtp_password)
            server.send_message(message)


async def send_brand_email_approved(brand_id: str, to_email: str, subject: str, body: str):
    oid, brand = _get_brand_or_404(brand_id)
    if brand.get('email_sent'):
        raise HTTPException(status_code=409, detail='A verification email has already been sent for this brand')
    if not to_email.strip():
        raise HTTPException(status_code=400, detail='Recipient email is required')
    if not subject.strip():
        raise HTTPException(status_code=400, detail='Email subject is required')
    if not body.strip():
        raise HTTPException(status_code=400, detail='Email body is required')

    _default_to, email_type = _choose_recipient(brand)
    clean_to = to_email.strip()
    clean_subject = subject.strip()

    try:
        await asyncio.to_thread(send_email_message_sync, clean_to, clean_subject, body)
    except Exception as exc:
        error_message = str(exc)
        error_type = classify_smtp_error(error_message)
        _build_brand_attempt_record(
            brand,
            clean_to,
            email_type,
            clean_subject,
            body,
            success=False,
            error=error_message,
            error_type=error_type,
        )
        db['Brands'].update_one(
            {'_id': oid},
            {'$set': {
                'email_last_error': error_message,
                'email_last_error_type': error_type,
                'email_last_attempt_at': datetime.now(timezone.utc).isoformat(),
            }},
        )
        raise HTTPException(status_code=502, detail=error_message) from exc

    _build_brand_attempt_record(
        brand,
        clean_to,
        email_type,
        clean_subject,
        body,
        success=True,
        error=None,
        error_type=None,
    )
    db['Brands'].update_one(
        {'_id': oid},
        {'$set': {
            'email_sent': True,
            'email_sent_to': clean_to,
            'email_sent_at': datetime.now(timezone.utc).isoformat(),
            'email_sent_type': email_type,
            'email_subject': clean_subject,
            'email_body': body,
            'email_activity_logged': True,
            'email_last_error': None,
            'email_last_error_type': None,
            'email_last_attempt_at': datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {'success': True, 'brand_id': brand_id, 'brand_name': brand.get('brand')}



def _get_attempt_or_404(collection, attempt_id: str):
    try:
        oid = ObjectId(attempt_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid attempt ID') from exc

    attempt = collection.find_one({'_id': oid})
    if not attempt:
        raise HTTPException(status_code=404, detail='Email attempt not found')
    return oid, attempt


async def resend_brand_email_attempt(attempt_id: str):
    _attempt_oid, attempt = _get_attempt_or_404(BRAND_ATTEMPTS, attempt_id)
    brand_id = attempt.get('brand_id')
    if not brand_id:
        raise HTTPException(status_code=400, detail='Attempt is missing brand reference')

    oid, brand = _get_brand_or_404(str(brand_id))
    to_email = (attempt.get('to_email') or '').strip()
    subject = (attempt.get('subject') or '').strip()
    body = attempt.get('body') or ''
    email_type = attempt.get('email_type') or _choose_recipient(brand)[1]

    if not to_email:
        raise HTTPException(status_code=400, detail='Attempt is missing recipient email')
    if not subject:
        raise HTTPException(status_code=400, detail='Attempt is missing subject')
    if not body.strip():
        raise HTTPException(status_code=400, detail='Attempt is missing email body')

    try:
        await asyncio.to_thread(send_email_message_sync, to_email, subject, body)
    except Exception as exc:
        error_message = str(exc)
        error_type = classify_smtp_error(error_message)
        _build_brand_attempt_record(
            brand,
            to_email,
            email_type,
            subject,
            body,
            success=False,
            error=error_message,
            error_type=error_type,
        )
        db['Brands'].update_one(
            {'_id': oid},
            {'$set': {
                'email_last_error': error_message,
                'email_last_error_type': error_type,
                'email_last_attempt_at': datetime.now(timezone.utc).isoformat(),
            }},
        )
        raise HTTPException(status_code=502, detail=error_message) from exc

    _build_brand_attempt_record(
        brand,
        to_email,
        email_type,
        subject,
        body,
        success=True,
        error=None,
        error_type=None,
    )
    db['Brands'].update_one(
        {'_id': oid},
        {'$set': {
            'email_sent': True,
            'email_sent_to': to_email,
            'email_sent_at': datetime.now(timezone.utc).isoformat(),
            'email_sent_type': email_type,
            'email_subject': subject,
            'email_body': body,
            'email_activity_logged': True,
            'email_last_error': None,
            'email_last_error_type': None,
            'email_last_attempt_at': datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {'success': True, 'brand_id': str(oid), 'brand_name': brand.get('brand')}


async def resend_distributor_email_attempt(attempt_id: str):
    old_attempt_oid, attempt = _get_attempt_or_404(DISTRIBUTOR_ATTEMPTS, attempt_id)
    to_email = (attempt.get('to_email') or '').strip()
    subject = (attempt.get('subject') or '').strip()
    body = attempt.get('body') or ''

    if not to_email:
        raise HTTPException(status_code=400, detail='Attempt is missing recipient email')
    if not subject:
        raise HTTPException(status_code=400, detail='Attempt is missing subject')
    if not body.strip():
        raise HTTPException(status_code=400, detail='Attempt is missing email body')

    base_record = {
        'campaign_id': attempt.get('campaign_id'),
        'target_id': attempt.get('target_id'),
        'bulk_batch_id': attempt.get('bulk_batch_id'),
        'bulk_target_id': attempt.get('bulk_target_id'),
        'brand_id': attempt.get('brand_id'),
        'brand_name': attempt.get('brand_name'),
        'distributor_name': attempt.get('distributor_name'),
        'to_email': to_email,
        'attempt_number': int(attempt.get('attempt_number') or 1) + 1,
        'subject': subject,
        'body': body,
        'retry_of_attempt_id': old_attempt_oid,
        'created_at': datetime.now(timezone.utc).isoformat(),
    }

    try:
        await asyncio.to_thread(send_email_message_sync, to_email, subject, body)
    except Exception as exc:
        error_message = str(exc)
        error_type = classify_smtp_error(error_message)
        DISTRIBUTOR_ATTEMPTS.insert_one({
            **base_record,
            'success': False,
            'error': error_message,
            'error_type': error_type,
        })
        raise HTTPException(status_code=502, detail=error_message) from exc

    DISTRIBUTOR_ATTEMPTS.insert_one({
        **base_record,
        'success': True,
        'error': None,
        'error_type': None,
    })
    return {'success': True, 'brand_id': str(attempt.get('brand_id') or ''), 'distributor_name': attempt.get('distributor_name')}


async def send_brand_email(brand_id: str):
    draft = get_brand_email_draft(brand_id)
    return await send_brand_email_approved(brand_id, draft.to_email, draft.subject, draft.body)
