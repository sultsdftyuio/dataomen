import logging
import time
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# 1. Modular Routing: Import domain-specific routers
from api.routes import datasets, query, narrative

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DataOmen Analytical API",
    description="High-performance backend powered by DuckDB and FastAPI",
    version="1.0.0"
)

# 2. Security by Design: Explicit CORS for Frontend-Backend separation (Vercel <-> Render)
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
allow_origins = [
    frontend_url,
    "https://dataomen.vercel.app", 
    "*" # Allows local dev & proxying seamlessly
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Request Profiling Middleware (Hybrid Performance Paradigm)
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    logger.info(f"{request.method} {request.url.path} completed in {process_time:.4f}s")
    return response

# Global Exception Handler ensures 500 errors don't crash the worker
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred.", "message": str(exc)},
    )

# 4. Route Registration
# IMPORTANT: By registering with prefix="/api/datasets", a route defined as "/upload" 
# inside datasets.py becomes perfectly accessible at "/api/datasets/upload"
app.include_router(datasets.router, prefix="/api/datasets", tags=["Datasets"])

# Include your other routers (ensure these files actually exist, or comment them out for now)
try:
    app.include_router(query.router, prefix="/api/query", tags=["Query"])
    app.include_router(narrative.router, prefix="/api/narrative", tags=["Narrative"])
except Exception as e:
    logger.warning(f"Could not load additional routers: {e}")

@app.get("/health", tags=["System"])
async def health_check():
    """
    Ping endpoint for Render zero-downtime deployments.
    """
    return {
        "status": "online",
        "engine": "ready",
        "timestamp": time.time()
    }