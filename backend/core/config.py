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
    structuring_model: str
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
    redis_url: str
    outreach_send_delay_seconds: int
    outreach_retry_delay_seconds: int
    outreach_max_attempts: int
    brand_processing_max_parallel: int
    outreach_worker_max_parallel: int
    worker_max_jobs: int
    worker_job_timeout_seconds: int
    default_admin_email: str
    default_admin_password: str
    SESSION_TTL_DAYS: int
    SESSION_IDLE_TIMEOUT_MINUTES: int
    OTP_TTL_MINUTES: int
    PBKDF2_ROUNDS: int
    MIN_PASSWORD_LENGTH: int


def _to_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


@lru_cache
def get_settings() -> Settings:
    brand_processing_max_parallel = int(os.getenv('BRAND_PROCESSING_MAX_PARALLEL', '2'))
    outreach_worker_max_parallel = int(os.getenv('OUTREACH_WORKER_MAX_PARALLEL', '3'))
    worker_max_jobs = int(os.getenv('WORKER_MAX_JOBS', str(max(brand_processing_max_parallel + outreach_worker_max_parallel, 5))))
    return Settings(
        app_name=os.getenv('APP_NAME', 'Brand Intelligence API'),
        mongo_url=os.getenv('MONGO_URL', ''),
        mongo_db_name=os.getenv('MONGO_DB_NAME', 'BrandsDB'),
        brand_gemini_api_key=os.getenv('COMPANY_GEMINI_API_KEY', ''),
        research_model=os.getenv('RESEARCH_MODEL', 'gemini-3-flash-preview'),
        structuring_model=os.getenv('STRUCTURING_MODEL', 'gemini-3.1-flash-lite'),
        research_timeout_seconds=float(os.getenv('RESEARCH_TIMEOUT_SECONDS', '180')),
        structure_timeout_seconds=float(os.getenv('STRUCTURE_TIMEOUT_SECONDS', '150')),
        smtp_host=os.getenv('SMTP_HOST'),
        smtp_port=int(os.getenv('SMTP_PORT', '587')),
        smtp_username=os.getenv('SMTP_USERNAME'),
        smtp_password=os.getenv('SMTP_PASSWORD'),
        smtp_from_email=os.getenv('SMTP_FROM_EMAIL'),
        smtp_from_name=os.getenv('SMTP_FROM_NAME', 'Brand Intelligence'),
        smtp_use_tls=_to_bool(os.getenv('SMTP_USE_TLS'), True),
        smtp_use_ssl=_to_bool(os.getenv('SMTP_USE_SSL'), False),
        redis_url=os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
        outreach_send_delay_seconds=int(os.getenv('OUTREACH_SEND_DELAY_SECONDS', '45')),
        outreach_retry_delay_seconds=int(os.getenv('OUTREACH_RETRY_DELAY_SECONDS', '300')),
        outreach_max_attempts=int(os.getenv('OUTREACH_MAX_ATTEMPTS', '3')),
        brand_processing_max_parallel=brand_processing_max_parallel,
        outreach_worker_max_parallel=outreach_worker_max_parallel,
        worker_max_jobs=worker_max_jobs,
        worker_job_timeout_seconds=int(os.getenv('WORKER_JOB_TIMEOUT_SECONDS', '1800')),
        default_admin_email=os.getenv('DEFAULT_ADMIN_EMAIL'),
        default_admin_password=os.getenv('DEFAULT_ADMIN_PASSWORD'),
        SESSION_TTL_DAYS=int(os.getenv('SESSION_TTL_DAYS', '3')),
        SESSION_IDLE_TIMEOUT_MINUTES=int(os.getenv('SESSION_IDLE_TIMEOUT_MINUTES', '30')),
        OTP_TTL_MINUTES=int(os.getenv('OTP_TTL_MINUTES', '10')),
        PBKDF2_ROUNDS=int(os.getenv('PBKDF2_ROUNDS', '120000')),
        MIN_PASSWORD_LENGTH=int(os.getenv('MIN_PASSWORD_LENGTH', '8')),
    )
