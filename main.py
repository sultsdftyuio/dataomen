import logging
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Assuming these are the modular routers established in your structure
from api.routes import datasets, query, narrative
# from api.database import init_db # Import your DB initializer if needed

# 1. Logging configuration for observability
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("dataomen-engine")

def create_app() -> FastAPI:
    """Factory pattern for FastAPI initialization"""
    app = FastAPI(
        title="DataOmen API Engine",
        description="High-performance analytical SaaS backend utilizing DuckDB and Parquet",
        version="1.0.0",
    )

    # 2. CORS Strategy - CRITICAL for local Dev + Supabase Auth
    # When allow_credentials=True, allow_origins cannot be ["*"].
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:10000", # Allow the port you originally tried to hit, just in case
        # Add production frontend URL here via ENV vars later
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"], # Strictly allows the 'Authorization' Bearer token header
    )

    # 3. Performance Middleware (The Hybrid Performance Paradigm)
    @app.middleware("http")
    async def add_process_time_header(request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        return response

    # 4. Global Exception Handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception on {request.url.path}: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error", "path": request.url.path},
        )

    # 5. Modular Routing Injection
    app.include_router(datasets.router, prefix="/api/v1/datasets", tags=["Datasets"])
    app.include_router(query.router, prefix="/api/v1/query", tags=["Query Engine"])
    app.include_router(narrative.router, prefix="/api/v1/narrative", tags=["Narrative & LLM"])

    @app.on_event("startup")
    async def startup_event():
        logger.info("Initializing DataOmen Engine...")
        # init_db() # Boot up DB connection pools if required

    @app.on_event("shutdown")
    async def shutdown_event():
        logger.info("Shutting down DataOmen Engine...")

    @app.get("/health", tags=["System"])
    def health_check():
        return {"status": "healthy", "engine": "online"}

    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    # Enforces standard ASGI port 8000 for local development. 
    # Use standard host 0.0.0.0 to bind cleanly.
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)