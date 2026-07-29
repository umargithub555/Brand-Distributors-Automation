from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException

from backend.core.database import db
from backend.models.schemas import BulkUploadRequest, DistributorRequest, Output
from backend.services.research import find_distributors
from backend.utils.mongo import encode_document
from backend.utils.query import build_search_query


async def list_processed_brands(email_sent, distributors_found, emails_found, q, skip, limit):
    query = {'processed': True}
    if email_sent is not None:
        query['email_sent'] = email_sent
    if distributors_found is not None:
        query['distributors_found'] = distributors_found
    if emails_found is not None:
        query['emails_found'] = emails_found
    query = build_search_query(query, q, ['brand', 'country', 'parent_company'])

    total = db['Brands'].count_documents(query)
    items = list(db['Brands'].find(query).sort('processed_at', -1).skip(skip).limit(limit))
    return {
        'items': encode_document(items),
        'total': total,
        'skip': skip,
        'limit': limit,
    }


def get_stats():
    total_records = db['Brands'].count_documents({})
    total = db['Brands'].count_documents({'processed': True})
    unprocessed = db['Brands'].count_documents({'processed': {'$ne': True}})
    distributors_found = db['Brands'].count_documents({'distributors_found': True})
    emails_found = db['Brands'].count_documents({'emails_found': True})
    email_sent = db['Brands'].count_documents({'email_sent': True})
    queued = db['Brands'].count_documents({'processing_status': 'queued'})
    running = db['Brands'].count_documents({'processing_status': 'running'})
    failed = db['Brands'].count_documents({'processing_status': 'failed'})
    ready_for_outreach = db['Brands'].count_documents(
        {'processed': True, 'emails_found': True, 'email_sent': {'$ne': True}}
    )
    return {
        'total_records': total_records,
        'total': total,
        'unprocessed': unprocessed,
        'distributors_found': distributors_found,
        'emails_found': emails_found,
        'email_sent': email_sent,
        'pending_emails': emails_found - email_sent,
        'queued': queued,
        'running': running,
        'failed': failed,
        'ready_for_outreach': ready_for_outreach,
    }


def bulk_upload_brands(payload: BulkUploadRequest):
    if not payload.brands:
        raise HTTPException(status_code=400, detail='No brands provided')

    inserted = []
    skipped = []
    for item in payload.brands:
        existing = db['Brands'].find_one({'brand': item.brand})
        if existing:
            skipped.append(item.brand)
            continue

        doc = {
            'brand': item.brand,
            'country': item.country,
            'processed': False,
            'processing_status': 'idle',
            'created_at': datetime.now(timezone.utc).isoformat(),
        }
        result = db['Brands'].insert_one(doc)
        inserted.append(str(result.inserted_id))

    return {'inserted': len(inserted), 'skipped': len(skipped), 'ids': inserted}


def list_queue_brands(q, processed, skip, limit):
    query = {}
    if processed is not None:
        query['processed'] = processed
    query = build_search_query(query, q, ['brand', 'country'])

    total = db['Brands'].count_documents(query)
    items = list(db['Brands'].find(query).sort('created_at', -1).skip(skip).limit(limit))
    return {
        'items': encode_document(items),
        'total': total,
        'skip': skip,
        'limit': limit,
    }


def delete_brand(brand_id: str):
    try:
        oid = ObjectId(brand_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid brand ID') from exc

    result = db['Brands'].delete_one({'_id': oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Brand not found')
    return {'success': True, 'brand_id': brand_id}


def mark_brand_processed(brand_id: str):
    try:
        oid = ObjectId(brand_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid brand ID') from exc

    result = db['Brands'].update_one(
        {'_id': oid},
        {
            '$set': {
                'processed': True,
                'processing_status': 'completed',
                'processed_at': datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail='Brand not found')
    return {'success': True, 'brand_id': brand_id}


def _flatten_research_result(brand_id: str, output: Output) -> dict:
    distributors = output.distributors or []
    brand_emails = output.brand_emails or []
    brand_email = brand_emails[0] if brand_emails else None
    parent_email = output.parent_company_email or None
    return {
        'parent_company': output.parent_company,
        'official_website': output.official_website,
        'all_brand_emails': brand_emails,
        'brand_email': brand_email,
        'brand_phone': output.brand_phone,
        'brand_contact_page': output.brand_contact_page,
        'parent_company_contact_page': output.parent_company_contact_page,
        'parent_company_email': parent_email,
        'parent_company_email_type': output.parent_company_email_type,
        'distributors': [d.model_dump() for d in distributors],
        'distributors_found': len(distributors) > 0,
        'emails_found': brand_email is not None or parent_email is not None,
        'email_sent': False,
        'processed': True,
        'processing_status': 'completed',
        'processing_error': None,
        'processed_at': datetime.now(timezone.utc).isoformat(),
        'research_metrics': output.research_metrics.model_dump() if output.research_metrics else None,
    }


def _get_brand_or_404(brand_id: str):
    try:
        oid = ObjectId(brand_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='Invalid brand ID') from exc

    brand = db['Brands'].find_one({'_id': oid})
    if not brand:
        raise HTTPException(status_code=404, detail='Brand not found')
    return oid, brand


def queue_brand_processing(brand_id: str):
    oid, brand = _get_brand_or_404(brand_id)

    processing_status = brand.get('processing_status')
    if processing_status in {'queued', 'running'}:
        return {
            'success': True,
            'brand_id': brand_id,
            'brand_name': brand['brand'],
            'status': processing_status,
            'message': f'Brand processing is already {processing_status}.',
        }

    db['Brands'].update_one(
        {'_id': oid},
        {
            '$set': {
                'processed': False,
                'processing_status': 'queued',
                'processing_error': None,
                'processing_requested_at': datetime.now(timezone.utc).isoformat(),
            },
            '$unset': {'processed_at': ''},
        },
    )
    return {
        'success': True,
        'brand_id': brand_id,
        'brand_name': brand['brand'],
        'status': 'queued',
        'message': 'Brand processing queued successfully.',
    }


async def process_brand_in_background(brand_id: str):
    oid, brand = _get_brand_or_404(brand_id)

    db['Brands'].update_one(
        {'_id': oid},
        {
            '$set': {
                'processed': False,
                'processing_status': 'running',
                'processing_started_at': datetime.now(timezone.utc).isoformat(),
                'processing_error': None,
            }
        },
    )

    try:
        output = await find_distributors(
            DistributorRequest(brand=brand['brand'], country=brand.get('country', 'USA'))
        )
        update_doc = _flatten_research_result(brand_id, output)
        update_doc['processing_completed_at'] = datetime.now(timezone.utc).isoformat()
        db['Brands'].update_one({'_id': oid}, {'$set': update_doc})
    except Exception as exc:
        error_message = getattr(exc, 'detail', None) or str(exc)
        db['Brands'].update_one(
            {'_id': oid},
            {
                '$set': {
                    'processed': False,
                    'processing_status': 'failed',
                    'processing_error': error_message,
                    'processing_completed_at': datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        print(f"[brands] background processing failed for {brand.get('brand', brand_id)}: {error_message}")
        return
