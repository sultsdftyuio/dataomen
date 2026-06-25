import logging
from datetime import datetime, timezone
from typing import Optional, List, Literal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, StringConstraints
from typing_extensions import Annotated

# Adjust these imports to match your project's internal structure
from api.database import get_supabase
from api.auth import get_auth_context, AuthContext
from api.services.security.api_keys import ApiKeyVault

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


# --- Dependencies ---

async def get_real_tenant_id(
    auth: AuthContext = Depends(get_auth_context), 
    supabase = Depends(get_supabase)
) -> str:
    """
    Resolve the real tenant_id for the user.
    auth.user_id is the user's UUID, not the tenant_id. We must look it up.
    """
    response = supabase.table("tenant_users").select("tenant_id").eq("user_id", auth.user_id).execute()
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not associated with any tenant."
        )
    return response.data[0]["tenant_id"]


# --- Endpoints ---

@router.post("/generate", response_model=KeyGenerationResponse, status_code=status.HTTP_201_CREATED)
async def generate_api_key(
    payload: GenerateKeyRequest,
    auth: AuthContext = Depends(get_auth_context),
    tenant_id: str = Depends(get_real_tenant_id),
    supabase = Depends(get_supabase)
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
    # Uses .is_("revoked_at", "null") instead of the missing .eq("is_revoked", False)
    existing = (
        supabase.table("api_keys")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .is_("revoked_at", "null")
        .execute()
    )
    
    if existing.count is not None and existing.count >= 100:
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
        
        # Add creator metadata
        db_record["created_by"] = auth.user_id

        # 4. Persist the hash and metadata to the Vault (Supabase)
        response = supabase.table("api_keys").insert(db_record).execute()

        # Ensure Supabase actually persisted the record
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to persist API key to the vault."
            )

        # 5. Sync active key prefix with tenant_settings (matches Next.js behavior)
        supabase.table("tenant_settings").upsert(
            {
                "tenant_id": tenant_id, 
                "api_key": db_record["key_id"], 
                "key_last_updated": db_record["created_at"]
            }
        ).execute()

        # 6. Return the payload. The plaintext_key leaves the server here and is never seen again.
        return KeyGenerationResponse(
            plaintext_key=key_data["plaintext_key"],
            masked_key=key_data["masked_key"],
            key_id=db_record["key_id"],
            name=key_data["name"]
        )

    except HTTPException:
        # Prevent catching our own HTTPExceptions
        raise
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
    tenant_id: str = Depends(get_real_tenant_id),
    supabase = Depends(get_supabase)
):
    """
    Idempotently invalidates an API key.
    """
    now = datetime.now(timezone.utc).isoformat()

    try:
        # SECURITY: Explicitly chain `.eq("tenant_id", tenant_id)` to prevent IDOR.
        # Add `.is_("revoked_at", "null")` to prevent race conditions and allow idempotency checks.
        response = supabase.table("api_keys").update({
            "revoked_at": now
        }).eq("key_id", payload.key_id).eq("tenant_id", tenant_id).is_("revoked_at", "null").execute()

        # If rows were updated, revocation was successful
        if response.data:
            return RevokeResponse(
                status="revoked",
                key_id=payload.key_id,
                revoked_at=datetime.fromisoformat(now)
            )

        # If no rows were updated, check if the key exists at all for this tenant
        check = supabase.table("api_keys").select("revoked_at").eq("key_id", payload.key_id).eq("tenant_id", tenant_id).execute()

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
            revoked_at=datetime.fromisoformat(check.data[0]["revoked_at"]) if check.data[0].get("revoked_at") else None
        )

    except HTTPException:
        raise
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


@router.get("", response_model=PaginatedApiKeyResponse, status_code=status.HTTP_200_OK)
async def list_api_keys(
    tenant_id: str = Depends(get_real_tenant_id),
    supabase = Depends(get_supabase),
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
                "key_id, label, key_last4, created_at, revoked_at, last_used_at",
                count="exact",
            )
            .eq("tenant_id", tenant_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        items = []
        for row in response.data or []:
            # Reconstruct masked key to match frontend expectation
            masked_key = f"{ApiKeyVault.PREFIX}_{row['key_id']}_...{row['key_last4']}"
            
            items.append(ApiKeyMetadata(
                key_id=row["key_id"],
                name=row.get("label") or "",
                masked_key=masked_key,
                created_at=datetime.fromisoformat(row["created_at"]),
                expires_at=None,
                last_used_at=datetime.fromisoformat(row["last_used_at"]) if row.get("last_used_at") else None,
                is_revoked=row.get("revoked_at") is not None
            ))

        return PaginatedApiKeyResponse(
            items=items,
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