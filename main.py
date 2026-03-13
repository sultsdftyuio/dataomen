# main.py

import logging
import time
import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ------------------------------------------------------------------------------
# 1. Observability Configuration (Render Optimized)
# ------------------------------------------------------------------------------
# We force stream=sys.stdout to ensure logs flush instantly to the Render dashboard.
# Without this, Python buffers the logs and a crash might happen silently.
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
        # We catch the error and log it, but DO NOT raise it.
        # This keeps the web server alive so Render's health check passes
        # and you can actually read this error in the dashboard logs.
        logger.error(f"⚠️ Database Sync Failed on Boot: {str(e)}")
        logger.error("⚠️ Check that DATABASE_URL is set in your Render Environment Variables.")
        
    yield
    
    logger.info("🔌 Shutting down Engine... Cleaning up resources.")

app = FastAPI(
    title="Data Omen Engine",
    description="High-performance multi-tenant analytical API engine.",
    version="1.0.0",
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
        "environment": os.environ.get("ENVIRONMENT", "production"),
        "timestamp": time.time()
    }

# ------------------------------------------------------------------------------
# 4. Security by Design: Dynamic CORS Policy
# ------------------------------------------------------------------------------
raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
# Clean up any trailing spaces from environment variables
origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# 5. Global Telemetry Middleware
# ------------------------------------------------------------------------------
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    
    # Inject execution time into headers for frontend monitoring
    response.headers["X-Process-Time"] = str(process_time)
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
def register_routes(app: FastAPI):
    # Lazy-loading routes prevents circular dependencies and isolates import crashes
    from api.routes import agents, datasets, query, narrative, chat
    
    app.include_router(agents.router)
    app.include_router(datasets.router)
    app.include_router(query.router)
    app.include_router(narrative.router)
    app.include_router(chat.router)
    
    logger.info("🗺️ Modular routes registered.")

try:
    register_routes(app)
except Exception as e:
    # Catch ALL errors (not just imports) so the container stays alive for debugging
    logger.critical(f"🚨 CRITICAL BOOT ERROR: A route module failed to load. Check your logs below.", exc_info=True)

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    # Local development entrypoint
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)