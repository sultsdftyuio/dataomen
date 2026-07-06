import logging
from datetime import datetime, timezone
from typing import Optional, List, Literal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, ConfigDict, StringConstraints
from typing_extensions import Annotated

# Use canonical auth dependencies directly
from api.database import get_supabase
from api.auth import get_auth_context, AuthContext, get_current_tenant_id
from api.services.security.api_keys import ApiKeyVault

router = APIRouter(prefix="/v1/api-keys", tags=["Developer Vault"])
logger = logging.getLogger(__name__)


def _is_unique_violation(exc: Exception) -> bool:
    details = [str(exc)]
    for attr in ("code", "message", "details", "hint"):
        value = getattr(exc, attr, None)
        if value:
            details.append(str(value))

    error_text = " ".join(details).lower()
    return (
        "23505" in error_text
        or "duplicate key" in error_text
        or "uix_api_keys_tenant_active" in error_text
    )


def _insert_api_key(supabase, db_record):
    return supabase.table("api_keys").insert(db_record).execute()


def _revoke_active_keys(
    supabase,
    *,
    tenant_id: str,
    revoked_at: str,
    exclude_key_id: Optional[str] = None,
):
    query = (
        supabase.table("api_keys")
        .update({"revoked_at": revoked_at})
        .eq("tenant_id", tenant_id)
        .is_("revoked_at", "null")
    )

    if exclude_key_id:
        query = query.neq("key_id", exclude_key_id)

    return query.execute()

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
    model_config = ConfigDict(extra="forbid")

    name: NameType

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
    auth: AuthContext = Depends(get_auth_context),
    tenant_id: str = Depends(get_current_tenant_id),
    supabase = Depends(get_supabase)
):
    """
    Generates a new production API key.
    SECURITY: The plaintext_key is returned EXACTLY ONCE to the client.
    """
    try:
        # 1. Generate the cryptographic pair (Never hits DB yet)
        key_data = ApiKeyVault.generate_key_pair(
            name=payload.name,
            tenant_id=tenant_id,
        )

        db_record = key_data["db_record"]
        
        # Add creator metadata
        db_record["created_by"] = auth.user_id

        # 2. Persist the hash and metadata to the Vault (Supabase).
        # The database enforces one active key per tenant. Insert first so a
        # transient insert failure never revokes the caller's existing key.
        try:
            response = _insert_api_key(supabase, db_record)
        except Exception as exc:
            if not _is_unique_violation(exc):
                raise

            revoked_at = datetime.now(timezone.utc).isoformat()
            _revoke_active_keys(
                supabase,
                tenant_id=tenant_id,
                revoked_at=revoked_at,
            )

            try:
                response = _insert_api_key(supabase, db_record)
            except Exception as retry_exc:
                if _is_unique_violation(retry_exc):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="A concurrent API key rotation is in progress. Please retry.",
                    )
                raise
        else:
            revoked_at = datetime.now(timezone.utc).isoformat()
            try:
                _revoke_active_keys(
                    supabase,
                    tenant_id=tenant_id,
                    revoked_at=revoked_at,
                    exclude_key_id=db_record["key_id"],
                )
            except Exception:
                logger.exception(
                    "API key cleanup revoke failed",
                    extra={"tenant_id": tenant_id, "key_id": db_record["key_id"]},
                )

        # Ensure Supabase actually persisted the record
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to persist API key to the vault."
            )

        # 3. Sync active key prefix with tenant_settings (matches Next.js behavior)
        supabase.table("tenant_settings").upsert(
            {
                "tenant_id": tenant_id, 
                "api_key": db_record["key_id"], 
                "key_last_updated": db_record["created_at"]
            }
        ).execute()

        # 4. Return the payload. The plaintext_key leaves the server here and is never seen again.
        return KeyGenerationResponse(
            plaintext_key=key_data["plaintext_key"],
            masked_key=key_data["masked_key"],
            key_id=db_record["key_id"],
            name=key_data["name"]
        )

    except HTTPException:
        raise
    except Exception:
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
    tenant_id: str = Depends(get_current_tenant_id),
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
    tenant_id: str = Depends(get_current_tenant_id),
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
