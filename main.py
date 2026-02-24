from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.auth import router as auth_router
from api.routes.datasets import router as datasets_router # New Import
from api.database import engine
import models

# In Phase 1, we let SQLAlchemy create tables if they don't exist.
# In production, we would use Alembic migrations.
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="DataOmen API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register our routers
app.include_router(auth_router, prefix="/auth", tags=["Authentication"])
app.include_router(datasets_router) # Now properly reachable at /api/v1/datasets/upload

@app.get("/health")
def health_check():
    return {"status": "ok", "phase": 1, "message": "DataOmen backend is alive."}