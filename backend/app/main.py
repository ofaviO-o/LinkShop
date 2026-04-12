from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.error_handlers import register_error_handlers
from app.api.middleware import RequestContextMiddleware
from app.api.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.session import SessionLocal
from app.integrations.registry import integration_registry


configure_logging(settings.log_level)

app = FastAPI(
    title=settings.app_name,
    debug=settings.app_debug,
    version="0.1.0",
)

app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://link-shop-navy.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_error_handlers(app)


@app.get("/", tags=["health"])
def root() -> dict[str, str]:
    return {"service": settings.app_name, "status": "ok"}


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
def readiness_check() -> JSONResponse:
    checks = {
        "database": "ok",
        "config": "ok",
        "integrations": "ok",
    }

    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
    except Exception:
        checks["database"] = "error"

    if not settings.auth_secret_key.get_secret_value().strip():
        checks["config"] = "error"

    if not integration_registry:
        checks["integrations"] = "error"

    status_code = 200 if all(value == "ok" for value in checks.values()) else 503
    payload = {
        "status": "ready" if status_code == 200 else "not_ready",
        "checks": checks,
        "meta": {
            "app_env": settings.app_env,
            "debug": settings.app_debug,
            "registered_integrations": len(integration_registry),
        },
    }
    return JSONResponse(payload, status_code=status_code)


app.include_router(api_router, prefix="/api")
