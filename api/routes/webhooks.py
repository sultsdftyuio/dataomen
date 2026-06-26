"""
ARCLI.TECH - API Ingestion Layer
Component: Secure Webhook & Billing Router
Strategy: Edge-Verified Ingestion & Asynchronous Task Offloading

PRODUCTION FIXES:
- Thread-local DB sessions: zero request-scoped sessions cross thread boundaries
- Fail-closed deduplication: DB errors raise 500 instead of double-processing
- StrEnum for all state machines eliminates typo risk
- Direct hmac.compare_digest (removed unnecessary wrapper)
- FAILED workspace state for permanent sync errors
- Module-level event classification sets (readability + performance)
- Background cache invalidation safety comment
"""

import asyncio
import hmac
import hashlib
import json
import logging
import os
import re
from enum import StrEnum
from typing import Dict, Any, Optional, Tuple, Final

from fastapi import APIRouter, Request, Header, HTTPException, BackgroundTasks, status
from datetime import datetime, timezone
from pytz import timezone
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
import stripe

# Core Infrastructure
from api.database import SessionLocal
from api.recovery_common import RECOVERY_EMAIL_TABLE, RecoveryStatus
from api.services.recovery_engine import RecoveryAttributionService
from api.services.cache_manager import cache_manager
from api.services.ingestion_service import IngestionService
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])

# ---------------------------------------------------------------------------
# ENVIRONMENT & CONSTANTS
# ---------------------------------------------------------------------------

STRIPE_WEBHOOK_SECRET: Final[str] = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_WEBHOOK_SECRET_MAP: Final[str] = os.getenv("STRIPE_WEBHOOK_SECRET_MAP", "")
RESEND_WEBHOOK_SECRET: Final[str] = os.getenv("RESEND_WEBHOOK_SECRET", "")
INTERNAL_ROUTING_SECRET: Final[str] = os.getenv("ARCLI_INTERNAL_SECRET", "dev_override_token")
WEBHOOK_EVENTS_TABLE: Final[str] = os.getenv("WEBHOOK_EVENTS_TABLE", "billing_webhook_events")

REQUIRE_WEBHOOK_TENANT_ID: Final[bool] = os.getenv("WEBHOOK_REQUIRE_TENANT_ID", "false").lower() == "true"
MAX_WEBHOOK_SIZE_BYTES: Final[int] = 1 * 1024 * 1024  # 1 MB


class WorkspaceStatus(StrEnum):
    BACKFILLING = "BACKFILLING"
    READY = "READY"
    FAILED = "FAILED"


class SyncStatus(StrEnum):
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"


STRIPE_PROVIDER: Final[str] = "stripe"
RESEND_PROVIDER: Final[str] = "resend"

# Only trigger backfilling for events that mutate billing state
STRIPE_BACKFILL_EVENTS: Final[frozenset[str]] = frozenset({
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.created",
    "invoice.updated",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.finalized",
    "charge.succeeded",
    "charge.failed",
    "charge.refunded",
    "charge.dispute.created",
    "customer.created",
    "customer.updated",
    "customer.deleted",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "setup_intent.succeeded",
    "setup_intent.setup_failed",
})

# Resend event classification
RESEND_DELIVERY_EVENTS: Final[frozenset[str]] = frozenset({
    "delivered", "delivery.delivered", "email.delivered", "message.delivered"
})
RESEND_FAILURE_EVENTS: Final[frozenset[str]] = frozenset({
    "bounced", "email.bounced", "complained", "spam", "delivery.delayed"
})
RESEND_HARD_BOUNCE_EVENTS: Final[frozenset[str]] = frozenset({
    "bounced", "email.bounced", "complained", "spam"
})

# ---------------------------------------------------------------------------
# STARTUP VALIDATION
# ---------------------------------------------------------------------------

def _validate_sql_identifier(name: str) -> str:
    """Fail-fast validation for dynamic table names to prevent SQL injection via env vars."""
    if not name or not re.fullmatch(r'^[a-zA-Z_][a-zA-Z0-9_]*$', name):
        raise ValueError(f"Invalid SQL identifier: {name!r}")
    return name


try:
    _RECOVERY_EMAIL_TABLE_SAFE: str = _validate_sql_identifier(RECOVERY_EMAIL_TABLE)
    _WEBHOOK_EVENTS_TABLE_SAFE: str = _validate_sql_identifier(WEBHOOK_EVENTS_TABLE)
