# api/auth.py
import os
import logging
from typing import Dict, Any, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from dotenv import load_dotenv

# Configure logging
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize Supabase client for token verification
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning("SUPABASE_URL or SUPABASE_ANON_KEY is missing. Authentication will fail.")

# Note: In a production environment with high concurrency, you might want to use a 
# stateless JWT verification library (like PyJWT) to verify tokens without making a network 
# call to Supabase for every single request, relying on Supabase's JWT secret. 
# However, using the client's `get_user` ensures the user hasn't been recently disabled.
supabase: Client = create_client(
    SUPABASE_URL or "https://placeholder.supabase.co", 
    SUPABASE_KEY or "placeholder"
)

# Standard HTTP Bearer scheme for Swagger UI & general token parsing
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """
    Dependency to verify a JWT token and retrieve the current authenticated user.
    Uses the Supabase Auth API to validate the token.
    
    Returns:
        Dict[str, Any]: A dictionary containing user information (e.g., id, email).
        
    Raises:
        HTTPException: 401 Unauthorized if the token is invalid or missing.
    """
    token = credentials.credentials
    
    try:
        # Ask Supabase to validate the token and return the user
        response = supabase.auth.get_user(token)
        
        # Ensure we actually got a user back
        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        # Supabase's GoTrue client returns a User object.
        # We'll transform this into a simple dictionary so downstream route handlers
        # can easily access properties like user["id"] or user.get("id").
        user_dict = {
            "id": getattr(response.user, "id", None),
            "email": getattr(response.user, "email", None),
            "role": getattr(response.user, "role", "authenticated"),
            "aud": getattr(response.user, "aud", "authenticated"),
            # Include raw app_metadata / user_metadata if needed for tenant isolation
            "app_metadata": getattr(response.user, "app_metadata", {}),
            "user_metadata": getattr(response.user, "user_metadata", {}),
        }
        
        return user_dict
        
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# Optional helper dependency if you need strict role-based checks
def require_role(required_role: str):
    """
    Dependency factory to check if the user has a specific role.
    """
    async def role_checker(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if user.get("role") != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user
    return role_checker