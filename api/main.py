import logging
import uuid
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Literal

from fastapi import FastAPI, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic_settings import BaseSettings, SettingsConfigDict
from supabase import create_client, Client

# Import your route files
from api.routes import api_keys, webhooks, metrics, track, query
from api import auth

logging.basicConfig(
    level=logging.INFO,
    format=(
        "%(asctime)s "
        "%(levelname)s "
        "%(name)s "
        "%(message)s"
    ),
)
logger = logging.getLogger(__name__)

APP_VERSION = "1.0.0"

# =========================================================================
# SETTINGS & CONFIGURATION (Pydantic Settings)
# =========================================================================
class Settings(BaseSettings):
    # Required strict string fields (fails fast on startup if missing)
    supabase_url: str
    supabase_service_role_key: str
    resend_api_key: str
    
    # Environment validation via Literal typing to prevent typos
    environment: Literal["production", "development", "staging", "local"] = "production"
    
    # Optional / defaulted fields
    allowed_origins: str = "https://arcli.tech,https://www.arcli.tech,http://localhost:3000"
    allowed_origin_regex: Optional[str] = None
    
    # If running ONLY behind a custom domain, remove *.ondigitalocean.app
    allowed_hosts: str = "api.arcli.tech,localhost,127.0.0.1,*.ondigitalocean.app"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def hosts_list(self) -> List[str]:
        return [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]

# Initialize settings immediately — fails fast if env vars are missing/invalid
try:
    settings = Settings()
except Exception as e:
    logger.error("Configuration error during initialization: %s", e)
    raise RuntimeError(f"Missing or invalid environment variables: {e}")

# =========================================================================
# LIFESPAN MANAGEMENT
# =========================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Startup logging for configuration visibility
    logger.info("Arcli backend starting (version=%s, env=%s)", app.version, settings.environment)
    logger.info("Allowed origins: %s", settings.cors_origins_list)
    logger.info("Origin regex configured: %s", bool(settings.allowed_origin_regex))
    logger.info("Allowed hosts: %s", settings.hosts_list)
    
    # 2. Cache a single Supabase Client globally to prevent per-request instantiation
    logger.info("Initializing global Supabase client...")
    app.state.supabase = create_client(
        settings.supabase_url, 
        settings.supabase_service_role_key
    )
    
    try:
        yield
    finally:
        logger.info("Shutting down Supabase client...")
        app.state.supabase.close()
    logger.info("Arcli backend stopped (version=%s)", app.version)

# Initialize the FastAPI App
app = FastAPI(
    title="Arcli Backend API",
    description="Python Web Service for Arcli queue and background tasks",
    version=APP_VERSION,
    # Disable schema scraping in production
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
    openapi_url="/openapi.json" if settings.environment != "production" else None,
    lifespan=lifespan,
)

# =========================================================================
# MIDDLEWARE (Order matters: outermost to innermost)
# =========================================================================

# 1. Trusted Host: Prevent Host Header Injection Attacks
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.hosts_list,
)

# 2. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=settings.allowed_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# NOTE: ProxyHeadersMiddleware removed. Only use it if you specifically need 
# to derive logic from proxy headers (like rate-limiting by X-Forwarded-For). 
# Otherwise, it exposes an unnecessary vector for IP spoofing.

# =========================================================================
# HEALTH & LIVENESS PROBES
# =========================================================================

@app.get("/health", tags=["health"])
async def health_check():
    """Liveness probe: proves the FastAPI process is running."""
    return {
        "status": "ok",
        "service": "arcli-backend",
        "version": app.version,
        "environment": settings.environment
    }

@app.get("/ready", tags=["health"])
async def ready_check():
    """Readiness probe: proves critical external dependencies are reachable."""
    dependencies: Dict[str, str] = {"supabase": "unknown"}
    status_code = status.HTTP_200_OK

    try:
        supabase: Client = app.state.supabase
        
        # Lightweight infrastructure check: look up a non-existent UUID.
        # Proves network, database, and auth service are reachable without 
        # relying on business tables (survives migrations).
        dummy_id = str(uuid.uuid4())
        supabase.auth.admin.get_user_by_id(dummy_id)
        
        # Technically reachable if no error, though we expect a 404
        dependencies["supabase"] = "connected"
        
    except Exception as e:
        # An AuthApiError stating "User not found" confirms successful connection + processing.
        if "not found" in str(e).lower() or getattr(e, "code", "") == "user_not_found":
            dependencies["supabase"] = "connected"
        else:
            logger.error("Supabase readiness check failed: %s", e)
            dependencies["supabase"] = "disconnected"
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if status_code == 200 else "degraded",
            "version": app.version,
            "dependencies": dependencies
        }
    )

@app.get("/", include_in_schema=False)
async def root():
    return {
        "service": "arcli-backend",
        "version": app.version,
    }

# =========================================================================
# ROUTER REGISTRATION
# =========================================================================

# api/main.py
app.include_router(api_keys.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
app.include_router(track.router, prefix="/api")
app.include_router(query.router, prefix="/api")
app.include_router(auth.router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    
    # Enforce safe reloading (Never reload in production to prevent memory leaks/restarts)
    is_dev = settings.environment in ("development", "local")
    
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8080,
        reload=is_dev,
    )