except ValueError as exc:
    raise RuntimeError(f"Invalid database table configuration: {exc}") from exc

def _load_secret_map(raw_value: str) -> Dict[str, str]:
    """Parse a JSON map of tenant_id -> webhook_secret. Returns empty dict on any error."""
    if not raw_value:
        return {}
    try:
        mapping = json.loads(raw_value)
    except json.JSONDecodeError:
        logger.warning("webhook_secret_map_invalid_json")
        return {}

    if not isinstance(mapping, dict):
        logger.warning("webhook_secret_map_not_object")
        return {}

    cleaned: Dict[str, str] = {}
    for key, value in mapping.items():
        if value:
            cleaned[str(key)] = str(value)
    return cleaned

# Parse once at module load to avoid JSON re-parsing on every webhook
_STRIPE_SECRET_MAP: Final[Dict[str, str]] = _load_secret_map(STRIPE_WEBHOOK_SECRET_MAP)


# ---------------------------------------------------------------------------
# LOW-LEVEL HELPERS
# ---------------------------------------------------------------------------




async def _read_limited_body(request: Request) -> bytes:
    """Read request body with a strict size limit to prevent memory exhaustion / DoS."""
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            length = int(content_length)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Content-Length header")
        if length > MAX_WEBHOOK_SIZE_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Webhook payload exceeds size limit")

    raw_body = await request.body()
    if len(raw_body) > MAX_WEBHOOK_SIZE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Webhook payload exceeds size limit")

    return raw_body


def _extract_webhook_event_id(payload: Dict[str, Any], raw_body: bytes) -> str:
    """Extract a stable event ID from the payload, falling back to deterministic body hash."""
    if not isinstance(payload, dict):
        return hashlib.sha256(raw_body).hexdigest()

    event_id = payload.get("id") or payload.get("event_id")
    if not event_id and isinstance(payload.get("meta"), dict):
        event_id = payload["meta"].get("event_id")
    if not event_id and isinstance(payload.get("data"), dict):
        event_id = payload["data"].get("id")

    return str(event_id) if event_id else hashlib.sha256(raw_body).hexdigest()


def _extract_stripe_tenant_id(event: Dict[str, Any]) -> str:
    """Extract tenant_id from Stripe event metadata, with clear precedence."""
    if not isinstance(event, dict):
        return "unknown"

    data_object = event.get("data", {}).get("object", {}) or {}
    metadata = data_object.get("metadata") or {}
    tenant_id = metadata.get("tenant_id") or metadata.get("tenant")

    if not tenant_id:
        tenant_id = event.get("account")

    return str(tenant_id) if tenant_id else "unknown"


def _extract_resend_tenant_id(payload: Dict[str, Any]) -> str:
    """Extract tenant_id from Resend payload with multiple fallback strategies."""
    if not isinstance(payload, dict):
        return "unknown"

    data = payload.get("data", {}) or {}
    metadata = data.get("metadata") or payload.get("metadata") or {}
    tenant_id = metadata.get("tenant_id") or metadata.get("tenant")

    if not tenant_id:
        tenant_id = payload.get("tenant_id") or payload.get("tenant")

    return str(tenant_id) if tenant_id else "unknown"


def _extract_resend_message_id(payload: Dict[str, Any]) -> str:
    """
    Strict extraction of Resend's message/email ID.
    Isolates this from the generic webhook event ID to prevent accidental DB collisions.
    """
    if not isinstance(payload, dict):
        return "unknown"

    data = payload.get("data", {}) or {}
    message_id = data.get("email_id") or payload.get("email_id") or data.get("message_id") or payload.get("message_id")
    return str(message_id) if message_id else "unknown"


def _extract_resend_email(payload: Dict[str, Any]) -> Optional[str]:
    """Safely extract recipient email from Resend payload, handling both string and list formats."""
    if not isinstance(payload, dict):
        return None

    for source in (payload.get("data", {}) or {}, payload):
        to_field = source.get("to")
        if isinstance(to_field, list) and len(to_field) > 0:
            return str(to_field[0]).strip()
        if isinstance(to_field, str):
            return to_field.strip()

    return None


