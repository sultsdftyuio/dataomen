# api/auth.py
import os
import logging
import jwt  # Requires: pip install PyJWT
from typing import Dict, Any, Optional
from dataclasses import dataclass
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from dotenv import load_dotenv

# Configure logging for observability
logger = logging.getLogger(__name__)
load_dotenv()

# FastAPI security scheme
security = HTTPBearer()

# Singleton placeholder for the Supabase client
_supabase_client: Optional[Client] = None

@dataclass
class TenantContext:
    """
    Object-Oriented Security: Encapsulates the verified user and tenant data.
    Ensures downstream services rely on strict properties, preventing dictionary-key typos 
    and accidental data leakage across tenants.
    """
    user_id: str
    tenant_id: str
    email: Optional[str] = None
    app_metadata: Optional[Dict[str, Any]] = None


def get_supabase_client() -> Client:
    """Lazy initialization of the Supabase client to prevent startup crashes."""
    global _supabase_client
    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
        
        if not url or not key:
            raise RuntimeError("Supabase URL or Key is missing from environment.")
            
        _supabase_client = create_client(url, key)
    return _supabase_client


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """
    SaaS Performance Upgrade: Attempts stateless JWT verification first.
    Local decoding reduces auth latency to <1ms, preventing API rate limits.
    """
    token = credentials.credentials
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET")

    # FAST PATH: Stateless Local Verification
    if jwt_secret:
        try:
            # Supabase uses HS256 for signing standard JWTs
            decoded_payload = jwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False} # Supabase audience varies by project config
            )
            return decoded_payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired")
        except jwt.InvalidTokenError as e:
            logger.warning(f"Stateless JWT verification failed: {e}")
            # Fallthrough to network check if local decoding fails
            
    # SLOW PATH: Network Verification (Fallback)
    try:
        client = get_supabase_client()
        user_response = client.auth.get_user(token)
        
        if not user_response or not user_response.user:
            raise ValueError("Invalid user token")
            
        return user_response.user.model_dump()
        
    except Exception as e:
        logger.warning(f"Network Authentication failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


def verify_tenant(user_payload: Dict[str, Any] = Depends(get_current_user)) -> TenantContext:
    """
    Security by Design: Validates and locks the context to a specific tenant.
    Inject this dependency into your routes to enforce strict multi-tenant boundaries.
    """
    # Handle both stateless (JWT payload 'sub') and network (Supabase dump 'id') formats
    user_id = user_payload.get("sub") or user_payload.get("id")
    email = user_payload.get("email")
    app_metadata = user_payload.get("app_metadata", {})
    
    # Priority 1: B2B Organization/Tenant ID from metadata
    # Priority 2: B2C Solo User ID
    tenant_id = app_metadata.get("tenant_id") or user_id
    
    if not tenant_id or not user_id:
        logger.error(f"Tenant isolation failed. Missing ID for payload.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not belong to a valid tenant setup.",
        )
        
    return TenantContext(
        user_id=str(user_id),
        tenant_id=str(tenant_id),
        email=email,
        app_metadata=app_metadata
    )