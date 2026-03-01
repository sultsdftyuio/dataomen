import logging
import sys
import time
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# 1. Modular Routing: Import domain-specific routers
try:
    from api.routes import datasets, query, narrative
except ImportError as e:
    logging.error(f"Failed to import routes: {e}")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DataOmen Analytical API",
    description="High-performance backend for multi-tenant analytical SaaS.",
    version="1.0.0"
)

# 2. Security by Design: Bulletproof CORS configuration
origins = [
    "http://localhost:3000",
    "https://v0-dataomen.vercel.app",
    "https://dataomen.vercel.app"
]

if os.getenv("FRONTEND_URL"):
    origins.append(os.getenv("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Wildcard ensures OPTIONS preflights are ALWAYS accepted
    allow_headers=["*"], # Wildcard allows all frontend headers
)

# 3. Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception at {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred.", "path": request.url.path}
    )

# 4. Middleware for performance monitoring
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        return response
    except Exception as e:
        logger.error(f"Middleware Exception: {e}")
        raise e

# 5. Route Registration
app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
app.include_router(narrative.router, prefix="/api/narrative", tags=["narrative"])
app.include_router(query.router, prefix="/api/query", tags=["query"])

# Healthcheck
@app.get("/health", tags=["system"])
def health_check():
    return {
        "status": "ok", 
        "environment": os.getenv("ENV", "development"),
        "version": "1.0.0"
    }