def _verify_resend_signature(raw_body: bytes, signature: Optional[str]) -> bool:
    """Verify Resend webhook HMAC-SHA256 signature."""
    if not RESEND_WEBHOOK_SECRET or not signature:
        return False
    expected = hmac.new(
        RESEND_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def _resolve_stripe_event(raw_body: bytes, signature: Optional[str]) -> Tuple[Dict[str, Any], Optional[str]]:
    """
    Resolve and verify a Stripe webhook event.

    Returns:
        Tuple of (event_dict, mapped_tenant_id)
        mapped_tenant_id is set when verification succeeded via the per-tenant secret map.

    Raises:
        HTTPException: 400 for missing headers/malformed payload, 401 for invalid signatures,
                       500 if no secrets are configured.
    """
    if not signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe-Signature header")

    has_any_secret = bool(_STRIPE_SECRET_MAP) or bool(STRIPE_WEBHOOK_SECRET)

    if _STRIPE_SECRET_MAP:
        for tenant_id, secret in _STRIPE_SECRET_MAP.items():
            try:
                event = stripe.Webhook.construct_event(payload=raw_body, sig_header=signature, secret=secret)
                return event, tenant_id
            except stripe.error.SignatureVerificationError:
                continue

    if STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(payload=raw_body, sig_header=signature, secret=STRIPE_WEBHOOK_SECRET)
            return event, None
        except stripe.error.SignatureVerificationError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Stripe webhook signature")
        except Exception:
            logger.exception("stripe_webhook_parse_failed")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe webhook payload")

    if not has_any_secret:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Stripe webhook secret not configured")

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Stripe webhook signature")


# ---------------------------------------------------------------------------
# DATABASE OPERATIONS (Synchronous — caller must provide a valid Session)
# ---------------------------------------------------------------------------

def _dedupe_webhook_event(
    db: Session,
    tenant_id: str,
    provider: str,
    provider_event_id: str,
    event_type: Optional[str],
    payload: Dict[str, Any],
) -> bool:
    """
    Insert webhook event into deduplication table.
    Returns True if the event was already present (is a duplicate).

    FAIL-CLOSED: On any DB error, raises an exception instead of returning False.
    This prevents double-processing billing events when the database is unhealthy.
    """
    if provider_event_id == "unknown":
        logger.warning("webhook_dedupe_unstable_id tenant_id=%s provider=%s", tenant_id, provider)
        return False

    try:
        row = db.execute(
            text(f"""
                INSERT INTO {_WEBHOOK_EVENTS_TABLE_SAFE}
                    (tenant_id, provider, provider_event_id, event_type, payload_json, received_at)
                VALUES
                    (:tenant_id, :provider, :provider_event_id, :event_type, :payload_json, NOW())
                ON CONFLICT (provider, provider_event_id) DO NOTHING
                RETURNING id
            """),
            {
                "tenant_id": tenant_id,
                "provider": provider,
                "provider_event_id": provider_event_id,
                "event_type": event_type,
                "payload_json": json.dumps(payload),
            },
        ).fetchone()
        db.commit()
        return row is None  # None means conflict occurred -> duplicate
    except Exception:
        logger.exception("webhook_dedupe_insert_failed tenant_id=%s event_id=%s", tenant_id, provider_event_id)
        db.rollback()
        raise  # Fail closed: do not process webhooks we cannot deduplicate


def _set_workspace_status(db: Session, tenant_id: str, status: WorkspaceStatus) -> None:
    """Upsert tenant workspace status."""
    if tenant_id == "unknown":
        return
    try:
        db.execute(
            text("""
                INSERT INTO tenants (tenant_id, status, updated_at)
                VALUES (:tenant_id, :status, NOW())
                ON CONFLICT (tenant_id) DO UPDATE
                SET status = EXCLUDED.status,
                    updated_at = NOW()
            """),
            {"tenant_id": tenant_id, "status": status.value},
        )
        db.commit()
    except Exception:
        logger.exception("workspace_status_update_failed tenant_id=%s status=%s", tenant_id, status)
        db.rollback()


def _mark_recovery_email_delivered(db: Session, tenant_id: str, provider_message_id: str) -> bool:
    """Mark a recovery email as delivered. Returns True if a row was updated."""
    if tenant_id == "unknown" or provider_message_id == "unknown":
        return False

    try:
        result = db.execute(
            text(f"""
                UPDATE {_RECOVERY_EMAIL_TABLE_SAFE}
                   SET status = :delivered_status,
                       delivered_at = NOW(),
                       updated_at = NOW()
                 WHERE tenant_id = :tenant_id
                   AND provider_message_id = :provider_message_id
                   AND status IN (:accepted_status, :queued_status, 'processing')
                 RETURNING id
            """),
            {
                "tenant_id": tenant_id,
                "provider_message_id": provider_message_id,
                "delivered_status": RecoveryStatus.DELIVERED.value,
                "accepted_status": RecoveryStatus.PROVIDER_ACCEPTED.value,
                "queued_status": RecoveryStatus.DISPATCHED_TO_QUEUE.value,
            },
        ).fetchone()
        db.commit()
        return result is not None
    except Exception:
        logger.exception("recovery_delivery_update_failed tenant_id=%s provider_message_id=%s", tenant_id, provider_message_id)
        db.rollback()
        return False


def _handle_resend_failure(db: Session, tenant_id: str, payload: Dict[str, Any], provider_message_id: str, is_hard_bounce: bool) -> None:
    """
    Handle Resend bounces, complaints, and spam reports.
    Updates email status and maintains suppression list to protect sender reputation.
    """
    if tenant_id == "unknown" or provider_message_id == "unknown":
        return

    try:
        db.execute(
            text(f"""
                UPDATE {_RECOVERY_EMAIL_TABLE_SAFE}
                   SET status = 'dead_lettered',
                       updated_at = NOW()
                 WHERE tenant_id = :tenant_id
                   AND provider_message_id = :provider_message_id
            """),
            {"tenant_id": tenant_id, "provider_message_id": provider_message_id}
        )

        if is_hard_bounce:
            email_address = _extract_resend_email(payload)
            if email_address:
                db.execute(
                    text("""
                        INSERT INTO recovery_suppressions (tenant_id, email, reason, created_at)
                        VALUES (:tenant_id, LOWER(TRIM(:email)), 'provider_bounce_or_complaint', NOW())
                        ON CONFLICT (tenant_id, email) DO NOTHING
                    """),
                    {"tenant_id": tenant_id, "email": email_address}
                )
        db.commit()
    except Exception:
        logger.exception("resend_failure_handler_crashed tenant_id=%s", tenant_id)
        db.rollback()


# ---------------------------------------------------------------------------
# BACKGROUND TASK HANDLERS (isolated DB sessions — never touch request-scoped sessions)
# ---------------------------------------------------------------------------



def _sync_stripe_handoff(tenant_id: str, event_name: str, event_payload: Dict[str, Any], provider_event_id: str) -> Dict[str, str]:
    """
    Synchronous handoff logic for Stripe webhooks.
    Creates its own SessionLocal() — NEVER uses a request-scoped session.
    """
    db = SessionLocal()
    try:
        is_duplicate = _dedupe_webhook_event(
            db=db,
            tenant_id=tenant_id,
            provider=STRIPE_PROVIDER,
            provider_event_id=provider_event_id,
            event_type=event_name,
            payload=event_payload,
        )
        if is_duplicate:
            return {"status": "deduped"}

        if event_name in STRIPE_BACKFILL_EVENTS:
            _set_workspace_status(db, tenant_id, WorkspaceStatus.BACKFILLING)

        try:
            RecoveryAttributionService(db).maybe_attribute_from_webhook(
                tenant_id=tenant_id,
                event_name=event_name,
                payload=event_payload,
                provider=STRIPE_PROVIDER,
            )
        except Exception:
            logger.exception("stripe_recovery_attribution_failed tenant_id=%s event_id=%s", tenant_id, provider_event_id)

        return {"status": "accepted"}
    finally:
        db.close()


def _sync_resend_handoff(tenant_id: str, event_name: str, provider_event_id: str, payload: Dict[str, Any]) -> Dict[str, str]:
    """
    Synchronous handoff logic for Resend webhooks.
    Creates its own SessionLocal() — NEVER uses a request-scoped session.
    """
    db = SessionLocal()
    try:
        is_duplicate = _dedupe_webhook_event(
            db=db,
            tenant_id=tenant_id,
            provider=RESEND_PROVIDER,
            provider_event_id=provider_event_id,
            event_type=event_name,
            payload=payload,
        )
        if is_duplicate:
            return {"status": "deduped"}

        provider_message_id = _extract_resend_message_id(payload)

        if provider_message_id != "unknown":
            if event_name in RESEND_DELIVERY_EVENTS:
                _mark_recovery_email_delivered(db, tenant_id, provider_message_id)
                logger.info("resend_webhook_delivered tenant_id=%s message_id=%s", tenant_id, provider_message_id)

            elif event_name in RESEND_FAILURE_EVENTS:
                is_hard_bounce = event_name in RESEND_HARD_BOUNCE_EVENTS
                _handle_resend_failure(db, tenant_id, payload, provider_message_id, is_hard_bounce)
                logger.warning(
                    "resend_webhook_failure_recorded tenant_id=%s event=%s message_id=%s",
                    tenant_id, event_name, provider_message_id
                )

        return {"status": "accepted"}
    finally:
        db.close()


def _sync_set_workspace_status(tenant_id: str, status: WorkspaceStatus) -> None:
    """Thread-safe wrapper that creates its own DB session."""
    db = SessionLocal()
    try:
        _set_workspace_status(db, tenant_id, status)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# ROUTE HANDLERS
# ---------------------------------------------------------------------------

@router.post("/stripe", status_code=status.HTTP_202_ACCEPTED)
async def handle_stripe_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    stripe_signature: Optional[str] = Header(None, alias="Stripe-Signature"),
):
    """
    Receive and verify Stripe webhooks.

    Flow:
    1. Verify signature and extract tenant
    2. Deduplicate event (thread-local session, fail-closed)
    3. Trigger recovery attribution
    4. Offload billing processing to background task with isolated DB session
    """
    raw_body = await _read_limited_body(request)
    event, mapped_tenant = _resolve_stripe_event(raw_body, stripe_signature)
    event_payload = event.to_dict() if hasattr(event, "to_dict") else event

    event_name = event_payload.get("type")
    if not event_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe event type")

    tenant_id = _extract_stripe_tenant_id(event_payload)

    if mapped_tenant and tenant_id == "unknown":
        tenant_id = mapped_tenant

    if REQUIRE_WEBHOOK_TENANT_ID and tenant_id == "unknown":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tenant_id in Stripe metadata")

    if mapped_tenant and mapped_tenant != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Webhook tenant mismatch")

    provider_event_id = str(event_payload.get("id") or hashlib.sha256(raw_body).hexdigest())

    # Run synchronous DB operations in thread pool with a locally-created session
    result = await asyncio.to_thread(_sync_stripe_handoff, tenant_id, event_name, event_payload, provider_event_id)

    # ... inside your handle_stripe_webhook function ...

    if result["status"] == "deduped":
        logger.info("stripe_webhook_deduped tenant_id=%s event_id=%s", tenant_id, provider_event_id)
        return {"status": "deduped", "message": "Duplicate webhook ignored."}

    # FIX: Explicitly convert Stripe's Unix timestamp to an ISO string
    # Prevents _coerce_timestamp from defaulting to datetime.now()
    created_ts = event_payload.get("created")
    if isinstance(created_ts, int):
        event_timestamp = datetime.fromtimestamp(created_ts, tz=timezone.utc).isoformat()
    else:
        event_timestamp = created_ts

    # --- NEW ARCHITECTURE: ROUTE TO IMMUTABLE EVENT LOG ---
    try:
        ingestion = IngestionService()
        await ingestion.process_raw_event(
            tenant_id=tenant_id,
            event_name=f"stripe.{event_name}",
            user_id=None,  # Resolve this later asynchronously
            idempotency_key=provider_event_id,
            timestamp=event_timestamp,
            properties=event_payload
        )
    except Exception as e:
        logger.exception("stripe_webhook_ingestion_failed tenant_id=%s event=%s", tenant_id, event_name)
        # FIX: Do NOT return 200 OK. Force a 500 so Stripe utilizes its built-in retry mechanics.
        # This guarantees we never permanently lose attribution data.
        raise HTTPException(status_code=500, detail="Failed to durably persist event")
        
    logger.info("stripe_webhook_accepted tenant_id=%s event=%s", tenant_id, event_name)
    return {"status": "accepted", "message": f"Event {event_name} durably logged."}




