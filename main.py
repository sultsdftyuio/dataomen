import logging
import os
import sys
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# 1. Modular Routing: Import domain-specific routers
from api.routes import datasets, query, narrative

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="DataOmen Analytical API",
    description="High-performance backend for multi-tenant analytical SaaS.",
    version="1.0.0"
)

# 2. Security by Design: Explicit CORS Configuration
# The Vercel frontend MUST be allowed to communicate with this Render backend.
# The wildcard "*" can sometimes fail to attach proper preflight headers if a specific origin is expected.
# We explicitly allow the known origins.
origins = [
    "http://localhost:3000",
    "https://v0-dataomen.vercel.app",
]
# Allow dynamic injection from environment variables (e.g., Render/Cloudflare configurations)
if os.getenv("FRONTEND_URL"):
    origins.append(os.getenv("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
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
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

# 5. Route Registration
app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
app.include_router(narrative.router, prefix="/api/narrative", tags=["narrative"])
app.include_router(query.router, prefix="/api/query", tags=["query"])

# Healthcheck Endpoint
@app.get("/health", tags=["system"])
def health_check():
    return {
        "status": "ok", 
        "environment": os.getenv("ENV", "development"),
        "version": "1.0.0"
    }