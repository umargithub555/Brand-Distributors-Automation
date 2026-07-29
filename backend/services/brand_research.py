from fastapi import HTTPException
from google.genai.types import GenerateContentConfig, GoogleSearch, Tool

from backend.core.config import get_settings
from backend.models.schemas import DistributorRequest, Output
from backend.utils.constants import REQUEST_TYPE_BRAND_DISTRIBUTOR_RESEARCH
from backend.utils.gemini import generate_with_timeout
from backend.utils.prompts import build_brand_research_prompt, build_brand_structuring_prompt
from backend.utils.research_metrics import aggregate_metrics, build_step_metrics, persist_metrics_log
from backend.utils.time import utcnow_iso

_settings = get_settings()


async def find_distributors(req: DistributorRequest) -> Output:
    print(f'Received request for brand: {req.brand}, country: {req.country}')
    started_at = utcnow_iso()
    step_metrics = []
    request_payload = req.model_dump()

    try:
        research_response, research_duration = await generate_with_timeout(
            'research step',
            _settings.research_timeout_seconds,
            model=_settings.research_model,
            contents=build_brand_research_prompt(req),
            config=GenerateContentConfig(
                tools=[Tool(google_search=GoogleSearch())],
                temperature=0,
            ),
        )
        step_metrics.append(build_step_metrics('research step', _settings.research_model, research_response, research_duration))

        research_text = research_response.text
        if not research_text:
            raise HTTPException(status_code=500, detail='Gemini returned no research content.')

        structured_response, structuring_duration = await generate_with_timeout(
            'structuring step',
            _settings.structure_timeout_seconds,
            model=_settings.research_model,
            contents=build_brand_structuring_prompt(req, research_text),
            config=GenerateContentConfig(
                response_mime_type='application/json',
                response_schema=Output,
                temperature=0,
            ),
        )
        step_metrics.append(build_step_metrics('structuring step', _settings.research_model, structured_response, structuring_duration))

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
