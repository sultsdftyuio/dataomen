import logging
import time
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Modular Logic: Swappable API routes
from api.routes import datasets, query, narrative

# 1. Engineering Excellence: Structured Observability
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("dataomen-engine")

app = FastAPI(
    title="DataOmen Analytical Engine",
    description="High-performance backend for multi-tenant SaaS.",
    version="1.0.0",
)

# 2. Hybrid Security: Environment-Aware CORS
# Allows local dev origins and ANY Vercel deployment branch via Regex
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app", # Engineering Excellence: Support previews
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Request Orchestration: Timing & Logging
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    logger.info(f"Processed {request.method} {request.url.path} in {process_time:.4f}s")
    return response

# 4. Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Engine Exception at {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Analytical Engine error. Check backend logs."},
    )

# 5. Modular Route Registration
app.include_router(datasets.router, prefix="/api/v1/datasets", tags=["Ingestion"])
app.include_router(query.router, prefix="/api/v1/query", tags=["Analytical Engine"])
app.include_router(narrative.router, prefix="/api/v1/narrative", tags=["LLM Narrative"])

@app.on_event("startup")
async def startup_event():
    logger.info("Initializing DataOmen Compute Engine...")

@app.get("/health", tags=["System"])
def health_check():
    return {"status": "operational", "service": "DataOmen API", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    # Render binds dynamic ports via PORT environment variable
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)