from html import unescape
from urllib.parse import parse_qs, urlparse

from backend.core.database import db
from backend.models.schemas import ResearchRunMetrics, ResearchStepMetrics
from backend.utils.constants import GEMINI_STANDARD_PRICING


def safe_get(obj, *names, default=None):
    if obj is None:
        return default
    for name in names:
        if isinstance(obj, dict) and name in obj:
            return obj[name]
        if hasattr(obj, name):
            return getattr(obj, name)
    return default


def round_currency(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 6)


def dedupe_preserve_order(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def get_model_pricing(model: str) -> dict | None:
    lowered = model.lower()
    if lowered in GEMINI_STANDARD_PRICING:
        return GEMINI_STANDARD_PRICING[lowered]
    for key, pricing in GEMINI_STANDARD_PRICING.items():
        if lowered.startswith(key):
            return pricing
    return None


def extract_usage_counts(response) -> tuple[int, int, int]:
    usage = safe_get(response, 'usage_metadata', 'usageMetadata')
    prompt_tokens = int(safe_get(usage, 'prompt_token_count', 'promptTokenCount', default=0) or 0)
    candidate_tokens = int(safe_get(usage, 'candidates_token_count', 'candidatesTokenCount', default=0) or 0)
    total_tokens = int(safe_get(usage, 'total_token_count', 'totalTokenCount', default=0) or 0)
    if total_tokens == 0:
        total_tokens = prompt_tokens + candidate_tokens
    return prompt_tokens, candidate_tokens, total_tokens



def _normalize_query_value(query) -> str:
    if isinstance(query, str):
        return query.strip()
    raw_value = safe_get(query, 'query', 'text', default='')
    return str(raw_value).strip()



def _extract_queries_from_grounding(grounding) -> list[str]:
    if grounding is None:
        return []

    queries: list[str] = []
    web_queries = safe_get(grounding, 'web_search_queries', 'webSearchQueries', default=[]) or []
    for query in web_queries:
        value = _normalize_query_value(query)
        if value:
            queries.append(value)

    if queries:
        return queries

    search_entry_point = safe_get(grounding, 'search_entry_point', 'searchEntryPoint')
    rendered_content = safe_get(search_entry_point, 'rendered_content', 'renderedContent', default='') or ''
    if not rendered_content:
        return []

    for token in rendered_content.split('href="'):
        if not token.startswith('http'):
            continue
        href = token.split('"', 1)[0]
        parsed = urlparse(unescape(href))
        query_value = parse_qs(parsed.query).get('q', [''])[0].strip()
        if query_value:
            queries.append(query_value)

    return queries



def extract_web_search_queries(response) -> list[str]:
    queries: list[str] = []

    top_level_grounding = safe_get(response, 'grounding_metadata', 'groundingMetadata')
    queries.extend(_extract_queries_from_grounding(top_level_grounding))

    candidates = safe_get(response, 'candidates', default=[]) or []
    for candidate in candidates:
        grounding = safe_get(candidate, 'grounding_metadata', 'groundingMetadata')
        queries.extend(_extract_queries_from_grounding(grounding))

    return dedupe_preserve_order(queries)



def estimate_costs(model: str, prompt_tokens: int, candidate_tokens: int, grounding_search_queries: int):
    pricing = get_model_pricing(model)
    if pricing is None:
        return {
            'grounding_billing_mode': 'unknown',
            'billable_grounding_units': 0,
            'estimated_input_cost_usd': None,
            'estimated_output_cost_usd': None,
            'estimated_grounding_cost_usd': 0.0,
            'estimated_total_cost_usd': None,
        }

    estimated_input_cost = (prompt_tokens / 1_000_000) * pricing['input_per_1m']
    estimated_output_cost = (candidate_tokens / 1_000_000) * pricing['output_per_1m']
    grounding_billing_mode = pricing['grounding_mode']
    if grounding_billing_mode == 'search_query':
        billable_grounding_units = grounding_search_queries
    else:
        billable_grounding_units = 1 if grounding_search_queries > 0 else 0
    estimated_grounding_cost = billable_grounding_units * pricing['grounding_unit_cost']
    estimated_total_cost = estimated_input_cost + estimated_output_cost + estimated_grounding_cost
    return {
        'grounding_billing_mode': grounding_billing_mode,
        'billable_grounding_units': billable_grounding_units,
        'estimated_input_cost_usd': round_currency(estimated_input_cost),
        'estimated_output_cost_usd': round_currency(estimated_output_cost),
        'estimated_grounding_cost_usd': round_currency(estimated_grounding_cost) or 0.0,
        'estimated_total_cost_usd': round_currency(estimated_total_cost),
    }



def build_step_metrics(label: str, model: str, response, duration_seconds: float) -> ResearchStepMetrics:
    prompt_tokens, candidate_tokens, total_tokens = extract_usage_counts(response)
    web_search_queries = extract_web_search_queries(response)
    grounding_search_queries = len(web_search_queries)
    estimates = estimate_costs(model, prompt_tokens, candidate_tokens, grounding_search_queries)
    return ResearchStepMetrics(
        label=label,
        model=model,
        duration_seconds=round(duration_seconds, 3),
        prompt_tokens=prompt_tokens,
        candidate_tokens=candidate_tokens,
        total_tokens=total_tokens,
        grounding_billing_mode=estimates['grounding_billing_mode'],
        grounding_search_queries=grounding_search_queries,
        billable_grounding_units=estimates['billable_grounding_units'],
        web_search_queries=web_search_queries,
        estimated_input_cost_usd=estimates['estimated_input_cost_usd'],
        estimated_output_cost_usd=estimates['estimated_output_cost_usd'],
        estimated_grounding_cost_usd=estimates['estimated_grounding_cost_usd'],
        estimated_total_cost_usd=estimates['estimated_total_cost_usd'],
    )



def aggregate_metrics(
    request_type: str,
    model: str,
    started_at: str,
    completed_at: str,
    status: str,
    step_metrics: list[ResearchStepMetrics],
    metrics_log_id: str | None = None,
    notes: str | None = None,
) -> ResearchRunMetrics:
    prompt_tokens = sum(step.prompt_tokens for step in step_metrics)
    candidate_tokens = sum(step.candidate_tokens for step in step_metrics)
    total_tokens = sum(step.total_tokens for step in step_metrics)
    grounding_search_queries = sum(step.grounding_search_queries for step in step_metrics)
    billable_grounding_units = sum(step.billable_grounding_units for step in step_metrics)
    web_search_queries = dedupe_preserve_order([query for step in step_metrics for query in step.web_search_queries])

    estimated_input_cost = sum((step.estimated_input_cost_usd or 0) for step in step_metrics)
    estimated_output_cost = sum((step.estimated_output_cost_usd or 0) for step in step_metrics)
    estimated_grounding_cost = sum((step.estimated_grounding_cost_usd or 0) for step in step_metrics)
    estimated_total_cost = sum((step.estimated_total_cost_usd or 0) for step in step_metrics)

    pricing = get_model_pricing(model)
    grounding_billing_mode = pricing['grounding_mode'] if pricing else 'unknown'
    notes_value = notes
    if pricing is None:
        notes_value = 'Token cost estimate unavailable for this model. Search-query logging still reflects observed grounding usage.'

    return ResearchRunMetrics(
        request_type=request_type,
        model=model,
        pricing_tier='standard',
        status=status,
        started_at=started_at,
        completed_at=completed_at,
        prompt_tokens=prompt_tokens,
        candidate_tokens=candidate_tokens,
        total_tokens=total_tokens,
        grounding_billing_mode=grounding_billing_mode,
        grounding_search_queries=grounding_search_queries,
        billable_grounding_units=billable_grounding_units,
        web_search_queries=web_search_queries,
        estimated_input_cost_usd=round_currency(estimated_input_cost),
        estimated_output_cost_usd=round_currency(estimated_output_cost),
        estimated_grounding_cost_usd=round_currency(estimated_grounding_cost) or 0.0,
        estimated_total_cost_usd=round_currency(estimated_total_cost),
        steps=step_metrics,
        metrics_log_id=metrics_log_id,
        notes=notes_value,
    )



def persist_metrics_log(
    request_type: str,
    request_payload: dict,
    metrics: ResearchRunMetrics,
    error: str | None = None,
    created_at: str | None = None,
) -> str:
    document = {
        'request_type': request_type,
        'request_payload': request_payload,
        'model': metrics.model,
        'pricing_tier': metrics.pricing_tier,
        'status': metrics.status,
        'started_at': metrics.started_at,
        'completed_at': metrics.completed_at,
        'prompt_tokens': metrics.prompt_tokens,
        'candidate_tokens': metrics.candidate_tokens,
        'total_tokens': metrics.total_tokens,
        'grounding_billing_mode': metrics.grounding_billing_mode,
        'grounding_search_queries': metrics.grounding_search_queries,
        'billable_grounding_units': metrics.billable_grounding_units,
        'web_search_queries': metrics.web_search_queries,
        'estimated_input_cost_usd': metrics.estimated_input_cost_usd,
        'estimated_output_cost_usd': metrics.estimated_output_cost_usd,
        'estimated_grounding_cost_usd': metrics.estimated_grounding_cost_usd,
        'estimated_total_cost_usd': metrics.estimated_total_cost_usd,
        'steps': [step.model_dump() for step in metrics.steps],
        'notes': metrics.notes,
        'error': error,
        'created_at': created_at,
    }
    result = db['ResearchMetrics'].insert_one(document)
    return str(result.inserted_id)
