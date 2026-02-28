import logging
import time
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Clean modular strategy: separate API boundaries
from api.routes import datasets, query, narrative

# 1. Observability: Basic configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("dataomen-engine")

app = FastAPI(
    title="DataOmen Analytical API",
    description="High-performance backend utilizing DuckDB for multi-tenant analytical queries.",
    version="1.0.0",
)

# 2. Hybrid Security Paradigm: Environment-Aware CORS
# We explicitly allow localhost and your vercel domains to communicate with this Render API.
# You can also pass ALLOWED_ORIGINS explicitly via Render Environment Variables if desired.
origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
allowed_origins = [origin.strip() for origin in origins_env.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Safely allow Vercel previews/prod
    allow_credentials=True,
    allow_methods=["*"],  # Allows POST, OPTIONS, GET, etc.
    allow_headers=["*"],
)

# 3. Global Exception Orchestration
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error processing request {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal orchestration error. Please check logs."},
    )

# 4. Observability Middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    logger.info(f"Processed {request.method} {request.url.path} in {process_time:.4f}s")
    return response

# 5. Routing Orchestration
app.include_router(datasets.router, prefix="/api/v1/datasets", tags=["Ingestion"])
app.include_router(query.router, prefix="/api/v1/query", tags=["Analytical Engine"])
app.include_router(narrative.router, prefix="/api/v1/narrative", tags=["LLM Narration"])

@app.on_event("startup")
async def startup_event():
    logger.info("Initializing DataOmen Compute Engine...")

@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "operational", "engine": "DataOmen API", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    # Render binds dynamic ports securely through the PORT environment variable
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)