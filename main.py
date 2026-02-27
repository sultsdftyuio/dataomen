from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from api.routes.datasets import router as datasets_router
from api.routes.query import router as query_router
from api.routes.narrative import router as narrative_router
from api.database import engine, Base

# Create tables if they don't exist (Optional: better to use Alembic for prod)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Analytical SaaS API",
    description="High-performance backend for analytical processing",
    version="1.0.0"
)

# CORS configuration for Interaction (Frontend) functionality
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, swap "*" for your specific frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health Check Route
@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "engine": "fastapi"}

# Include Routers (Modular Strategy)
app.include_router(datasets_router, prefix="/api/v1/datasets", tags=["Datasets"])
app.include_router(query_router, prefix="/api/v1/query", tags=["Query Engine"])
app.include_router(narrative_router, prefix="/api/v1/narrative", tags=["Narrative & AI"])

if __name__ == "__main__":
    import uvicorn
    # Use 0.0.0.0 to bind to all interfaces for cloud deployments (like Render)
    uvicorn.run("main:app", host="0.0.0.0", port=10000, reload=False)