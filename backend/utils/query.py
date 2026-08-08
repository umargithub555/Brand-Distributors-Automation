from typing import Optional


def build_search_query(base_query: dict, q: Optional[str], fields: list[str]) -> dict:
    query = dict(base_query)
    if q:
        query['$or'] = [{field: {'$regex': q, '$options': 'i'}} for field in fields]
    return query
