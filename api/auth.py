# api/auth.py
import os
import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import jwt
from jwt import PyJWKClient
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Security,
    status,
)
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Security Configuration & Startup Validation
# ---------------------------------------------------------------------------

security = HTTPBearer(auto_error=True)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

# Fail fast at startup if authentication is fundamentally unconfigured
if not SUPABASE_URL and not SUPABASE_JWT_SECRET:
    raise RuntimeError(
        "CRITICAL: Neither SUPABASE_URL nor SUPABASE_JWT_SECRET is configured. "
        "The authentication service cannot function."
    )

if not SUPABASE_JWT_SECRET:
    logger.info("SUPABASE_JWT_SECRET not configured. Legacy HS256 tokens will be rejected.")

if not SUPABASE_URL:
    logger.info("SUPABASE_URL not configured. Modern asymmetric (RS256/ES256) tokens will be rejected.")

EXPECTED_ISSUER = (
    f"{SUPABASE_URL.rstrip('/')}/auth/v1"
    if SUPABASE_URL
    else None
)

# Audience validation is strictly opt-in
EXPECTED_AUDIENCE = os.getenv("SUPABASE_JWT_AUDIENCE")

# Initialize JWKS client to automatically fetch Supabase public keys
JWKS_URL = f"{SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else ""
jwks_client = PyJWKClient(JWKS_URL, cache_keys=True) if JWKS_URL else None

# Immutable allow-list for acceptable JWT roles
ALLOWED_ROLES = frozenset({"authenticated"})

# ---------------------------------------------------------------------------
# Auth Context Definition (Single Source of Truth)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class AuthContext:
    """
    Authenticated request context containing strictly resolved identity and scope.

    user_id:
        Supabase Auth user UUID (JWT 'sub' claim).
    tenant_id:
        Organization workspace UUID (resolved from tenant_users table).
    email:
        User email when present in token.
    role:
        Supabase role claim (authenticated).
    """
    user_id: str
    tenant_id: str
    email: str | None = None
    role: str | None = None


# ---------------------------------------------------------------------------
# Core JWT Validation (Hybrid Architecture)
# ---------------------------------------------------------------------------

