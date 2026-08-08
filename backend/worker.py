import asyncio
from datetime import timedelta

from bson import ObjectId
from arq.connections import RedisSettings

from backend.core.config import get_settings
from backend.core.database import db
from backend.services.brands import process_brand_job
from backend.services.bulk_email import send_bulk_email_target
from backend.services.distributor_outreach import mark_target_sending, update_target_after_send
from backend.services.emailing import send_email_message_sync
from backend.utils.email_errors import classify_smtp_error

_settings = get_settings()
TARGETS = db['DistributorEmailTargets']
BRAND_PROCESSING_SEMAPHORE = asyncio.Semaphore(_settings.brand_processing_max_parallel)
DISTRIBUTOR_SEND_SEMAPHORE = asyncio.Semaphore(_settings.outreach_worker_max_parallel)


async def process_brand_research_job(ctx, brand_id: str, research_mode: str = 'short'):
    async with BRAND_PROCESSING_SEMAPHORE:
        return await process_brand_job(brand_id, research_mode)


async def send_distributor_outreach_email(ctx, campaign_id: str, target_id: str):
    async with DISTRIBUTOR_SEND_SEMAPHORE:
        try:
            from arq import Retry
        except ModuleNotFoundError as exc:
            raise RuntimeError("ARQ is not installed. Install it with 'pip install arq redis'.") from exc

        target = TARGETS.find_one({'_id': ObjectId(target_id)})
        if not target:
            return {'success': False, 'reason': 'target_not_found'}

        if target.get('status') == 'sent':
            return {'success': True, 'reason': 'already_sent'}

        if not target.get('to_email'):
            return {'success': False, 'reason': 'no_email'}

        mark_target_sending(target['_id'])

        try:
            send_email_message_sync(target['to_email'], target['subject'], target['body'])
            update_target_after_send(target['_id'], success=True)
            return {'success': True, 'target_id': target_id}
        except Exception as exc:
            current_attempts = int(target.get('attempt_count', 0)) + 1
            error_message = str(exc)
            error_type = classify_smtp_error(error_message)
            if current_attempts < _settings.outreach_max_attempts:
                TARGETS.update_one(
                    {'_id': target['_id']},
                    {'$set': {'status': 'retry_scheduled', 'last_error': error_message, 'last_error_type': error_type, 'updated_at': target.get('updated_at')}}
                )
                raise Retry(defer=timedelta(seconds=_settings.outreach_retry_delay_seconds)) from exc

            update_target_after_send(target['_id'], success=False, error=error_message, error_type=error_type)
            return {'success': False, 'target_id': target_id, 'error': error_message, 'error_type': error_type}


class WorkerSettings:
    functions = [send_distributor_outreach_email, send_bulk_email_target, process_brand_research_job]
    redis_settings = RedisSettings.from_dsn(_settings.redis_url)
    max_jobs = _settings.worker_max_jobs
    job_timeout = _settings.worker_job_timeout_seconds
