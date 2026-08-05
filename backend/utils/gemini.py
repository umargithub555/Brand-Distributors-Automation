import asyncio
import time

from fastapi import HTTPException
from google import genai

from backend.core.config import get_settings

_settings = get_settings()
_client = genai.Client(api_key=_settings.brand_gemini_api_key)


async def generate_with_timeout(label: str, timeout_seconds: float, **kwargs):
    start = time.perf_counter()
    print(f'[research] starting {label} (timeout={timeout_seconds}s)')
    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(_client.models.generate_content, **kwargs),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        elapsed = time.perf_counter() - start
        print(f'[research] timed out during {label} after {elapsed:.2f}s')
        raise HTTPException(
            status_code=504,
            detail=f'Timed out during {label} after {timeout_seconds:.0f} seconds',
        ) from exc

    elapsed = time.perf_counter() - start
    print(f'[research] completed {label} in {elapsed:.2f}s')
    return response, elapsed
