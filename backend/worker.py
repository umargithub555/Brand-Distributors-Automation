from datetime import timedelta

from bson import ObjectId

from backend.core.config import get_settings
from backend.core.database import db
from backend.services.distributor_outreach import mark_target_sending, update_target_after_send
from backend.services.emailing import send_email_message_sync

_settings = get_settings()
TARGETS = db['DistributorEmailTargets']


async def send_distributor_outreach_email(ctx, campaign_id: str, target_id: str):
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
        if current_attempts < _settings.outreach_max_attempts:
            TARGETS.update_one(
                {'_id': target['_id']},
                {'$set': {'status': 'retry_scheduled', 'last_error': error_message, 'updated_at': target.get('updated_at')}}
            )
            raise Retry(defer=timedelta(seconds=_settings.outreach_retry_delay_seconds)) from exc

        update_target_after_send(target['_id'], success=False, error=error_message)
        return {'success': False, 'target_id': target_id, 'error': error_message}


class WorkerSettings:
    functions = [send_distributor_outreach_email]
    max_jobs = 3

