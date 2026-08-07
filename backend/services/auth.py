import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from backend.core.config import get_settings
from bson import ObjectId
from fastapi import Header, HTTPException

from backend.core.database import db
from backend.models.schemas import AdminProfileResponse, AuthLoginResponse
from backend.services.emailing import send_email_message_sync
from backend.utils.time import utcnow_iso



_settings = get_settings()
ADMINS = db['Admins']
SESSIONS = db['AdminSessions']

DEFAULT_ADMIN_EMAIL = _settings.default_admin_email
DEFAULT_ADMIN_PASSWORD = _settings.default_admin_password
DEFAULT_ADMIN_NAME = 'Primary Admin'
DEFAULT_ADMIN_ROLE = 'admin'
SESSION_TTL_DAYS = _settings.SESSION_TTL_DAYS
SESSION_IDLE_TIMEOUT_MINUTES = _settings.SESSION_IDLE_TIMEOUT_MINUTES
OTP_TTL_MINUTES = _settings.OTP_TTL_MINUTES
PBKDF2_ROUNDS = _settings.PBKDF2_ROUNDS
MIN_PASSWORD_LENGTH = _settings.MIN_PASSWORD_LENGTH


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(email: str | None) -> str:
    return (email or '').strip().lower()


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _hash_secret(secret: str, salt: str | None = None) -> tuple[str, str]:
    effective_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        'sha256',
        secret.encode('utf-8'),
        effective_salt.encode('utf-8'),
        PBKDF2_ROUNDS,
    ).hex()
    return digest, effective_salt


def _verify_secret(secret: str, secret_hash: str | None, salt: str | None) -> bool:
    if not secret_hash or not salt:
        return False
    computed_hash, _ = _hash_secret(secret, salt)
    return secrets.compare_digest(computed_hash, secret_hash)


def _sanitize_admin(admin: dict[str, Any]) -> AdminProfileResponse:
    return AdminProfileResponse(
        email=admin.get('email', ''),
        name=admin.get('name') or DEFAULT_ADMIN_NAME,
        role=admin.get('role') or DEFAULT_ADMIN_ROLE,
    )


def _validate_password(password: str):
    if len((password or '').strip()) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f'Password must be at least {MIN_PASSWORD_LENGTH} characters long')


def ensure_admin_seeded():
    ADMINS.create_index('email', unique=True)
    SESSIONS.create_index('token_hash', unique=True)

    email = _normalize_email(DEFAULT_ADMIN_EMAIL)
    existing = ADMINS.find_one({'email': email})
    if existing:
        ADMINS.update_one(
            {'_id': existing['_id']},
            {
                '$set': {
                    'name': existing.get('name') or DEFAULT_ADMIN_NAME,
                    'role': existing.get('role') or DEFAULT_ADMIN_ROLE,
                    'updated_at': utcnow_iso(),
                }
            },
        )
        return

    password_hash, password_salt = _hash_secret(DEFAULT_ADMIN_PASSWORD)
    now_iso = utcnow_iso()
    ADMINS.insert_one(
        {
            'email': email,
            'name': DEFAULT_ADMIN_NAME,
            'role': DEFAULT_ADMIN_ROLE,
            'password_hash': password_hash,
            'password_salt': password_salt,
            'created_at': now_iso,
            'updated_at': now_iso,
            'password_updated_at': now_iso,
        }
    )


def _create_session(admin: dict[str, Any]) -> str:
    token = secrets.token_urlsafe(32)
    now = _now()
    absolute_expires_at = now + timedelta(days=SESSION_TTL_DAYS)
    idle_expires_at = min(absolute_expires_at, now + timedelta(minutes=SESSION_IDLE_TIMEOUT_MINUTES))
    SESSIONS.insert_one(
        {
            'admin_id': admin['_id'],
            'token_hash': _hash_token(token),
            'created_at': now,
            'last_seen_at': now,
            'expires_at': absolute_expires_at,
            'idle_expires_at': idle_expires_at,
        }
    )
    return token


