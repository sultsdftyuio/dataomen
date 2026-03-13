# main.py

import logging
import time
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Core Database Orchestration
from api.database import init_db

# Configure logging for orchestrated observation
# Force stream=sys.stdout to ensure logs flush instantly to Render's dashboard
import sys
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
    spin up cleanly and ensure schema integrity (pgvector) on boot.
    """
    logger.info("🚀 Data Omen Engine initializing...")
    try:
        # 1. Sync Database Schema and ensure pgvector extension
        init_db()
        logger.info("✅ Database infrastructure synchronized.")
        
        # 2. Add other shared resource initialization here
        yield
        
    except Exception as e:
        logger.critical(f"🛑 FATAL STARTUP ERROR: {str(e)}")
        # Allow the process to die so Render can attempt a clean restart
        raise
    finally:
        logger.info("🔌 Shutting down Engine... Cleaning up resources.")

app = FastAPI(
    title="Data Omen Engine",
    description="High-performance multi-tenant analytical API engine.",
    version="1.0.0",
    lifespan=lifespan
)

# ------------------------------------------------------------------------------
# 3. Security by Design: Dynamic CORS Policy
# ------------------------------------------------------------------------------
raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
origins = [origin.strip() for origin in raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# 4. Observability Middleware (Hybrid Performance Paradigm)
# ------------------------------------------------------------------------------
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    
    # Log telemetry for orchestration layer observability
    logger.info(f"{request.method} {request.url.path} - {response.status_code} processed in {process_time:.4f}s")
    return response

# ------------------------------------------------------------------------------
# 5. Global Anomaly Handling
# ------------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log full stack trace for engineering, but mask details from end-users
    logger.error(f"❌ Unhandled Exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal system anomaly was detected. Our engineers have been notified."},
    )

# ------------------------------------------------------------------------------
# 6. Defensive Route Orchestration
# ------------------------------------------------------------------------------
# We wrap these in a function or include them after initial imports to prevent
# one bad sub-module import from killing the entire server's ability to boot.
def register_routes(app: FastAPI):
    from api.routes import agents, datasets, query, narrative, chat
    
    app.include_router(agents.router)
    app.include_router(datasets.router)
    app.include_router(query.router)
    app.include_router(narrative.router)
    app.include_router(chat.router)
    logger.info("🗺️ Modular routes registered.")

try:
    register_routes(app)
except ImportError as ie:
    logger.error(f"🚨 CRITICAL IMPORT ERROR: A route module failed to load. {ie}")
    # We do NOT raise here, allowing the /health check to remain alive 
    # so you can debug the dashboard logs without constant Status 1 reboots.

# ------------------------------------------------------------------------------
# 7. Dynamic Health Check
# ------------------------------------------------------------------------------
@app.get("/health", tags=["System"])
async def health_check():
    """System heartbeat used by Render to verify instance stability."""
    return {
        "status": "optimal",
        "environment": os.environ.get("ENVIRONMENT", "production"),
        "timestamp": time.time()
    }

if __name__ == "__main__":
    import uvicorn
    # Local development entrypoint
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)