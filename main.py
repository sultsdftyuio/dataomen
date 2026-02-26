from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import logging

# Your existing imports
from api.auth import router as auth_router
from api.routes.datasets import router as datasets_router
from api.database import engine
from api.routes import query
from api.routes import narrative  
import models

# --- PHASE 4 IMPORTS ---
from api.services.anomaly_detector import AnomalyDetector
from api.services.watchdog_service import WatchdogService

# Setup basic logging to see the Watchdog on Render logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- PHASE 4 WATCHDOG SETUP ---
# In production, db_path might be your DuckDB instance file or an in-memory instance
anomaly_detector = AnomalyDetector(variance_threshold=0.20)
watchdog_service = WatchdogService(db_path=":memory:", anomaly_detector=anomaly_detector)

async def run_watchdog_job():
    """
    Wrapper function to pass active tasks to the Watchdog.
    In a real app, you would fetch these tasks from your PostgreSQL metadata DB.
    """
    logger.info("Watchdog woken up by APScheduler...")
    
    # Mock task list. You will eventually query this from your DB.
    mock_active_tasks = [
        # Example task: Check "total_sales" in "sales_data" for tenant "tenant_123"
        # {"tenant_id": "tenant_123", "dataset_name": "sales_data", "date_col": "date", "target_col": "total_sales"}
    ]
    
    await watchdog_service.run_nightly_scan(mock_active_tasks)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI Lifespan: Executes exactly once when the server starts, 
    and yields control. Executes the finally block when server stops.
    """
    logger.info("Starting up APScheduler...")
    scheduler = AsyncIOScheduler()
    
    # Schedule the Watchdog to run every day at 2:00 AM
    # For testing right now, you might want to use: trigger='interval', minutes=1
    scheduler.add_job(run_watchdog_job, trigger='cron', hour=2, minute=0)
    
    scheduler.start()
    
    yield # App runs here
    
    logger.info("Shutting down APScheduler...")
    scheduler.shutdown()

# Inject the lifespan into FastAPI
app = FastAPI(lifespan=lifespan)

# --- YOUR EXISTING APP SETUP ---

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In Phase 1, we let SQLAlchemy create tables if they don't...
models.Base.metadata.create_all(bind=engine)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(datasets_router, prefix="/api/datasets", tags=["datasets"])
app.include_router(query.router, prefix="/api/query", tags=["query"])
app.include_router(narrative.router, prefix="/api/narrative", tags=["narrative"])

@app.get("/")
async def root():
    return {"message": "Dataomen API is running. Phase 4 Watchdog Armed."}