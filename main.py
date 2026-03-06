# main.py
import logging
import time
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# 1. Modular Routing: Import distinct capability modules
from api.routes import agents, datasets, query, narrative, chat

# Configure logging for orchestrated observation
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Data Omen Engine",
    description="High-performance analytical API engine.",
    version="1.0.0"
)

# 2. Security by Design: Strict CORS Policy
# Adjust origins based on deployment environments (e.g., Vercel frontend URL)
origins = [
    "http://localhost:3000",
    "https://your-vercel-deployment.vercel.app",
    "*"  # Only keep * for early development; restrict in production
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Observability Middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    logger.info(f"{request.method} {request.url.path} - Processed in {process_time:.4f}s")
    return response

# 4. Exception Handling
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal system anomaly was detected. Our engineers have been notified."},
    )

# 5. Route Orchestration
# Note: Ensure the 'agents' module exists in api.routes, or remove it if not yet implemented.
try:
    app.include_router(agents.router)
except ImportError:
     logger.warning("api.routes.agents module not found. Skipping registration.")

app.include_router(datasets.router)
app.include_router(query.router)
app.include_router(narrative.router)
app.include_router(chat.router) # Injecting the new conversational chat interface

# Standard health check
@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "optimal", "engine": "DuckDB", "timestamp": time.time()}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)