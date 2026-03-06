import os
import logging
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

logger = logging.getLogger(__name__)

# Orchestration (Backend): Clean Dependency Injection for Authorization
security = HTTPBearer()

# SUPABASE_JWT_SECRET should be defined in your environment (.env)
# Found in Supabase Dashboard -> Project Settings -> API -> JWT Secret
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
ALGORITHM = "HS256"
AUDIENCE = "authenticated"

def verify_tenant(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Validates the Supabase JWT and extracts the correct tenant ID.
    Security by Design: Ensures tenant isolation at the request layer via token extraction.
    """
    if not SUPABASE_JWT_SECRET:
        logger.error("SUPABASE_JWT_SECRET environment variable is missing.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication is not properly configured on the server."
        )

    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Decode the Supabase JWT 
        payload = jwt.decode(
            token, 
            SUPABASE_JWT_SECRET, 
            algorithms=[ALGORITHM], 
            audience=AUDIENCE
        )
        
        # In a standard Supabase Auth setup, the 'sub' acts as the unique user identifier.
        # If your multi-tenancy is organization-based (e.g. many users to one org), 
        # extract the specific tenant_id from the user's app_metadata:
        # tenant_id: str = payload.get("app_metadata", {}).get("tenant_id")
        
        tenant_id: Optional[str] = payload.get("sub")
        
        if not tenant_id:
            logger.warning("JWT validation failed: 'sub' (tenant_id) claim missing.")
            raise credentials_exception
            
        return tenant_id
        
    except JWTError as e:
        logger.warning(f"JWT Verification failed: {str(e)}")
        raise credentials_exception