import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / '.env')


@dataclass(frozen=True)
class Settings:
    app_name: str
    mongo_url: str
    mongo_db_name: str
    brand_gemini_api_key: str
    research_model: str
    research_timeout_seconds: float
    structure_timeout_seconds: float
    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    smtp_password: str | None
    smtp_from_email: str | None
    smtp_from_name: str
    smtp_use_tls: bool
    smtp_use_ssl: bool


def _to_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


@lru_cache
def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv('APP_NAME', 'Brand Intelligence API'),
        mongo_url=os.getenv('MONGO_URL', ''),
        mongo_db_name=os.getenv('MONGO_DB_NAME', 'BrandsDB'),
        brand_gemini_api_key=os.getenv('BRAND_GEMINI_API_KEY', ''),
        research_model=os.getenv('RESEARCH_MODEL', 'gemini-2.5-flash'),
        research_timeout_seconds=float(os.getenv('RESEARCH_TIMEOUT_SECONDS', '150')),
        structure_timeout_seconds=float(os.getenv('STRUCTURE_TIMEOUT_SECONDS', '150')),
        smtp_host=os.getenv('SMTP_HOST'),
        smtp_port=int(os.getenv('SMTP_PORT', '587')),
        smtp_username=os.getenv('SMTP_USERNAME'),
        smtp_password=os.getenv('SMTP_PASSWORD'),
        smtp_from_email=os.getenv('SMTP_FROM_EMAIL'),
        smtp_from_name=os.getenv('SMTP_FROM_NAME', 'Brand Intelligence'),
        smtp_use_tls=_to_bool(os.getenv('SMTP_USE_TLS'), True),
        smtp_use_ssl=_to_bool(os.getenv('SMTP_USE_SSL'), False),
    )