def _decode_jwt(token: str) -> dict[str, Any]:
    """
    Validate and decode a Supabase access token dynamically.
    Supports both symmetric (HS256) and asymmetric (RS256, ES256) algorithms.
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.DecodeError:
        raise jwt.InvalidTokenError("Malformed token header")
        
    alg = unverified_header.get("alg")
    
    decode_kwargs = {
        "jwt": token,
        "algorithms": [alg] if alg else [],
        "options": {
            "verify_signature": True,
            "verify_exp": True,
            "verify_iat": True,
            "verify_nbf": True,
            "verify_aud": bool(EXPECTED_AUDIENCE),
            "require": ["exp", "sub", "iat", "role"],
        }
    }

    if EXPECTED_ISSUER:
        decode_kwargs["issuer"] = EXPECTED_ISSUER
    if EXPECTED_AUDIENCE:
        decode_kwargs["audience"] = EXPECTED_AUDIENCE

    # 1. Symmetric Legacy Verification (HS256)
    if alg == "HS256":
        if not SUPABASE_JWT_SECRET:
            logger.error("HS256 token received but SUPABASE_JWT_SECRET is not configured.")
            raise RuntimeError("SUPABASE_JWT_SECRET is required for legacy HS256 tokens.")
        decode_kwargs["key"] = SUPABASE_JWT_SECRET

    # 2. Asymmetric Modern Verification (RS256, ES256) via JWKS
    elif alg in ("RS256", "ES256"):
        if not jwks_client:
            raise RuntimeError("SUPABASE_URL is required to fetch JWKS for asymmetric tokens.")
            
        if not unverified_header.get("kid"):
            raise jwt.InvalidTokenError("Missing 'kid' in token header for asymmetric key")
            
        try:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            decode_kwargs["key"] = signing_key.key
        except jwt.PyJWKClientError as e:
            logger.info("Failed to retrieve signing key from JWKS: %s", e)
            raise jwt.InvalidTokenError("Unable to resolve signing key")
            
    else:
        logger.info("Unsupported JWT algorithm presented: %s", alg)
        raise jwt.InvalidAlgorithmError(f"Unsupported algorithm: {alg}")

    return jwt.decode(**decode_kwargs)


# ---------------------------------------------------------------------------
# FastAPI Dependencies
# ---------------------------------------------------------------------------

def get_auth_context(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: Session = Depends(get_db),
) -> AuthContext:
    """
    FastAPI dependency that validates a Supabase JWT, resolves workspace scope,
    and returns an immutable authentication context.
    """
    token = credentials.credentials

    try:
        payload = _decode_jwt(token)

        role = payload["role"]
        user_id = payload["sub"]

        # Strict Role Allow-listing
        if role not in ALLOWED_ROLES:
            logger.warning("Token role '%s' rejected. Expected: %s", role, ALLOWED_ROLES)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        try:
            UUID(user_id)
        except (TypeError, ValueError):
            logger.warning("JWT invalid 'sub' claim: %s", user_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid subject claim",
            )

        # -------------------------------------------------------------------
        # Upfront Tenant Scope Resolution (Single Source of Truth)
        # -------------------------------------------------------------------
        try:
            row = db.execute(
                text("SELECT tenant_id FROM tenant_users WHERE user_id = :user_id LIMIT 1"),
                {"user_id": user_id}
            ).fetchone()
        except Exception:
            logger.exception("Database failure resolving tenant mapping for user_id=%s", user_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to resolve workspace membership.",
            )

        if not row:
            logger.warning("Authenticated user %s has no active tenant mapping.", user_id)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is not associated with an active workspace.",
            )

        # Safely extract tenant_id string regardless of SQLAlchemy row mapping style
        tenant_id = str(row._mapping["tenant_id"] if hasattr(row, "_mapping") else row[0])

        return AuthContext(
            user_id=user_id,
            tenant_id=tenant_id,
            email=payload.get("email"),
            role=role,
        )

    except HTTPException:
        raise

    except jwt.ExpiredSignatureError:
        logger.info("Expired JWT presented")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
        
    except jwt.InvalidIssuerError:
        logger.info("JWT issuer mismatch")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token issuer",
        )
        
    except jwt.InvalidAudienceError:
        logger.info("JWT audience mismatch")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token audience",
        )
        
    except jwt.MissingRequiredClaimError as e:
        logger.info("JWT missing required claim: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
        
    except (jwt.ImmatureSignatureError, jwt.InvalidIssuedAtError):
        logger.info("JWT presented before its valid timeframe")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token not yet valid",
        )

    except jwt.InvalidTokenError as e:
        logger.info("Invalid JWT presented: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    except Exception:
        logger.exception("Unexpected authentication failure")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service failure",
        )


def get_current_user_id(
    auth: AuthContext = Depends(get_auth_context),
) -> str:
    """
    Explicit dependency yielding the unique user account UUID string.
    """
    return auth.user_id


def get_current_tenant_id(
    auth: AuthContext = Depends(get_auth_context),
) -> str:
    """
    Explicit dependency yielding the organization workspace UUID string.
    """
    return auth.tenant_id


# ---------------------------------------------------------------------------
# Backward Compatibility Alias (Fixed)
# ---------------------------------------------------------------------------

def get_current_tenant(
    auth: AuthContext = Depends(get_auth_context),
) -> str:
    """
    Compatibility alias for existing routes expecting `get_current_tenant`.
    Properly returns the resolved organization workspace UUID (`tenant_id`).
    """
    return auth.tenant_id


# ---------------------------------------------------------------------------
# Health / Verification Route
# ---------------------------------------------------------------------------

@router.get("/me", tags=["auth"])
def verify_auth(
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Test endpoint to verify authentication and workspace context resolution.
    """
    return {
        "authenticated": True,
        "user_id": auth.user_id,
        "tenant_id": auth.tenant_id,
        "email": auth.email,
        "role": auth.role,
    }