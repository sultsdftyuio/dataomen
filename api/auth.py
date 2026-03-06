import os
import logging
from typing import Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from dotenv import load_dotenv

# Configure logging
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Setup Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    logger.warning("Supabase environment variables are missing. Auth might fail.")

# Instantiate a global, reusable client for JWT verification
supabase: Client = create_client(
    SUPABASE_URL or "", 
    SUPABASE_SERVICE_ROLE_KEY or ""
)

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """
    Verifies the JWT token using Supabase and returns the user object.
    Throws a 401 if the token is invalid or expired.
    """
    token = credentials.credentials
    try:
        # Verify the JWT using Supabase Auth (stateless & efficient)
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise ValueError("Invalid user token")
            
        # Optional: verify if the user exists/is active depending on business rules
        return user_response.user.model_dump()
        
    except Exception as e:
        logger.error(f"Authentication failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def verify_tenant(user: Dict[str, Any] = Depends(get_current_user)) -> str:
    """
    Security by Design: Extracts and validates the tenant ID for multi-tenant isolation.
    Assuming tenant_id is either mapped to the user ID directly (for single-user tenants)
    or stored inside the user's app_metadata/user_metadata via Supabase.
    """
    # Option A: The user IS the tenant (B2C/solo SaaS approach)
    tenant_id = user.get("id")
    
    # Option B: The tenant_id is inside app_metadata (B2B SaaS approach)
    # metadata = user.get("app_metadata", {})
    # tenant_id = metadata.get("tenant_id")
    
    if not tenant_id:
        logger.error("Tenant ID missing for authenticated user.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not belong to a valid tenant.",
        )
        
    return tenant_id