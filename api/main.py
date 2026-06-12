import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import your route files (add others if needed)
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

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "https://arcli.tech,https://www.arcli.tech,http://localhost:3000",
    ).split(",")
    if origin.strip()
]

ALLOWED_ORIGIN_REGEX: Optional[str] = os.getenv("ALLOWED_ORIGIN_REGEX")

REQUIRED_ENV_VARS = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = [env_name for env_name in REQUIRED_ENV_VARS if not os.getenv(env_name)]

    if missing:
        raise RuntimeError(
            f"Missing required environment variables: {', '.join(missing)}"
        )

    logger.info("Arcli backend started (version=%s)", app.version)
    yield
    logger.info("Arcli backend stopped (version=%s)", app.version)

# Initialize the FastAPI App
app = FastAPI(
    title="Arcli Backend API",
    description="Python Web Service for Arcli queue and background tasks",
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Allow Vercel frontend to communicate with this backend securely
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Health check route (DigitalOcean uses this to verify the app is alive)
@app.get("/health", tags=["health"])
async def health_check():
    return {
        "status": "ok",
        "service": "arcli-backend",
        "version": app.version,
    }
app.include_router(api_keys.router)

@app.get("/", include_in_schema=False)
async def root():
    return {
        "service": "arcli-backend",
        "version": app.version,
    }


@app.get("/ready", include_in_schema=False)
async def ready():
    return {"status": "ready"}

# Register your specific routers
# (Make sure your route files actually define an APIRouter instance!)
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["webhooks"])
app.include_router(metrics.router, prefix="/api/v1/metrics", tags=["metrics"])
app.include_router(track.router, prefix="/api/v1/track", tags=["track"])
app.include_router(query.router, prefix="/api/v1/query", tags=["query"])

if __name__ == "__main__":
    import uvicorn

    # This allows you to run `python api/main.py` locally
    uvicorn.run("api.main:app", host="0.0.0.0", port=8080, reload=True)