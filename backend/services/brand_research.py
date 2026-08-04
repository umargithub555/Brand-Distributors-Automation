from fastapi import HTTPException
from google.genai.types import GenerateContentConfig, GoogleSearch, Tool

from backend.core.config import get_settings
from backend.models.schemas import DistributorRequest, Output


async def _noop_checkpoint():
    return None


from backend.utils.constants import REQUEST_TYPE_BRAND_DISTRIBUTOR_RESEARCH
from backend.utils.gemini import generate_with_timeout
from backend.utils.prompts import (
    build_brand_distributor_discovery_prompt,
    build_brand_distributor_enrichment_prompt,
    build_brand_profile_research_prompt,
    build_brand_research_prompt,
    build_brand_structuring_prompt,
)
from backend.utils.research_metrics import aggregate_metrics, build_step_metrics, persist_metrics_log
from backend.utils.time import utcnow_iso

_settings = get_settings()

VALID_RESEARCH_MODES = {'detailed', 'short'}


def _grounded_search_config() -> GenerateContentConfig:
    return GenerateContentConfig(
        tools=[Tool(google_search=GoogleSearch())],
        temperature=0,
    )


def _combine_research_notes(
    brand_profile_text: str,
    distributor_discovery_text: str,
    distributor_enrichment_text: str,
) -> str:
    return f"""
=== BRAND PROFILE RESEARCH ===
{brand_profile_text}

=== DISTRIBUTOR DISCOVERY RESEARCH ===
{distributor_discovery_text}

=== DISTRIBUTOR ENRICHMENT RESEARCH ===
{distributor_enrichment_text}
""".strip()


async def _run_short_research(req: DistributorRequest, step_metrics: list, checkpoint):
    await checkpoint()
    research_response, research_duration = await generate_with_timeout(
        'research step',
        _settings.research_timeout_seconds,
        model=_settings.research_model,
        contents=build_brand_research_prompt(req),
        config=_grounded_search_config(),
    )
    step_metrics.append(
        build_step_metrics('research step', _settings.research_model, research_response, research_duration)
    )
    research_text = research_response.text
    if not research_text:
        raise HTTPException(status_code=500, detail='Gemini returned no research content.')
    return research_text


async def _run_detailed_research(req: DistributorRequest, step_metrics: list, checkpoint):
    await checkpoint()
    brand_profile_response, brand_profile_duration = await generate_with_timeout(
        'brand profile research step',
        _settings.research_timeout_seconds,
        model=_settings.research_model,
        contents=build_brand_profile_research_prompt(req),
        config=_grounded_search_config(),
    )
    step_metrics.append(
        build_step_metrics(
            'brand profile research step',
            _settings.research_model,
            brand_profile_response,
            brand_profile_duration,
        )
    )
    brand_profile_text = brand_profile_response.text
    if not brand_profile_text:
        raise HTTPException(status_code=500, detail='Gemini returned no brand profile research content.')

    await checkpoint()
    distributor_discovery_response, distributor_discovery_duration = await generate_with_timeout(
        'distributor discovery research step',
        _settings.research_timeout_seconds,
        model=_settings.research_model,
        contents=build_brand_distributor_discovery_prompt(req, brand_profile_text),
        config=_grounded_search_config(),
    )
    step_metrics.append(
        build_step_metrics(
            'distributor discovery research step',
            _settings.research_model,
            distributor_discovery_response,
            distributor_discovery_duration,
        )
    )
    distributor_discovery_text = distributor_discovery_response.text
    if not distributor_discovery_text:
        raise HTTPException(status_code=500, detail='Gemini returned no distributor discovery content.')

    await checkpoint()
    distributor_enrichment_response, distributor_enrichment_duration = await generate_with_timeout(
        'distributor enrichment research step',
        _settings.research_timeout_seconds,
        model=_settings.research_model,
        contents=build_brand_distributor_enrichment_prompt(
            req,
            brand_profile_text,
            distributor_discovery_text,
        ),
        config=_grounded_search_config(),
    )
    step_metrics.append(
        build_step_metrics(
            'distributor enrichment research step',
            _settings.research_model,
            distributor_enrichment_response,
            distributor_enrichment_duration,
        )
    )
    distributor_enrichment_text = distributor_enrichment_response.text
    if not distributor_enrichment_text:
        raise HTTPException(status_code=500, detail='Gemini returned no distributor enrichment content.')

    return _combine_research_notes(
        brand_profile_text,
        distributor_discovery_text,
        distributor_enrichment_text,
    )


async def find_distributors(req: DistributorRequest, research_mode: str = 'short', checkpoint=None) -> Output:
    research_mode = (research_mode or 'short').strip().lower()
    if research_mode not in VALID_RESEARCH_MODES:
        raise HTTPException(status_code=400, detail=f'Invalid research_mode: {research_mode}')

    checkpoint = checkpoint or _noop_checkpoint
    print(f'Received request for brand: {req.brand}, country: {req.country}, mode: {research_mode}')
    started_at = utcnow_iso()
    step_metrics = []
    request_payload = {**req.model_dump(), 'research_mode': research_mode}

    try:
        # Legacy single-pass research flow preserved via the `short` mode for quick fallback.
        if research_mode == 'short':
            research_text = await _run_short_research(req, step_metrics, checkpoint)
        else:
            research_text = await _run_detailed_research(req, step_metrics, checkpoint)

        print(f"Research output: {research_text}")

        await checkpoint()
        structured_response, structuring_duration = await generate_with_timeout(
            'structuring step',
            _settings.structure_timeout_seconds,
            model=_settings.structuring_model,
            contents=build_brand_structuring_prompt(req, research_text),
            config=GenerateContentConfig(
                response_mime_type='application/json',
                response_schema=Output,
                temperature=0,
            ),
        )
        step_metrics.append(build_step_metrics('structuring step', _settings.structuring_model, structured_response, structuring_duration))

        if structured_response.parsed is None:
            raise HTTPException(status_code=500, detail='Gemini returned an invalid structured response.')

        completed_at = utcnow_iso()
        metrics = aggregate_metrics(
            request_type=REQUEST_TYPE_BRAND_DISTRIBUTOR_RESEARCH,
            model=_settings.research_model,
            started_at=started_at,
            completed_at=completed_at,
            status='success',
            step_metrics=step_metrics,
        )
        metrics_log_id = persist_metrics_log(
            REQUEST_TYPE_BRAND_DISTRIBUTOR_RESEARCH,
            request_payload,
            metrics,
            created_at=utcnow_iso(),
        )
        print(f"Structuring Completed: {metrics_log_id}")
        metrics = metrics.model_copy(update={'metrics_log_id': metrics_log_id})
        return structured_response.parsed.model_copy(update={'research_metrics': metrics})
    except Exception as exc:
        completed_at = utcnow_iso()
        metrics = aggregate_metrics(
            request_type=REQUEST_TYPE_BRAND_DISTRIBUTOR_RESEARCH,
            model=_settings.research_model,
            started_at=started_at,
            completed_at=completed_at,
            status='failed',
            step_metrics=step_metrics,
            notes='Request failed after one or more Gemini calls. Partial metrics were still logged.',
        )
        persist_metrics_log(
            REQUEST_TYPE_BRAND_DISTRIBUTOR_RESEARCH,
            request_payload,
            metrics,
            error=str(exc),
            created_at=utcnow_iso(),
        )
        raise
