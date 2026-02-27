import logging
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from api.routes import datasets, query, narrative
from api.auth import router as auth_router
from api.database import engine, Base

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dataomen.debug")

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="DataOmen API")

# DEBUG MIDDLEWARE: Log every single request that hits this server
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    path = request.url.path
    method = request.method
    logger.info(f"Incoming Request: {method} {path}")
    
    response = await call_next(request)
    
    process_time = (time.time() - start_time) * 1000
    logger.info(f"Completed Request: {method} {path} - Status: {response.status_code} - Time: {process_time:.2f}ms")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Explicitly register routers
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(datasets.router, prefix="/api/v1/datasets", tags=["Datasets"])
app.include_router(query.router, prefix="/api/v1/query", tags=["Query"])
app.include_router(narrative.router, prefix="/api/v1/narrative", tags=["Narrative"])

# DEBUG: Print all registered routes on startup
@app.on_event("startup")
async def inspect_routes():
    print("\n" + "="*50)
    print("REGISTERED API ROUTES:")
    for route in app.routes:
        if hasattr(route, "methods"):
            print(f"[{' , '.join(route.methods)}] {route.path}")
    print("="*50 + "\n")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}