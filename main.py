from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

# Modular Strategy: Import routers
from api.routes.datasets import router as datasets_router
from api.routes.query import router as query_router
from api.routes.narrative import router as narrative_router
from api.auth import router as auth_router

# Orchestration (Backend): Correctly route our decoupled database dependencies
from api.database import engine, Base

# Create database tables automatically
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="DataOmen API",
    description="High-performance multi-tenant analytical API powered by DuckDB",
    version="1.0.0"
)

# Configure CORS to be resilient across multiple developer environments and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # NOTE: Recommend narrowing down to specific domains (e.g. your Vercel URL) in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers - ensure consistent standard API prefixes to prevent 404s
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(datasets_router, prefix="/api/v1/datasets", tags=["Datasets"])
app.include_router(query_router, prefix="/api/v1/query", tags=["Query"])
app.include_router(narrative_router, prefix="/api/v1/narrative", tags=["Narrative"])

@app.get("/health", tags=["System"])
async def health_check():
    """
    Standardized health check endpoint to verify backend orchestration is online.
    """
    return {
        "status": "healthy",
        "version": "1.0.0",
        "message": "DataOmen Analytical Engine is running."
    }

# Run execution block for local debugging
if __name__ == "__main__":
    import uvicorn
    # Use standard local port. Ensure your NEXT_PUBLIC_API_URL targets this exactly.
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)