def authenticate_admin(email: str, password: str) -> AuthLoginResponse:
    admin = ADMINS.find_one({'email': _normalize_email(email)})
    if not admin or not _verify_secret(password, admin.get('password_hash'), admin.get('password_salt')):
        raise HTTPException(status_code=401, detail='Invalid email or password')

    token = _create_session(admin)
    ADMINS.update_one({'_id': admin['_id']}, {'$set': {'last_login_at': utcnow_iso(), 'updated_at': utcnow_iso()}})
    admin = ADMINS.find_one({'_id': admin['_id']}) or admin
    return AuthLoginResponse(token=token, admin=_sanitize_admin(admin))


def _get_session_by_token(token: str) -> dict[str, Any] | None:
    session = SESSIONS.find_one({'token_hash': _hash_token(token)})
    if not session:
        return None

    now = _now()
    expires_at = _normalize_datetime(session.get('expires_at'))
    idle_expires_at = _normalize_datetime(session.get('idle_expires_at'))
    last_seen_at = _normalize_datetime(session.get('last_seen_at'))

    if expires_at and expires_at < now:
        SESSIONS.delete_one({'_id': session['_id']})
        return None

    if idle_expires_at and idle_expires_at < now:
        SESSIONS.delete_one({'_id': session['_id']})
        return None

    updates: dict[str, Any] = {}
    if expires_at and session.get('expires_at') != expires_at:
        updates['expires_at'] = expires_at
        session['expires_at'] = expires_at
    if idle_expires_at and session.get('idle_expires_at') != idle_expires_at:
        updates['idle_expires_at'] = idle_expires_at
        session['idle_expires_at'] = idle_expires_at
    if last_seen_at and session.get('last_seen_at') != last_seen_at:
        updates['last_seen_at'] = last_seen_at
        session['last_seen_at'] = last_seen_at

    if updates:
        SESSIONS.update_one({'_id': session['_id']}, {'$set': updates})

    return session


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail='Authentication required')
    scheme, _, token = authorization.partition(' ')
    if scheme.lower() != 'bearer' or not token.strip():
        raise HTTPException(status_code=401, detail='Authentication required')
    return token.strip()


def require_admin(authorization: str | None = Header(default=None)):
    token = _extract_bearer_token(authorization)
    session = _get_session_by_token(token)
    if not session:
        raise HTTPException(status_code=401, detail='Session expired or invalid')

    admin = ADMINS.find_one({'_id': session['admin_id']})
    if not admin:
        SESSIONS.delete_one({'_id': session['_id']})
        raise HTTPException(status_code=401, detail='Session expired or invalid')

    now = _now()
    absolute_expires_at = _normalize_datetime(session.get('expires_at'))
    next_idle_expires_at = now + timedelta(minutes=SESSION_IDLE_TIMEOUT_MINUTES)
    if absolute_expires_at is not None:
        next_idle_expires_at = min(absolute_expires_at, next_idle_expires_at)

    SESSIONS.update_one(
        {'_id': session['_id']},
        {'$set': {'last_seen_at': now, 'idle_expires_at': next_idle_expires_at}},
    )
    session['last_seen_at'] = now
    session['idle_expires_at'] = next_idle_expires_at
    return {'admin': admin, 'session': session, 'token': token}


def get_current_admin_profile(auth_context: dict[str, Any]) -> AdminProfileResponse:
    return _sanitize_admin(auth_context['admin'])


def logout_admin(token: str):
    SESSIONS.delete_one({'token_hash': _hash_token(token)})
    return {'success': True, 'message': 'Logged out successfully'}


def _clear_reset_otp(admin_id: ObjectId):
    ADMINS.update_one(
        {'_id': admin_id},
        {
            '$unset': {
                'reset_otp_hash': '',
                'reset_otp_salt': '',
                'reset_otp_expires_at': '',
                'reset_otp_sent_at': '',
            },
            '$set': {'updated_at': utcnow_iso()},
        },
    )


