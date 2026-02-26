from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.auth import router as auth_router
from api.routes.datasets import router as datasets_router
from api.database import engine
from api.routes import query
from api.routes import narrative  # <--- Imported the new Narrative Router

import models

# In Phase 1, we let SQLAlchemy create tables if they don't exist.
# In production, we would use Alembic migrations.
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="SaaS Analytics MVP")

# Configure CORS so your Next.js frontend can talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev only; in prod use your Vercel URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# Modular Engine App Routers
# ---------------------------------------------------------
app.include_router(auth_router)
app.include_router(datasets_router)  # Phase 1: Ingestion & Storage
app.include_router(query.router)     # Phase 2: NL2SQL & RAG Engine
app.include_router(narrative.router) # Phase 3: CFO Narrative Engine

@app.get("/")
def read_root():
    return {"message": "Backend is running"}