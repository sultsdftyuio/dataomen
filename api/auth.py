import os
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

# Orchestration (Backend): Use standard HTTP Bearer for Supabase JWTs
security = HTTPBearer()

# IMPORTANT: You must set SUPABASE_JWT_SECRET in your environment variables.
# You can find this in your Supabase Dashboard > Project Settings > API > JWT Settings.
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
ALGORITHM = "HS256"

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Modular JWT Validator: Verifies tokens issued by Supabase.
    This replaces local authenticate_user logic entirely.
    """
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWT_SECRET environment variable is not set."
        )

    token = credentials.credentials
    
    try:
        # Security by Design: Validate the token against Supabase's secret and audience
        payload = jwt.decode(
            token, 
            SUPABASE_JWT_SECRET, 
            algorithms=[ALGORITHM], 
            audience="authenticated"
        )
        
        # Extract the Supabase 'sub' (User UUID) which we use as the tenant identifier
        user_id: str = payload.get("sub")
        email: Optional[str] = payload.get("email")
        
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token is missing subject claim (sub).",
            )
            
        # Computation (Execution): Return a simplified user context for downstream routes
        return {
            "id": user_id,
            "email": email,
            "tenant_id": user_id  # Mapping Supabase UID directly to tenant_id for isolation
        }

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

# Note: The register/login routes are now handled by the Next.js frontend directly 
# with Supabase Client SDK, so they are removed from the backend orchestration layer.