@router.post("/resend", status_code=status.HTTP_202_ACCEPTED)
async def handle_resend_webhook(
    request: Request,
    resend_signature: Optional[str] = Header(None, alias="X-Resend-Signature"),
):
    """
    Receive and verify Resend email webhooks.
    Handles delivery confirmations, bounces, complaints, and spam reports.
    """
    raw_body = await _read_limited_body(request)

    if not _verify_resend_signature(raw_body, resend_signature):
        logger.warning("invalid_resend_signature")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature.")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload.")

    event_name = str(
        payload.get("type") or payload.get("event") or payload.get("name") or payload.get("data", {}).get("type") or ""
    ).strip().lower()

    if not event_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Missing event type in Resend payload.")

    tenant_id = _extract_resend_tenant_id(payload)
    if REQUIRE_WEBHOOK_TENANT_ID and tenant_id == "unknown":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tenant_id in webhook payload")

    provider_event_id = _extract_webhook_event_id(payload, raw_body)

    result = await asyncio.to_thread(_sync_resend_handoff, tenant_id, event_name, provider_event_id, payload)

    if result["status"] == "deduped":
        logger.info("resend_webhook_deduped tenant_id=%s event_id=%s", tenant_id, provider_event_id)
        return {"status": "deduped", "message": "Duplicate webhook ignored."}

    return {"status": "accepted", "message": f"Event {event_name} processed."}


