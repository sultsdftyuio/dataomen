from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.auth import router as auth_router

app = FastAPI(title="DataOmen API", version="0.1.0")

# SECURITY FIRST: In Phase 1, we only allow our Next.js frontend to talk to this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register our routers
app.include_router(auth_router, prefix="/auth", tags=["Authentication"])

@app.get("/health")
def health_check():
    return {"status": "ok", "phase": 1, "message": "DataOmen backend is alive."}