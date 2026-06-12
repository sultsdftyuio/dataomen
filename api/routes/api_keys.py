import logging
from datetime import datetime, timezone
from typing import Optional, List, Literal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, StringConstraints
from typing_extensions import Annotated

# Adjust these imports to match your project's internal structure
from api.database import get_supabase_admin_client  # Renamed for clarity on service-role usage
from api.auth import verify_tenant_access
from api.services.security.api_keys import ApiKeyVault

# Optional: Import Supabase-specific exception for better observability
# from postgrest.exceptions import APIError

router = APIRouter(prefix="/v1/api-keys", tags=["Developer Vault"])
logger = logging.getLogger(__name__)

# --- Custom Types & Request/Response Models ---

# Pydantic v2 strict regex validation for exactly 16 hex characters
KeyId = Annotated[
    str,
    StringConstraints(pattern=r"^[0-9a-f]{16}$")
]

NameType = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=64,
    ),
]

class GenerateKeyRequest(BaseModel):
    name: NameType
    expires_at: Optional[datetime] = None

class KeyGenerationResponse(BaseModel):
    plaintext_key: str
    masked_key: str
    key_id: str
    name: str

class RevokeKeyRequest(BaseModel):
    key_id: KeyId

class RevokeResponse(BaseModel):
    status: Literal["revoked", "already_revoked"]
    key_id: str
    revoked_at: Optional[datetime] = None

class ApiKeyMetadata(BaseModel):
    key_id: str
    name: str
    masked_key: str
    created_at: datetime
    expires_at: Optional[datetime]
    last_used_at: Optional[datetime]
    is_revoked: bool

class PaginatedApiKeyResponse(BaseModel):
    items: List[ApiKeyMetadata]
    total: int
    limit: int
    offset: int

# --- Endpoints ---

@router.post("/generate", response_model=KeyGenerationResponse, status_code=status.HTTP_201_CREATED)
async def generate_api_key(
    payload: GenerateKeyRequest,
    tenant_id: str = Depends(verify_tenant_access),
    supabase = Depends(get_supabase_admin_client)
):
    """
    Generates a new production API key.
    SECURITY: The plaintext_key is returned EXACTLY ONCE to the client.
    """
    # 1. Validate Expiration Date
    if payload.expires_at:
        expires = payload.expires_at
        if expires.tzinfo is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="expires_at must include timezone information."
            )
        if expires <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="expires_at must be a timestamp in the future."
            )

    # 2. Soft limit: prevent abuse by capping active keys per tenant
    existing = (
        supabase.table("api_keys")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .eq("is_revoked", False)
        .execute()
    )
    if existing.count >= 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum number of active API keys reached."
        )

    try:
        # 3. Generate the cryptographic pair (Never hits DB yet)
        key_data = ApiKeyVault.generate_key_pair(
            name=payload.name,
            tenant_id=tenant_id,
            expires_at=payload.expires_at
        )

        db_record = key_data["db_record"]

        # 4. Persist the hash and metadata to the Vault (Supabase)
        response = supabase.table("api_keys").insert(db_record).execute()

        # Ensure Supabase actually persisted the record
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to persist API key to the vault."
            )

        # 5. Return the payload. The plaintext_key leaves the server here and is never seen again.
        return KeyGenerationResponse(
            plaintext_key=key_data["plaintext_key"],
            masked_key=db_record["masked_key"],
            key_id=db_record["key_id"],
            name=db_record["name"]
        )

    except HTTPException:
        # Prevent catching our own HTTPExceptions
        raise
    # except APIError:
    #     logger.exception(
    #         "API key generation failed — Supabase persistence error",
    #         extra={"tenant_id": tenant_id},
    #     )
    #     raise HTTPException(
    #         status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    #         detail="An internal persistence error occurred."
    #     )
    except Exception:
        # Use logger.exception to capture the full traceback
        logger.exception(
            "API key generation failed",
            extra={"tenant_id": tenant_id},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal cryptographic or persistence error occurred."
        )


@router.post("/revoke", response_model=RevokeResponse, status_code=status.HTTP_200_OK)
async def revoke_api_key(
    payload: RevokeKeyRequest,
    tenant_id: str = Depends(verify_tenant_access),
    supabase = Depends(get_supabase_admin_client)
):
    """
    Idempotently invalidates an API key.
    """
    now = datetime.now(timezone.utc)

    try:
        # SECURITY: Explicitly chain `.eq("tenant_id", tenant_id)` to prevent IDOR.
        # Add `.eq("is_revoked", False)` to prevent race conditions and allow idempotency checks.
        response = supabase.table("api_keys").update({
            "is_revoked": True,
            "revoked_at": now
        }).eq("key_id", payload.key_id).eq("tenant_id", tenant_id).eq("is_revoked", False).execute()

        # If rows were updated, revocation was successful
        if response.data:
            return RevokeResponse(
                status="revoked",
                key_id=payload.key_id,
                revoked_at=now
            )

        # If no rows were updated, check if the key exists at all for this tenant
        check = supabase.table("api_keys").select("is_revoked").eq("key_id", payload.key_id).eq("tenant_id", tenant_id).execute()

        if not check.data:
            # Ambiguous 404 prevents enumeration attacks (keeps bad actors guessing if key or tenant is wrong)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="API key not found or you do not have permission to revoke it."
            )

        # If the key exists but wasn't updated, it was already revoked
        return RevokeResponse(
            status="already_revoked",
            key_id=payload.key_id,
            revoked_at=None
        )

    except HTTPException:
        raise
    # except APIError:
    #     logger.exception(
    #         "API key revocation failed — Supabase persistence error",
    #         extra={
    #             "tenant_id": tenant_id,
    #             "key_id": payload.key_id,
    #         },
    #     )
    #     raise HTTPException(
    #         status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    #         detail="Failed to revoke API key."
    #     )
    except Exception:
        logger.exception(
            "API key revocation failed",
            extra={
                "tenant_id": tenant_id,
                "key_id": payload.key_id,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to revoke API key."
        )


@router.get("/", response_model=PaginatedApiKeyResponse, status_code=status.HTTP_200_OK)
async def list_api_keys(
    tenant_id: str = Depends(verify_tenant_access),
    supabase = Depends(get_supabase_admin_client),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """
    Lists all API keys for the authenticated tenant.
    SECURITY: Never returns plaintext keys, only masked metadata.
    """
    try:
        response = (
            supabase.table("api_keys")
            .select(
                "key_id, name, masked_key, created_at, expires_at, last_used_at, is_revoked",
                count="exact",
            )
            .eq("tenant_id", tenant_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        return PaginatedApiKeyResponse(
            items=response.data or [],
            total=response.count or 0,
            limit=limit,
            offset=offset,
        )

    except Exception:
        logger.exception(
            "Failed to list API keys",
            extra={"tenant_id": tenant_id},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while fetching API keys."
        )