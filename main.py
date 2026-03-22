# main.py

import os
import sys
import logging
import time
import gc
from contextlib import asynccontextmanager

# ==============================================================================
# 0. C-LEVEL CONTAINER GUARDRAILS (CRITICAL FOR DIGITALOCEAN / CLOUD DEPLOYMENTS)
# ==============================================================================
# MUST BE SET BEFORE ANY NATIVE LIBRARIES (Polars, DuckDB, NumPy, PyTorch) ARE IMPORTED.
# These engines read the Host Node's resources and will instantly allocate massive 
# thread pools/buffers, causing an immediate OOM crash if not clamped.

# 1. Clamp thread pools to prevent CPU thrashing and per-thread memory bloat
os.environ.setdefault("POLARS_MAX_THREADS", "1")
os.environ.setdefault("DUCKDB_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

# 2. Fix Python memory leaks in containers: Force glibc to return freed RAM to the OS instantly
os.environ.setdefault("MALLOC_TRIM_THRESHOLD_", "100000")

# 3. Prevent ML libraries (transformers/faiss) from pre-allocating unused tensors
os.environ.setdefault("PYTORCH_NO_CUDA_MEMORY_CACHING", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

# ------------------------------------------------------------------------------
# 1. Observability Configuration
# ------------------------------------------------------------------------------
# We force stream=sys.stdout to ensure logs flush instantly to the cloud dashboard.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    stream=sys.stdout
)
logger = logging.getLogger("DataOmenAPI")

# ------------------------------------------------------------------------------
# 2. Lifecycle Management (The Modular Strategy)
# ------------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Ensures heavy analytical engines spin up cleanly.
    Forces a deep garbage collection cycle immediately after boot imports to 
    clear out transient import bloat before accepting traffic.
    """
    logger.info("🚀 Data Omen API initializing with Strict Container Guardrails...")
    
    try:
        from api.database import init_db
        init_db()
        logger.info("✅ Database infrastructure synchronized.")
    except Exception as e:
        logger.error(f"⚠️ Database Sync Failed on Boot: {str(e)}")
        # We do not exit here; in cloud cold-starts, the database might take 
        # a few extra seconds to become fully available.
    
    # Force OS to reclaim RAM from massive module imports
    gc.collect()
    logger.info("🧹 Boot-time Garbage Collection complete. Ready for traffic.")
    
    yield
    
    logger.info("🔌 Shutting down API... Cleaning up resources.")


app = FastAPI(
    title="Data Omen API",
    description="High-performance multi-tenant analytical API engine.",
    version="2.0.0",
    lifespan=lifespan
)

# ------------------------------------------------------------------------------
# 3. Dynamic Health Check (CRITICAL: Must be defined FIRST)
# ------------------------------------------------------------------------------
@app.get("/health", tags=["System"])
@app.get("/api/health", tags=["System"])
async def health_check():
    """
    System heartbeat used by DigitalOcean to verify instance stability.
    Defined at the top so it is instantly available before heavy routes load.
    """
    return {
        "status": "optimal",
        "environment": os.getenv("ENVIRONMENT", "production"),
        "timestamp": time.time(),
        "memory_guardrails_active": True
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
    # Lazy-loading routes prevents circular dependencies and isolates import crashes.
    # Because of our C-level guardrails at the top of the file, these heavy imports 
    # will no longer spike RAM during the module resolution phase.
    
    # FIXED: Removed 'semantic_metrics' which does not exist in api.routes
    # ADDED: Included 'billing' which is present in the file hierarchy
    from api.routes import agents, datasets, query, narrative, chat, webhooks, billing
    
    fastapi_app.include_router(agents.router)
    fastapi_app.include_router(datasets.router)
    fastapi_app.include_router(query.router)
    fastapi_app.include_router(narrative.router)
    fastapi_app.include_router(chat.router)
    fastapi_app.include_router(webhooks.router)
    fastapi_app.include_router(billing.router)
    
    logger.info("🗺️ Modular routes registered successfully.")

# CRITICAL FIX: If routes fail to load, the app MUST crash so DigitalOcean
# restarts the container and flags the deployment as failed.
register_routes(app)

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    
    # DigitalOcean injects the PORT dynamically. Default to 8080 if not found.
    port = int(os.getenv("PORT", "8080"))
    is_dev = os.getenv("ENVIRONMENT") == "development"
    
    # CRITICAL CLOUD FIX: Limit to 1 worker on standard cloud containers.
    # If Uvicorn or Gunicorn spawns multiple workers, the baseline RAM of imports
    # multiplies, causing an instant OOM on 512MB-1GB instances.
    workers = int(os.getenv("WEB_CONCURRENCY", "1"))
    
    logger.info(f"Starting API server on port {port} with {workers} worker(s)...")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=is_dev, workers=workers)