# main.py

import os
import sys
import logging
import time
import gc
import importlib
from contextlib import asynccontextmanager
from typing import Callable, Dict, Iterable, Optional

# ==============================================================================
# 0. C-LEVEL CONTAINER GUARDRAILS (CRITICAL FOR DIGITALOCEAN / CLOUD DEPLOYMENTS)
# ==============================================================================
# MUST BE SET BEFORE ANY NATIVE LIBRARIES (Polars, DuckDB, NumPy, PyTorch) ARE IMPORTED.
# These engines read the Host Node's resources and will instantly allocate massive 
# thread pools/buffers, causing an immediate OOM crash if not clamped.

# 1. Clamp thread pools to prevent CPU thrashing and per-thread memory bloat
os.environ.setdefault("POLARS_MAX_THREADS", "1")
os.environ.setdefault("DUCKDB_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

# 2. Fix Python memory leaks in containers: Force glibc to return freed RAM to the OS instantly
os.environ.setdefault("MALLOC_TRIM_THRESHOLD_", "100000")

# 3. Prevent ML libraries (transformers/faiss) from pre-allocating unused tensors
os.environ.setdefault("PYTORCH_NO_CUDA_MEMORY_CACHING", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

# ------------------------------------------------------------------------------
# 1. Observability Configuration
# ------------------------------------------------------------------------------
# We force stream=sys.stdout to ensure logs flush instantly to the cloud dashboard.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    stream=sys.stdout
)
logger = logging.getLogger("DataOmenAPI")

DEFAULT_ROUTE_MODULES = [
    "api.routes.agents",
    "api.routes.datasets",
    "api.routes.query",
    "api.routes.narrative",
    "api.routes.chat",
    "api.routes.webhooks",
    "api.routes.billing",
    "api.routes.organizations",
    "api.auth",
]


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


def _build_lifespan(skip_startup_init: bool):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """
        Ensures heavy analytical engines spin up cleanly.
        Forces a deep garbage collection cycle immediately after boot imports to
        clear out transient import bloat before accepting traffic.
        """
        if skip_startup_init:
            logger.info("Startup initialization skipped (APP_SKIP_STARTUP_INIT=true).")
            yield
            return

        logger.info("🚀 Data Omen API initializing with Strict Container Guardrails...")

        try:
            from api.database import init_db

            init_db()
            logger.info("✅ Database infrastructure synchronized.")
        except Exception as e:
            logger.error(f"⚠️ Database Sync Failed on Boot: {str(e)}")
            # We do not exit here; in cloud cold-starts, the database might take
            # a few extra seconds to become fully available.

        # Force OS to reclaim RAM from massive module imports
        gc.collect()
        logger.info("🧹 Boot-time Garbage Collection complete. Ready for traffic.")

        try:
            from api.services.agent_memory import build_redis_client, initialize_agent_memory

            app.state.agent_memory = initialize_agent_memory(build_redis_client())
            logger.info("✅ Agent memory service initialized with app-scoped Redis client.")
        except Exception as e:
            app.state.agent_memory = None
            logger.error(f"⚠️ Agent memory initialization failed: {e}")

        yield

        logger.info("🔌 Shutting down API... Cleaning up resources.")
        try:
            from api.services.agent_memory import reset_agent_memory

            agent_memory_service = getattr(app.state, "agent_memory", None)
            if agent_memory_service is not None:
                await agent_memory_service.aclose()
                logger.info("✅ Agent memory Redis pool closed.")

            reset_agent_memory()
        except Exception as e:
            logger.warning(f"⚠️ Agent memory shutdown cleanup failed: {e}")

    return lifespan

async def health_check():
    """
    System heartbeat used by DigitalOcean to verify instance stability.
    Defined at the top so it is instantly available before heavy routes load.
    """
    return {
        "status": "optimal",
        "environment": os.getenv("ENVIRONMENT", "production"),
        "timestamp": time.time(),
        "memory_guardrails_active": True
    }

def _configure_middleware(fastapi_app: FastAPI) -> None:
    raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

    # Domain regex supports both production custom domains and Vercel preview URLs.
    # Examples: https://arcli.tech, https://app.arcli.tech, https://preview-id.vercel.app
    domain_regex = r"^https://([a-zA-Z0-9-]+\.)*(arcli\.tech|vercel\.app)$"

    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=domain_regex,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=["*"],
    )

    # PERFORMANCE: Compress analytical payloads to reduce latency and egress bandwidth
    fastapi_app.add_middleware(GZipMiddleware, minimum_size=1000)

    @fastapi_app.middleware("http")
    async def add_telemetry_and_security_headers(request: Request, call_next):
        # time.perf_counter() is strictly better than time.time() for benchmarking compute speed.
        start_time = time.perf_counter()
        response = await call_next(request)
        process_time = time.perf_counter() - start_time

        # Inject execution time for frontend monitoring.
        response.headers["X-Process-Time"] = f"{process_time:.5f}"

        # Defense-in-depth: Inject modern security headers.
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Enforce HTTPS on custom domains.
        if os.getenv("ENVIRONMENT") != "development":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response