def _revoke_sessions(admin_id: ObjectId, keep_session_id: ObjectId | None = None):
    query: dict[str, Any] = {'admin_id': admin_id}
    if keep_session_id is not None:
        query['_id'] = {'$ne': keep_session_id}
    SESSIONS.delete_many(query)


async def request_password_reset(email: str):
    normalized_email = _normalize_email(email)
    admin = ADMINS.find_one({'email': normalized_email})
    if admin:
        otp = f'{secrets.randbelow(1_000_000):06d}'
        otp_hash, otp_salt = _hash_secret(otp)
        expires_at = _now() + timedelta(minutes=OTP_TTL_MINUTES)
        ADMINS.update_one(
            {'_id': admin['_id']},
            {
                '$set': {
                    'reset_otp_hash': otp_hash,
                    'reset_otp_salt': otp_salt,
                    'reset_otp_expires_at': expires_at,
                    'reset_otp_sent_at': utcnow_iso(),
                    'updated_at': utcnow_iso(),
                }
            },
        )

        subject = 'Brand Intelligence admin password reset OTP'
        body = (
            f'Hello {admin.get("name") or "Admin"},\n\n'
            f'Your one-time password for resetting the Brand Intelligence admin account is: {otp}\n\n'
            f'This OTP will expire in {OTP_TTL_MINUTES} minutes.\n'
            'If you did not request this, you can ignore this message.\n\n'
            'Brand Intelligence Security'
        )
        await asyncio.to_thread(send_email_message_sync, normalized_email, subject, body)

    return {
        'success': True,
        'message': 'If the admin account exists, a reset OTP has been sent to its email address.',
    }


def reset_password_with_otp(email: str, otp: str, new_password: str):
    _validate_password(new_password)
    admin = ADMINS.find_one({'email': _normalize_email(email)})
    if not admin:
        raise HTTPException(status_code=400, detail='Invalid email or OTP')

    expires_at = _normalize_datetime(admin.get('reset_otp_expires_at'))
    if not expires_at or expires_at < _now():
        raise HTTPException(status_code=400, detail='OTP has expired. Please request a new one.')

    if not _verify_secret((otp or '').strip(), admin.get('reset_otp_hash'), admin.get('reset_otp_salt')):
        raise HTTPException(status_code=400, detail='Invalid email or OTP')

    password_hash, password_salt = _hash_secret(new_password.strip())
    ADMINS.update_one(
        {'_id': admin['_id']},
        {
            '$set': {
                'password_hash': password_hash,
                'password_salt': password_salt,
                'password_updated_at': utcnow_iso(),
                'updated_at': utcnow_iso(),
            },
            '$unset': {
                'reset_otp_hash': '',
                'reset_otp_salt': '',
                'reset_otp_expires_at': '',
                'reset_otp_sent_at': '',
            },
        },
    )
    _revoke_sessions(admin['_id'])
    return {'success': True, 'message': 'Password reset successfully. Please log in with the new password.'}


def change_password(auth_context: dict[str, Any], current_password: str, new_password: str):
    _validate_password(new_password)
    admin = auth_context['admin']
    if not _verify_secret(current_password, admin.get('password_hash'), admin.get('password_salt')):
        raise HTTPException(status_code=400, detail='Current password is incorrect')

    password_hash, password_salt = _hash_secret(new_password.strip())
    ADMINS.update_one(
        {'_id': admin['_id']},
        {
            '$set': {
                'password_hash': password_hash,
                'password_salt': password_salt,
                'password_updated_at': utcnow_iso(),
                'updated_at': utcnow_iso(),
            },
            '$unset': {
                'reset_otp_hash': '',
                'reset_otp_salt': '',
                'reset_otp_expires_at': '',
                'reset_otp_sent_at': '',
            },
        },
    )
    _revoke_sessions(admin['_id'], keep_session_id=auth_context['session']['_id'])
    refreshed_admin = ADMINS.find_one({'_id': admin['_id']}) or admin
    return {
        'success': True,
        'message': 'Password changed successfully.',
        'admin': _sanitize_admin(refreshed_admin).model_dump(),
    }