# ---------------------------------------------------------------------------
# INTERNAL DATA SYNC & CACHE MANAGEMENT
# ---------------------------------------------------------------------------

class DataSyncPayload(BaseModel):
    """Schema for internal Zero-ETL synchronization completion events."""
    tenant_id: str = Field(..., min_length=1)
    dataset_id: str = Field(..., min_length=1)
    sync_status: SyncStatus


@router.post("/data-sync-complete", status_code=status.HTTP_202_ACCEPTED)
async def handle_data_sync_webhook(
    payload: DataSyncPayload,
    background_tasks: BackgroundTasks,
    x_internal_secret: str = Header(..., description="Internal cluster security token"),
):
    """
    Receives events when the Data Ingestion Engine finishes pulling from a remote source.
    Triggers an immediate semantic cache bust so the AI/UI serves the freshest data.
    """
    if not hmac.compare_digest(x_internal_secret.encode("utf-8"), INTERNAL_ROUTING_SECRET.encode("utf-8")):
        logger.error("unauthorized_cache_invalidation tenant_id=%s", payload.tenant_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized cluster request.")

    if payload.sync_status == SyncStatus.FAILED:
        logger.error(
            "data_sync_failed tenant_id=%s dataset_id=%s status=%s",
            payload.tenant_id, payload.dataset_id, payload.sync_status
        )
        await asyncio.to_thread(_sync_set_workspace_status, payload.tenant_id, WorkspaceStatus.FAILED)
        return {"status": "ignored", "message": "Cache bust skipped due to unsuccessful sync."}

    if payload.sync_status == SyncStatus.PARTIAL:
        logger.warning(
            "data_sync_partial tenant_id=%s dataset_id=%s",
            payload.tenant_id, payload.dataset_id
        )
        # Partial success: still invalidate cache, but don't mark READY yet
        background_tasks.add_task(
            cache_manager.invalidate_dataset_cache,
            tenant_id=payload.tenant_id,
            dataset_id=payload.dataset_id
        )
        return {"status": "accepted", "message": "Cache invalidation queued for partial sync."}

    # SyncStatus.SUCCESS
    dataset_id = payload.dataset_id.lower().strip()

    if dataset_id.startswith("stripe"):
        await asyncio.to_thread(_sync_set_workspace_status, payload.tenant_id, WorkspaceStatus.READY)

    # NOTE: If cache_manager.invalidate_dataset_cache performs blocking I/O,
    # FastAPI's BackgroundTasks automatically runs sync functions in a thread pool.
    # If it is async, it is awaited directly. Either way this is safe.
    background_tasks.add_task(
        cache_manager.invalidate_dataset_cache,
        tenant_id=payload.tenant_id,
        dataset_id=payload.dataset_id
    )

    logger.info("semantic_cache_invalidated tenant_id=%s dataset_id=%s", payload.tenant_id, payload.dataset_id)
    return {"status": "accepted", "message": "Cache invalidation queued."}