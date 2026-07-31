import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.api.routes.brands import router as brands_router
from backend.api.routes.email_activity import router as email_activity_router
from backend.api.routes.health import router as health_router
from backend.api.routes.research import router as research_router
from backend.api.routes.settings import router as settings_router
from backend.core.config import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(health_router)
app.include_router(research_router)
app.include_router(brands_router)
app.include_router(email_activity_router)
app.include_router(settings_router)
