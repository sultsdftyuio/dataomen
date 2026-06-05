# api/auth.py
import os
import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import jwt
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
# Security Configuration
# ---------------------------------------------------------------------------

security = HTTPBearer(auto_error=True)

SUPABASE_URL = os.getenv("SUPABASE_URL")

if not SUPABASE_URL:
    logger.warning(
        "SUPABASE_URL not configured; issuer validation disabled"
    )

EXPECTED_ISSUER = (
    f"{SUPABASE_URL.rstrip('/')}/auth/v1"
    if SUPABASE_URL
    else None
)

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
        Supabase role claim (authenticated/service_role/etc.)
    """
    user_id: str
    email: str | None = None
    role: str | None = None


# ---------------------------------------------------------------------------
# Core JWT Validation
# ---------------------------------------------------------------------------

def _get_jwt_secret() -> str:
    secret = os.getenv("SUPABASE_JWT_SECRET")

    if not secret:
        raise RuntimeError(
            "SUPABASE_JWT_SECRET environment variable is required"
        )

    return secret


def _decode_jwt(token: str) -> dict[str, Any]:
    """
    Validate and decode a Supabase access token.

    Security properties:
    - Signature verification
    - Expiration verification
    - Algorithm allow-list
    - Optional issuer validation
    """
    payload = jwt.decode(
        token,
        _get_jwt_secret(),
        algorithms=["HS256"],
        options={
            "verify_signature": True,
            "verify_exp": True,
            "verify_aud": False,
        },
    )

    if EXPECTED_ISSUER:
        issuer = payload.get("iss")

        if issuer != EXPECTED_ISSUER:
            logger.warning(
                "JWT issuer mismatch: expected=%s actual=%s",
                EXPECTED_ISSUER,
                issuer,
            )

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token issuer",
            )

    return payload


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

        role = payload.get("role")

        if role == "service_role":
            logger.warning("Service role token rejected")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Service role tokens not permitted",
            )

        user_id = payload.get("sub")

        if not user_id:
            logger.warning("JWT missing required 'sub' claim")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )

        try:
            UUID(user_id)
        except (TypeError, ValueError):
            logger.warning("JWT invalid 'sub' claim: %s", user_id)
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

    except jwt.InvalidTokenError:
        logger.info("Invalid JWT presented")
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