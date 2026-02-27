import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Core swappable modules and routing
from api.auth import router as auth_router
from api.routes.datasets import router as datasets_router
from api.routes import query
from api.routes import narrative

# Database orchestration
from api.database import engine
import models 

# 1. Observability: Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# Create the background task scheduler
scheduler = AsyncIOScheduler()

# 2. Async Context Manager for Lifespan events
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing High-Performance Analytical SaaS...")
    
    # Ensure database schema is created (in production, use Alembic migrations instead)
    models.Base.metadata.create_all(bind=engine)
    logger.info("Database schemas validated.")
    
    # Start background scheduler for things like watchdog services or garbage collection
    scheduler.start()
    logger.info("Background task scheduler running.")
    
    yield # Hand control over to the application
    
    # Teardown logic
    scheduler.shutdown()
    logger.info("Shutting down ASGI application gracefully...")

# 3. Instantiate the ASGI App
app = FastAPI(
    title="Dataomen Analytical API",
    description="High-performance, multi-tenant backend orchestrated with FastAPI",
    version="1.0.0",
    lifespan=lifespan
)

# 4. Configure Multi-Tenant / Cross-Origin Security
# NOTE: Update allow_origins to match your frontend domain in production (e.g., ["https://app.dataomen.com"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 5. Include your modular routes (API Layer)
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication & Identity"])
app.include_router(datasets_router, prefix="/api/datasets", tags=["Dataset Management"])

# Guarding against missing files during refactoring: only include if they exist
try:
    app.include_router(query.router, prefix="/api/query", tags=["DuckDB Analytical Engine"])
except AttributeError:
    logger.warning("Query router not found. Skipping DuckDB analytics layer.")

try:
    app.include_router(narrative.router, prefix="/api/narrative", tags=["LLM Contextual RAG"])
except AttributeError:
    logger.warning("Narrative router not found. Skipping LLM narrative layer.")

# 6. Observability Healthcheck
@app.get("/health", tags=["System Observability"])
def health_check():
    """Validates that the Uvicorn worker is actively accepting connections."""
    return {
        "status": "healthy", 
        "orchestration_layer": "active",
        "message": "Dataomen API is running."
    }