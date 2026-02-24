from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter()

# Pydantic Schemas to strictly validate incoming JSON from Next.js
class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest):
    """
    Phase 1: Authenticate a user and return a JWT.
    (Currently mocked to clear the connection error).
    """
    # TODO: Connect to PostgreSQL and hash passwords
    if request.email == "test@example.com" and request.password == "password":
        return TokenResponse(access_token="mock_jwt_token_for_phase_1")
    
    # If credentials fail, we throw an HTTP 401. 
    # Next.js will catch this and throw the 'detail' string to the frontend.
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password"
    )

# Mock endpoint to prevent the register action from throwing a 404
class RegisterRequest(BaseModel):
    company: str
    email: str
    password: str

@router.post("/register", response_model=TokenResponse)
def register(request: RegisterRequest):
    return TokenResponse(access_token="mock_jwt_token_for_phase_1")