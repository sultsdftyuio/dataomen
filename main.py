import logging
import time
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# 1. Modular Routing: Import distinct capability modules
from api.routes import agents, datasets, query, narrative, chat

# Configure logging for orchestrated observation
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 2. Lifecycle Management (Crucial for Gunicorn/Render)
# This ensures heavy analytical engines (DuckDB/Postgres pools) 
# spin up cleanly per-worker and tear down gracefully without memory leaks.
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Data Omen Engine... Initializing modular dependencies.")
    # Initialize shared resources here (e.g., DuckDB in-memory connections, Supabase client pools)
    yield
    logger.info("Shutting down Engine... Cleaning up resources.")
    # Close database connections here to prevent orphan processes and OOM kills on Render

app = FastAPI(
    title="Data Omen Engine",
    description="High-performance analytical API engine.",
    version="1.0.0",
    lifespan=lifespan
)

# 3. Security by Design: Dynamic CORS Policy
# Pulls from environment to ensure absolute security in production (Vercel -> Render)
# Format in Render Dashboard: ALLOWED_ORIGINS="https://your-app.vercel.app,http://localhost:3000"
raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
origins = [origin.strip() for origin in raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

# 4. Observability Middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    
    # Log path, method, and execution time (Orchestration Layer observability)
    logger.info(f"{request.method} {request.url.path} - Processed in {process_time:.4f}s")
    return response

# 5. Global Anomaly Handling
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Capturing full stack trace in logs for debugging, but hiding from end-user to prevent data leaks
    logger.error(f"Unhandled Exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal system anomaly was detected. Our engineers have been notified."},
    )

# 6. Route Orchestration
try:
    app.include_router(agents.router)
except ImportError:
    logger.warning("api.routes.agents module not found. Skipping registration.")

app.include_router(datasets.router)
app.include_router(query.router)
app.include_router(narrative.router)
app.include_router(chat.router)

# 7. Dynamic Health Check
@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "optimal",
        "environment": os.environ.get("ENVIRONMENT", "development"),
        "timestamp": time.time()
    }

if __name__ == "__main__":
    import uvicorn
    # Note: In Render production, Gunicorn will bypass this block entirely and load `app` directly.
    # This block is strictly for local engineering.
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)