import base64
import hashlib

from fastapi import HTTPException

try:
    from cryptography.fernet import Fernet, InvalidToken
except ImportError:  # pragma: no cover - dependency is declared for runtime.
    Fernet = None
    InvalidToken = Exception

_SECRET_PREFIX = 'fernet:'


def _derive_fernet_key(secret: str) -> bytes:
    digest = hashlib.sha256(secret.encode('utf-8')).digest()
    return base64.urlsafe_b64encode(digest)


def _build_cipher(secret: str | None):
    if not secret or not secret.strip():
        raise HTTPException(
            status_code=500,
            detail='SMTP encryption key is not configured. Set SMTP_ENCRYPTION_KEY or APP_ENCRYPTION_KEY.',
        )
    if Fernet is None:
        raise HTTPException(
            status_code=500,
            detail='cryptography package is required for encrypted SMTP password storage.',
        )

    raw_secret = secret.strip()
    try:
        return Fernet(raw_secret.encode('utf-8'))
    except Exception:
        return Fernet(_derive_fernet_key(raw_secret))


def encrypt_secret(value: str, secret: str | None) -> str:
    if not value:
        return ''
    cipher = _build_cipher(secret)
    token = cipher.encrypt(value.encode('utf-8')).decode('utf-8')
    return f'{_SECRET_PREFIX}{token}'


def decrypt_secret(value: str, secret: str | None) -> str:
    if not value:
        return ''
    if not value.startswith(_SECRET_PREFIX):
        return value

    cipher = _build_cipher(secret)
    token = value.removeprefix(_SECRET_PREFIX).encode('utf-8')
    try:
        return cipher.decrypt(token).decode('utf-8')
    except InvalidToken as exc:
        raise HTTPException(
            status_code=500,
            detail='Unable to decrypt stored SMTP password. Check SMTP_ENCRYPTION_KEY.',
        ) from exc
