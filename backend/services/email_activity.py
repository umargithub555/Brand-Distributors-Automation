from backend.core.database import db
from backend.utils.mongo import encode_document
from backend.utils.query import build_search_query

BRANDS = db['Brands']
CAMPAIGNS = db['DistributorEmailCampaigns']
ATTEMPTS = db['DistributorEmailAttempts']
BRAND_ATTEMPTS = db['BrandEmailAttempts']


def get_email_activity_summary() -> dict:
    brand_sent = BRANDS.count_documents({'deleted': {'$ne': True}, 'email_sent': True})
    brand_pending = BRANDS.count_documents({'deleted': {'$ne': True}, 'processed': True, 'emails_found': True, 'email_sent': {'$ne': True}})
    brand_failed = BRAND_ATTEMPTS.count_documents({'success': False})
    distributor_attempts = ATTEMPTS.count_documents({})
    distributor_sent = ATTEMPTS.count_documents({'success': True})
    distributor_failed = ATTEMPTS.count_documents({'success': False})
    distributor_campaigns = CAMPAIGNS.count_documents({})
    return {
        'brand_emails_sent': brand_sent,
        'brand_emails_pending': brand_pending,
        'brand_emails_failed': brand_failed,
        'distributor_attempts': distributor_attempts,
        'distributor_sent': distributor_sent,
        'distributor_failed': distributor_failed,
        'distributor_campaigns': distributor_campaigns,
    }


def _list_brand_sent_records(q: str | None):
    query = build_search_query(
        {'deleted': {'$ne': True}, 'email_sent': True},
        q,
        ['brand', 'country', 'parent_company', 'email_sent_to', 'email_subject'],
    )
    items = list(
        BRANDS.find(
            query,
            {
                'brand': 1,
                'country': 1,
                'parent_company': 1,
                'email_sent_to': 1,
                'email_sent_type': 1,
                'email_sent_at': 1,
                'email_subject': 1,
                'email_body': 1,
                'brand_contact_page': 1,
                'parent_company_contact_page': 1,
                'official_website': 1,
            },
        ).sort('email_sent_at', -1)
    )
    normalized = []
    for item in items:
        normalized.append(
            {
                **item,
                'success': True,
                'error': None,
                'error_type': None,
                'created_at': item.get('email_sent_at'),
                'subject': item.get('email_subject'),
                'to_email': item.get('email_sent_to'),
                'email_type': item.get('email_sent_type'),
                'source_kind': 'brand_record',
            }
        )
    return normalized


def _list_brand_failed_attempts(q: str | None, error_type: str | None):
    base_query: dict = {'success': False}
    if error_type:
        base_query['error_type'] = error_type
    query = build_search_query(
        base_query,
        q,
        ['brand_name', 'country', 'parent_company', 'to_email', 'subject', 'error', 'error_type'],
    )
    return list(
        BRAND_ATTEMPTS.find(
            query,
            {
                'brand_id': 1,
                'brand_name': 1,
                'country': 1,
                'parent_company': 1,
                'to_email': 1,
                'email_type': 1,
                'subject': 1,
                'body': 1,
                'success': 1,
                'error': 1,
                'error_type': 1,
                'created_at': 1,
            },
        ).sort('created_at', -1)
    )


def list_brand_email_activity(q: str | None, success: bool | None, error_type: str | None, skip: int, limit: int) -> dict:
    if success is True:
        records = _list_brand_sent_records(q)
    elif success is False:
        records = _list_brand_failed_attempts(q, error_type)
    else:
        failed_records = _list_brand_failed_attempts(q, error_type)
        sent_records = _list_brand_sent_records(q)
        records = failed_records + sent_records

    def sort_key(item):
        return item.get('created_at') or item.get('email_sent_at') or ''

    records = sorted(records, key=sort_key, reverse=True)
    total = len(records)
    items = records[skip:skip + limit]
    return {
        'items': encode_document(items),
        'total': total,
        'skip': skip,
        'limit': limit,
    }


def list_distributor_email_activity(q: str | None, success: bool | None, error_type: str | None, skip: int, limit: int) -> dict:
    base_query: dict = {}
    if success is not None:
        base_query['success'] = success
    if error_type:
        base_query['error_type'] = error_type
    query = build_search_query(
        base_query,
        q,
        ['brand_name', 'distributor_name', 'to_email', 'subject', 'error', 'error_type'],
    )
    total = ATTEMPTS.count_documents(query)
    items = list(
        ATTEMPTS.find(
            query,
            {
                'brand_name': 1,
                'brand_id': 1,
                'distributor_name': 1,
                'to_email': 1,
                'attempt_number': 1,
                'subject': 1,
                'body': 1,
                'success': 1,
                'error': 1,
                'error_type': 1,
                'created_at': 1,
                'campaign_id': 1,
                'target_id': 1,
            },
        ).sort('created_at', -1).skip(skip).limit(limit)
    )
    return {
        'items': encode_document(items),
        'total': total,
        'skip': skip,
        'limit': limit,
    }
