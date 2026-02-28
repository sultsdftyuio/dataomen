import logging
import sys
import time
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# 1. Modular Routing: Import your domain-specific routers
try:
    from api.routes import datasets, query, narrative
    ROUTERS_LOADED = True
except ImportError as e:
    ROUTERS_LOADED = False
    print(f"[FATAL ERROR] Could not load routers. Check your import paths. Details: {e}")

# 2. Engineering Excellence: Deep Observability Logging
logging.basicConfig(
    level=logging.DEBUG, # Upgraded to DEBUG for granular network tracking
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout
)
logger = logging.getLogger("DataOmen.Orchestrator")

logger.info("="*60)
logger.info("🚀 INITIATING DATAOMEN API BOOT SEQUENCE 🚀")
logger.info("="*60)

app = FastAPI(
    title="DataOmen API",
    description="High-performance analytical SaaS backend - Debug Mode",
    version="1.0.0"
)

# 3. Security by Design: CORS Configuration
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
ALLOWED_ORIGINS = [
    FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:10000", # Sometimes the UI tests against the backend port directly
]

logger.debug(f"[CONFIG] Allowed CORS Origins: {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# 4. Hybrid Performance Paradigm: Network Interceptor Middleware
@app.middleware("http")
async def network_debug_middleware(request: Request, call_next):
    """
    Intercepts EVERY incoming request to log the exact handshake, headers, and timing.
    If your frontend request doesn't show up here, it means the network traffic 
    is physically not reaching this server (Port mismatch / Firewall).
    """
    request_id = os.urandom(4).hex()
    start_time = time.perf_counter()
    
    logger.debug(f"[REQ {request_id}] --> {request.method} {request.url}")
    
    # Safely log headers (hiding full auth tokens to prevent credential leaks in logs)
    safe_headers = dict(request.headers)
    if "authorization" in safe_headers:
        safe_headers["authorization"] = safe_headers["authorization"][:15] + "...[REDACTED]"
    logger.debug(f"[REQ {request_id}] Headers: {safe_headers}")
    
    try:
        response = await call_next(request)
        process_time = time.perf_counter() - start_time
        
        # Inject execution time for frontend telemetry
        response.headers["X-Process-Time"] = str(process_time)
        
        logger.debug(f"[REQ {request_id}] <-- {response.status_code} (Completed in {process_time:.4f}s)")
        return response
        
    except Exception as e:
        process_time = time.perf_counter() - start_time
        logger.error(f"[REQ {request_id}] 💥 CRITICAL CRASH: {request.url.path} 💥")
        logger.error(f"[REQ {request_id}] Exception Details: {str(e)}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error. Check backend terminal logs."}
        )

# Health Check Route
@app.get("/health", tags=["System"])
async def health_check():
    logger.debug("[HEALTH] Health check endpoint pinged.")
    return {"status": "ok", "engine": "running"}

# 5. Dependency Injection: Attach Modular Routes
if ROUTERS_LOADED:
    logger.debug("[BOOT] Attaching /api/v1/datasets ...")
    app.include_router(datasets.router, prefix="/api/v1/datasets")
    
    logger.debug("[BOOT] Attaching /api/v1/query ...")
    app.include_router(query.router, prefix="/api/v1/query")
    
    logger.debug("[BOOT] Attaching /api/v1/narrative ...")
    app.include_router(narrative.router, prefix="/api/v1/narrative")
else:
    logger.warning("[BOOT] Routes bypassed due to import errors.")


# 6. Execution Block
if __name__ == "__main__":
    import uvicorn
    
    # We forcefully grab the port. If it's missing, we default to 10000 
    # to match what your frontend log said (http://localhost:10000/...)
    try:
        port = int(os.environ.get("PORT", 10000))
    except ValueError:
        logger.warning("[BOOT] Invalid PORT env variable. Falling back to 10000.")
        port = 10000

    logger.info("="*60)
    logger.info(f"🎧 ORCHESTRATOR LISTENING ACTIVELY ON: http://0.0.0.0:{port} 🎧")
    logger.info("="*60)
    
    # Run uvicorn with debug logging enabled at the ASGI level as well
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True, log_level="debug")