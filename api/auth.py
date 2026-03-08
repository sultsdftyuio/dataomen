# api/auth.py
import os
import logging
from typing import Dict, Any, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from dotenv import load_dotenv

# Configure logging for observability
logger = logging.getLogger(__name__)

# Load environment variables (mostly for local development)
load_dotenv()

# FastAPI security scheme
security = HTTPBearer()

# Singleton placeholder for the Supabase client
_supabase_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """
    Lazy initialization of the Supabase client.
    Prevents Uvicorn startup crashes in CI/CD or PaaS environments (Render/Vercel)
    by delaying instantiation until the client is actually needed.
    """
    global _supabase_client
    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL")
        # Support both service role (current setup) and anon key fallbacks
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
        
        if not url or not key:
            logger.error("Supabase environment variables are missing. Initialization failed.")
            raise RuntimeError(
                "Supabase configuration is missing. "
                "Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your deployment environment."
            )
            
        try:
            _supabase_client = create_client(url, key)
            logger.info("Supabase client initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to create Supabase client: {e}")
            raise RuntimeError(f"Could not initialize Supabase client: {e}")
            
    return _supabase_client


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """
    Verifies the JWT token using Supabase and returns the user object.
    Throws a 401 if the token is invalid or expired.
    """
    # 1. Safely retrieve the client
    try:
        client = get_supabase_client()
    except RuntimeError as e:
        logger.error(f"Auth configuration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service is currently misconfigured on the server."
        )

    # 2. Verify the credentials
    token = credentials.credentials
    try:
        # Verify the JWT using Supabase Auth (stateless & efficient)
        user_response = client.auth.get_user(token)
        
        if not user_response or not user_response.user:
            raise ValueError("Invalid user token")
            
        # Return the user object as a dictionary for downstream processing
        return user_response.user.model_dump()
        
    except Exception as e:
        logger.warning(f"Authentication failed: {str(e)}")
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
        
    return str(tenant_id)