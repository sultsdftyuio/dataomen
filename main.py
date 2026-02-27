from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

# Modular Strategy: Import routers
from api.routes.datasets import router as datasets_router
from api.routes.query import router as query_router
from api.routes.narrative import router as narrative_router

# Orchestration (Backend): Correctly route our decoupled database dependencies
from api.database import engine
from models import Base 

# Mathematical Precision: Ensure the vector extension exists before creating tables
with engine.connect() as connection:
    connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
    connection.commit()

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Analytical SaaS API",
    description="High-performance backend for analytical processing",
    version="1.0.0"
)

# CORS configuration for Interaction (Frontend) functionality
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, swap "*" for your frontend's specific origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health Check Route
@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "engine": "fastapi"}

# Include Routers
app.include_router(datasets_router, prefix="/api/v1/datasets", tags=["Datasets"])
app.include_router(query_router, prefix="/api/v1/query", tags=["Query Engine"])
app.include_router(narrative_router, prefix="/api/v1/narrative", tags=["Narrative & AI"])

if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0 bind is required for Render/Docker deployments
    uvicorn.run("main:app", host="0.0.0.0", port=10000, reload=False)