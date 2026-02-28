import logging
import time
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Clean modular imports for your routers
from api.routes import datasets, query, narrative

# 1. Observability: Basic configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("dataomen-engine")

def create_app() -> FastAPI:
    """Factory pattern for FastAPI initialization (Modular Strategy)"""
    app = FastAPI(
        title="DataOmen API Engine",
        description="High-performance analytical SaaS backend utilizing DuckDB",
        version="1.0.0",
    )

    # 2. CORS Strategy - CRITICAL for Production + Supabase Auth
    # Add your production frontend domain (e.g., Vercel) to this list
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://dataomen.vercel.app",  # <--- REPLACE WITH YOUR ACTUAL FRONTEND URL
    ]

    # Optionally allow dynamic frontend origins via environment variable
    prod_frontend_url = os.environ.get("FRONTEND_URL")
    if prod_frontend_url:
        origins.append(prod_frontend_url)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"], # Crucial: strictly allows the 'Authorization' Bearer token header
    )

    # 3. Performance Profiling Middleware
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

    @app.on_event("shutdown")
    async def shutdown_event():
        logger.info("Shutting down DataOmen Engine...")

    # 6. Render Health Checks
    @app.head("/", tags=["System"])
    @app.get("/", tags=["System"])
    def root_check():
        """Silences the Render 404 logs by responding to load balancer pings."""
        return {"status": "healthy", "engine": "DataOmen is online"}

    @app.get("/health", tags=["System"])
    def health_check():
        return {"status": "healthy", "engine": "online"}

    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    # Standard ASGI port fallback. Render natively overrides port via env vars.
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)