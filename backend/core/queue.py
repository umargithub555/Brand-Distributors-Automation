from fastapi import HTTPException

from backend.core.config import get_settings

_settings = get_settings()


async def get_arq_pool():
    try:
        from arq import create_pool
        from arq.connections import RedisSettings
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail="ARQ is not installed. Install it with 'pip install arq redis'.",
        ) from exc

    return await create_pool(RedisSettings.from_dsn(_settings.redis_url))
