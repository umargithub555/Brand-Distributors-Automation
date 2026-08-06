import sys
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.api.routes.auth import router as auth_router
from backend.api.routes.brands import router as brands_router
from backend.api.routes.email_activity import router as email_activity_router
from backend.api.routes.health import router as health_router
from backend.api.routes.research import router as research_router
from backend.api.routes.settings import router as settings_router
from backend.core.config import get_settings
from backend.services.auth import ensure_admin_seeded, require_admin
from backend.services.brands import ensure_brand_indexes

settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.on_event('startup')
def seed_default_admin():
    ensure_admin_seeded()
    ensure_brand_indexes()


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(research_router, dependencies=[Depends(require_admin)])
app.include_router(brands_router, dependencies=[Depends(require_admin)])
app.include_router(email_activity_router, dependencies=[Depends(require_admin)])
app.include_router(settings_router, dependencies=[Depends(require_admin)])
