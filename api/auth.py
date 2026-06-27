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

# Explicitly log hybrid configuration state to prevent silent 500s later
if not SUPABASE_JWT_SECRET:
    logger.info("SUPABASE_JWT_SECRET not configured. Legacy HS256 tokens will be rejected.")

if not SUPABASE_URL:
    logger.info("SUPABASE_URL not configured. Modern asymmetric (RS256/ES256) tokens will be rejected.")

EXPECTED_ISSUER = (
    f"{SUPABASE_URL.rstrip('/')}/auth/v1"
    if SUPABASE_URL
    else None
)

# Make audience validation strictly opt-in to prevent breaking valid Supabase tokens
EXPECTED_AUDIENCE = os.getenv("SUPABASE_JWT_AUDIENCE")

# Initialize the JWKS client to automatically fetch Supabase public keys
JWKS_URL = f"{SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else ""
jwks_client = PyJWKClient(JWKS_URL, cache_keys=True) if JWKS_URL else None

# Immutable allow-list for acceptable JWT roles
ALLOWED_ROLES = frozenset({"authenticated"})

# ---------------------------------------------------------------------------
# Auth Context Definition
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class AuthContext:
    """
    Authenticated request context.

    user_id:
        Supabase Auth user UUID (JWT 'sub' claim)

    email:
        User email when present.

    role:
        Supabase role claim (authenticated)
    """
    user_id: str
    email: str | None = None
    role: str | None = None


# ---------------------------------------------------------------------------
# Core JWT Validation (Hybrid Architecture)
# ---------------------------------------------------------------------------

def _decode_jwt(token: str) -> dict[str, Any]:
    """
    Validate and decode a Supabase access token dynamically.
    Supports both legacy symmetric (HS256) and modern asymmetric (RS256, ES256) keys.
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.DecodeError:
        raise jwt.InvalidTokenError("Malformed token header")
        
    alg = unverified_header.get("alg")
    
    # Baseline validation options with strict claim requirements
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

    # Delegate issuer and audience validation natively to PyJWT
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
            
        # Verify the key ID exists before attempting network lookup
        if not unverified_header.get("kid"):
            raise jwt.InvalidTokenError("Missing 'kid' in token header for asymmetric key")
            
        try:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            decode_kwargs["key"] = signing_key.key
        except jwt.PyJWKClientError as e:
            logger.info("Failed to retrieve signing key from JWKS: %s", e)
            raise jwt.InvalidTokenError("Unable to resolve signing key")
            
    # 3. Reject unknown algorithms immediately
    else:
        logger.info("Unsupported JWT algorithm presented: %s", alg)
        raise jwt.InvalidAlgorithmError(f"Unsupported algorithm: {alg}")

    # Decode using the dynamically configured key and native parameters
    return jwt.decode(**decode_kwargs)


# ---------------------------------------------------------------------------
# FastAPI Dependencies
# ---------------------------------------------------------------------------

def get_auth_context(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> AuthContext:
    """
    FastAPI dependency that validates a Supabase JWT and returns
    a typed authentication context.
    """
    token = credentials.credentials

    try:
        payload = _decode_jwt(token)

        # We can safely use bracket notation because 'role' and 'sub' are explicitly required
        role = payload["role"]
        user_id = payload["sub"]

        # Strict Role Allow-listing
        if role not in ALLOWED_ROLES:
            logger.info("Token role '%s' rejected. Expected one of: %s", role, ALLOWED_ROLES)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        try:
            UUID(user_id)
        except (TypeError, ValueError):
            logger.info("JWT invalid 'sub' claim: %s", user_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid subject claim",
            )

        return AuthContext(
            user_id=user_id,
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
        logger.info("JWT presented before its valid timeframe (nbf/iat check failed)")
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
    Convenience dependency for routes that only need user_id.
    """
    return auth.user_id


# ---------------------------------------------------------------------------
# Backward Compatibility for Existing Routes
# ---------------------------------------------------------------------------

def get_current_tenant(
    auth: AuthContext = Depends(get_auth_context),
) -> str:
    """
    Compatibility alias for existing routes.

    Returns authenticated user_id.
    TODO: Replace with real tenant resolution.
    """
    return auth.user_id


# ---------------------------------------------------------------------------
# Health / Verification Route
# ---------------------------------------------------------------------------

@router.get("/me", tags=["auth"])
def verify_auth(
    auth: AuthContext = Depends(get_auth_context),
):
    """
    Test endpoint to verify if the frontend is passing the Bearer token correctly.
    """
    return {
        "authenticated": True,
        "user_id": auth.user_id,
        "email": auth.email,
        "role": auth.role,
    }