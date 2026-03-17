# main.py

import logging
import time
import os
import sys
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

# ------------------------------------------------------------------------------
# 1. Observability Configuration (Render Optimized)
# ------------------------------------------------------------------------------
# We force stream=sys.stdout to ensure logs flush instantly to the Render dashboard.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    stream=sys.stdout
)
logger = logging.getLogger("DataOmenEngine")

# ------------------------------------------------------------------------------
# 2. Lifecycle Management (The Modular Strategy)
# ------------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Ensures heavy analytical engines (DuckDB/Postgres pools) 
    spin up cleanly without blocking the health checks.
    """
    logger.info("🚀 Data Omen Engine initializing...")
    try:
        from api.database import init_db
        init_db()
        logger.info("✅ Database infrastructure synchronized.")
    except Exception as e:
        # Catch and log to keep the web server alive for Render health checks
        logger.error(f"⚠️ Database Sync Failed on Boot: {str(e)}")
        logger.error("⚠️ Check that DATABASE_URL is set in your Render Environment Variables.")
        
    yield
    
    logger.info("🔌 Shutting down Engine... Cleaning up resources.")


app = FastAPI(
    title="Data Omen Engine",
    description="High-performance multi-tenant analytical API engine.",
    version="1.2.0",
    lifespan=lifespan
)

# ------------------------------------------------------------------------------
# 3. Dynamic Health Check (CRITICAL: Must be defined FIRST)
# ------------------------------------------------------------------------------
@app.get("/health", tags=["System"])
async def health_check():
    """
    System heartbeat used by Render to verify instance stability.
    Defined at the top so it is instantly available before heavy routes load.
    """
    return {
        "status": "optimal",
        "environment": os.getenv("ENVIRONMENT", "production"),
        "timestamp": time.time()
    }

# ------------------------------------------------------------------------------
# 4. Security by Design: Dynamic & Multi-Tenant CORS Policy
# ------------------------------------------------------------------------------
raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

# Domain regex ensures future-proof compatibility for multi-tenant subdomains
# It safely allows: https://arcli.tech, https://app.arcli.tech, https://client1.arcli.tech
DOMAIN_REGEX = r"^https://([a-zA-Z0-9-]+\.)?arcli\.tech$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=DOMAIN_REGEX,  # Enables zero-config multi-tenant scaling
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

# PERFORMANCE: Compress analytical payloads to reduce latency and egress bandwidth
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ------------------------------------------------------------------------------
# 5. Global Telemetry & Security Middleware
# ------------------------------------------------------------------------------
@app.middleware("http")
async def add_telemetry_and_security_headers(request: Request, call_next):
    # UPGRADE: time.perf_counter() is strictly better than time.time() for benchmarking compute speed
    start_time = time.perf_counter()
    response = await call_next(request)
    process_time = time.perf_counter() - start_time
    
    # Inject execution time for frontend monitoring
    response.headers["X-Process-Time"] = f"{process_time:.5f}"
    
    # Defense-in-depth: Inject modern security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    
    # Enforce HTTPS on custom domains
    if os.getenv("ENVIRONMENT") != "development":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
    return response

# ------------------------------------------------------------------------------
# 6. Global Anomaly Handling
# ------------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Prevents raw Python stack traces from leaking to the frontend on 500s."""
    logger.error(f"❌ Unhandled Exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal system anomaly was detected. Our engineers have been notified."},
    )

# ------------------------------------------------------------------------------
# 7. Defensive Route Orchestration
# ------------------------------------------------------------------------------
def register_routes(fastapi_app: FastAPI) -> None:
    # Lazy-loading routes prevents circular dependencies and isolates import crashes
    from api.routes import agents, datasets, query, narrative, chat, webhooks
    
    fastapi_app.include_router(agents.router)
    fastapi_app.include_router(datasets.router)
    fastapi_app.include_router(query.router)
    fastapi_app.include_router(narrative.router)
    fastapi_app.include_router(chat.router)
    fastapi_app.include_router(webhooks.router)
    
    logger.info("🗺️ Modular routes registered successfully.")

try:
    register_routes(app)
except Exception as e:
    # Catch ALL errors (not just imports) so the container stays alive for debugging
    logger.critical("🚨 CRITICAL BOOT ERROR: A route module failed to load. Check your logs below.", exc_info=True)

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    # Cleaned up environment variable fetching and enabled dynamic reload for local dev
    port = int(os.getenv("PORT", "8000"))
    is_dev = os.getenv("ENVIRONMENT") == "development"
    
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=is_dev)