def _configure_exception_handlers(fastapi_app: FastAPI) -> None:
    @fastapi_app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """Prevents raw Python stack traces from leaking to the frontend on 500s."""
        logger.error(f"❌ Unhandled Exception on {request.method} {request.url.path}: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal system anomaly was detected. Our engineers have been notified."},
        )


def register_routes(
    fastapi_app: FastAPI,
    *,
    strict: bool = True,
    route_modules: Optional[Iterable[str]] = None,
) -> None:
    """
    Registers routers from module paths.

    strict=True (default): any import/registration failure raises and crashes startup.
    strict=False: failed route modules are skipped, useful for isolated test bootstraps.
    """
    modules = list(route_modules or DEFAULT_ROUTE_MODULES)
    loaded_modules = []

    for module_path in modules:
        try:
            module = importlib.import_module(module_path)
            router = getattr(module, "router", None)
            if router is None:
                raise AttributeError(f"Module '{module_path}' has no 'router' attribute.")

            fastapi_app.include_router(router)
            loaded_modules.append(module_path)
        except Exception as exc:
            if strict:
                raise RuntimeError(f"Failed to register route module '{module_path}': {exc}") from exc
            logger.warning(f"Skipping route module '{module_path}' due to load error: {exc}")

    logger.info(f"🗺️ Modular routes registered successfully ({len(loaded_modules)}/{len(modules)} modules).")


def create_app(
    *,
    skip_startup_init: Optional[bool] = None,
    strict_route_registration: Optional[bool] = None,
    route_modules: Optional[Iterable[str]] = None,
) -> FastAPI:
    """
    Application factory.

    - skip_startup_init: skips DB/agent-memory startup for deterministic tests.
      Defaults to APP_SKIP_STARTUP_INIT env flag.
    - strict_route_registration: crash on route import failures when true.
      Defaults to APP_ROUTE_IMPORT_STRICT env flag (true by default).
    - route_modules: optional subset/ordering of route module paths.
    """
    resolved_skip_startup = _env_flag("APP_SKIP_STARTUP_INIT", False) if skip_startup_init is None else skip_startup_init
    resolved_strict_routes = _env_flag("APP_ROUTE_IMPORT_STRICT", True) if strict_route_registration is None else strict_route_registration

    fastapi_app = FastAPI(
        title="Data Omen API",
        description="High-performance multi-tenant analytical API engine.",
        version="2.0.0",
        lifespan=_build_lifespan(resolved_skip_startup),
    )

    # Health endpoints are registered first so orchestrators can probe liveness quickly.
    fastapi_app.add_api_route("/health", health_check, methods=["GET"], tags=["System"])
    fastapi_app.add_api_route("/api/health", health_check, methods=["GET"], tags=["System"])

    _configure_middleware(fastapi_app)
    _configure_exception_handlers(fastapi_app)
    register_routes(
        fastapi_app,
        strict=resolved_strict_routes,
        route_modules=route_modules,
    )

    fastapi_app.state.app_factory_config = {
        "skip_startup_init": resolved_skip_startup,
        "strict_route_registration": resolved_strict_routes,
    }

    return fastapi_app


def apply_dependency_overrides(
    fastapi_app: FastAPI,
    overrides: Dict[Callable, Callable],
) -> None:
    """Helper for tests to override dependencies in a single call."""
    fastapi_app.dependency_overrides.update(overrides)


def apply_test_overrides(
    fastapi_app: FastAPI,
    *,
    db_override: Optional[Callable] = None,
    tenant_override: Optional[Callable] = None,
) -> None:
    """Convenience helper for common test dependency overrides."""
    overrides: Dict[Callable, Callable] = {}

    if db_override is not None:
        from api.database import get_db

        overrides[get_db] = db_override

    if tenant_override is not None:
        from api.auth import verify_tenant

        overrides[verify_tenant] = tenant_override

    if overrides:
        apply_dependency_overrides(fastapi_app, overrides)


# Default ASGI application instance.
app = create_app()

# ------------------------------------------------------------------------------
# Entrypoint (main.py)
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    
    # DigitalOcean injects the PORT dynamically. Default to 8080 if not found.
    port = int(os.getenv("PORT", "8080"))
    is_dev = os.getenv("ENVIRONMENT") == "development"
    
    # CRITICAL CLOUD FIX: Limit to 1 worker on standard cloud containers.
    workers = int(os.getenv("WEB_CONCURRENCY", "1"))
    
    logger.info(f"Starting API server on port {port} with {workers} worker(s)...")
    
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=port, 
        reload=is_dev, 
        workers=workers,
        # 🚀 SECURITY & ROUTING UPGRADE: Trust Load Balancer Headers
        # Tells FastAPI to respect X-Forwarded-Proto: https so 307 redirects don't downgrade to HTTP
        proxy_headers=True,
        forwarded_allow_ips="*"
    )