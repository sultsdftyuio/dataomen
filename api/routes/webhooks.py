"""
ARCLI.TECH - API Ingestion Layer
Component: Secure Webhook & Billing Router
Strategy: Edge-Verified Ingestion & Asynchronous Task Offloading
"""

import os
import hmac
import hashlib
import json
import logging
from typing import Dict, Any, Optional, Tuple

from fastapi import APIRouter, Depends, Request, Header, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
import stripe

# Core Infrastructure
from api.database import get_db
from api.recovery_common import RECOVERY_EMAIL_TABLE, RecoveryStatus
from api.services.lemon_squeezy_service import LemonSqueezyService
from api.services.recovery_attribution import RecoveryAttributionService
from api.services.cache_manager import cache_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])

# Environment Secrets
LEMON_SQUEEZY_WEBHOOK_SECRET = os.getenv("LEMON_SQUEEZY_WEBHOOK_SECRET", "")
LEMON_SQUEEZY_WEBHOOK_SECRET_MAP = os.getenv("LEMON_SQUEEZY_WEBHOOK_SECRET_MAP", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_WEBHOOK_SECRET_MAP = os.getenv("STRIPE_WEBHOOK_SECRET_MAP", "")
RESEND_WEBHOOK_SECRET = os.getenv("RESEND_WEBHOOK_SECRET", "")
INTERNAL_ROUTING_SECRET = os.getenv("ARCLI_INTERNAL_SECRET", "dev_override_token")
WEBHOOK_EVENTS_TABLE = os.getenv("WEBHOOK_EVENTS_TABLE", "billing_webhook_events")
LEMON_SQUEEZY_PROVIDER = "lemonsqueezy"
STRIPE_PROVIDER = "stripe"
RESEND_PROVIDER = "resend"
REQUIRE_WEBHOOK_TENANT_ID = os.getenv("WEBHOOK_REQUIRE_TENANT_ID", "false").lower() == "true"
WORKSPACE_STATUS_BACKFILLING = "BACKFILLING"
WORKSPACE_STATUS_READY = "READY"

# ---------------------------------------------------------------------------
# LEMON SQUEEZY BILLING LIFECYCLE
# ---------------------------------------------------------------------------

def _verify_lemon_squeezy_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """
    Validates the cryptographic HMAC-SHA256 signature provided by Lemon Squeezy.
    Uses compare_digest to prevent timing attacks.
    """
    if not signature or not secret:
        return False
        
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)


def _load_secret_map(raw_value: str) -> Dict[str, str]:
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
        if not value:
            continue
        cleaned[str(key)] = str(value)
    return cleaned


def _resolve_lemon_squeezy_secret(raw_body: bytes, signature: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not signature:
        return None, None

    secret_map = _load_secret_map(LEMON_SQUEEZY_WEBHOOK_SECRET_MAP)
    for tenant_id, secret in secret_map.items():
        if _verify_lemon_squeezy_signature(raw_body, signature, secret):
            return secret, tenant_id

    if LEMON_SQUEEZY_WEBHOOK_SECRET and _verify_lemon_squeezy_signature(
        raw_body,
        signature,
        LEMON_SQUEEZY_WEBHOOK_SECRET,
    ):
        return LEMON_SQUEEZY_WEBHOOK_SECRET, None

    return None, None


def _extract_webhook_event_id(payload: Dict[str, Any], raw_body: bytes) -> str:
    meta = payload.get("meta", {}) if isinstance(payload, dict) else {}
    data = payload.get("data", {}) if isinstance(payload, dict) else {}
    event_id = meta.get("event_id") or data.get("id")

    if not event_id:
        return hashlib.sha256(raw_body).hexdigest()

    return str(event_id)


def _extract_tenant_id(payload: Dict[str, Any]) -> str:
    meta = payload.get("meta", {}) if isinstance(payload, dict) else {}
    custom_data = meta.get("custom_data") or {}
    tenant_id = custom_data.get("tenant_id") or custom_data.get("tenant")

    if not tenant_id:
        data = payload.get("data", {}) if isinstance(payload, dict) else {}
        attributes = data.get("attributes") or {}
        tenant_id = attributes.get("tenant_id")

    return str(tenant_id) if tenant_id else "unknown"


def _extract_stripe_tenant_id(event: Dict[str, Any]) -> str:
    data_object = event.get("data", {}).get("object", {}) if isinstance(event, dict) else {}
    metadata = data_object.get("metadata") or {}
    tenant_id = metadata.get("tenant_id") or metadata.get("tenant")

    if not tenant_id:
        tenant_id = event.get("account")

    return str(tenant_id) if tenant_id else "unknown"


def _extract_resend_tenant_id(payload: Dict[str, Any]) -> str:
    data = payload.get("data", {}) if isinstance(payload, dict) else {}
    metadata = data.get("metadata") or payload.get("metadata") or {}
    tenant_id = metadata.get("tenant_id") or metadata.get("tenant")

    if not tenant_id:
        tenant_id = payload.get("tenant_id") or payload.get("tenant")

    return str(tenant_id) if tenant_id else "unknown"


def _extract_resend_message_id(payload: Dict[str, Any]) -> str:
    data = payload.get("data", {}) if isinstance(payload, dict) else {}
    message_id = (
        data.get("email_id")
        or data.get("message_id")
        or data.get("id")
        or payload.get("email_id")
        or payload.get("message_id")
        or payload.get("id")
    )
    return str(message_id) if message_id else "unknown"


def _verify_resend_signature(raw_body: bytes, signature: Optional[str]) -> bool:
    if not RESEND_WEBHOOK_SECRET or not signature:
        return False

    expected_signature = hmac.new(
        RESEND_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected_signature, signature)


def _mark_recovery_email_delivered(
    db: Session,
    tenant_id: str,
    provider_message_id: str,
) -> bool:
    try:
        result = db.execute(
            text(
                f"""
                update {RECOVERY_EMAIL_TABLE}
                   set status = :delivered_status,
                       delivered_at = now(),
                       updated_at = now()
                 where tenant_id = :tenant_id
                   and provider_message_id = :provider_message_id
                   and status in (:accepted_status, :queued_status)
                 returning id
                """
            ),
            {
                "tenant_id": tenant_id,
                "provider_message_id": provider_message_id,
                "delivered_status": RecoveryStatus.DELIVERED.value,
                "accepted_status": RecoveryStatus.PROVIDER_ACCEPTED.value,
                "queued_status": RecoveryStatus.DISPATCHED_TO_QUEUE.value,
            },
        ).fetchone()
        db.commit()
    except Exception:
        logger.exception(
            "recovery_delivery_update_failed tenant=%s provider_message_id=%s",
            tenant_id,
            provider_message_id,
        )
        db.rollback()
        return False

    return result is not None


def _dedupe_webhook_event(
    db: Session,
    tenant_id: str,
    provider: str,
    provider_event_id: str,
    event_type: Optional[str],
    payload: Dict[str, Any],
) -> bool:
    insert_sql = text(
        f"""
        insert into {WEBHOOK_EVENTS_TABLE}
            (tenant_id, provider, provider_event_id, event_type, payload_json, received_at)
        values
            (:tenant_id, :provider, :provider_event_id, :event_type, :payload_json, now())
        on conflict (provider, provider_event_id) do nothing
        returning id
        """
    )

    try:
        row = db.execute(
            insert_sql,
            {
                "tenant_id": tenant_id,
                "provider": provider,
                "provider_event_id": provider_event_id,
                "event_type": event_type,
                "payload_json": json.dumps(payload),
            },
        ).fetchone()
        db.commit()
    except Exception:
        logger.exception(
            "webhook_dedupe_insert_failed tenant=%s event_id=%s",
            tenant_id,
            provider_event_id,
        )
        db.rollback()
        return False

    return row is None


def _dedupe_recovery_delivery_event(
    db: Session,
    tenant_id: str,
    provider_event_id: str,
    event_type: Optional[str],
    payload: Dict[str, Any],
) -> bool:
    return _dedupe_webhook_event(
        db=db,
        tenant_id=tenant_id,
        provider=RESEND_PROVIDER,
        provider_event_id=provider_event_id,
        event_type=event_type,
        payload=payload,
    )


def _set_workspace_status(db: Session, tenant_id: str, status: str) -> None:
    try:
        db.execute(
            text(
                """
                insert into tenants (tenant_id, status)
                values (:tenant_id, :status)
                on conflict (tenant_id) do update
                set status = excluded.status,
                    updated_at = now()
                """
            ),
            {"tenant_id": tenant_id, "status": status},
        )
        db.commit()
    except Exception:
        logger.exception("workspace_status_update_failed tenant=%s status=%s", tenant_id, status)


def _resolve_stripe_event(raw_body: bytes, signature: Optional[str]) -> Tuple[Dict[str, Any], Optional[str]]:
    if not signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe-Signature header",
        )

    secret_map = _load_secret_map(STRIPE_WEBHOOK_SECRET_MAP)
    if secret_map:
        for tenant_id, secret in secret_map.items():
            try:
                event = stripe.Webhook.construct_event(
                    payload=raw_body,
                    sig_header=signature,
                    secret=secret,
                )
                return event, tenant_id
            except stripe.error.SignatureVerificationError:
                continue

        if not STRIPE_WEBHOOK_SECRET:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Stripe webhook signature",
            )

    if STRIPE_WEBHOOK_SECRET:
        try:
            event = stripe.Webhook.construct_event(
                payload=raw_body,
                sig_header=signature,
                secret=STRIPE_WEBHOOK_SECRET,
            )
            return event, None
        except stripe.error.SignatureVerificationError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Stripe webhook signature",
            )
        except Exception:
            logger.exception("stripe_webhook_parse_failed")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Stripe webhook payload",
            )

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Stripe webhook secret not configured",
    )


def _verify_stripe_signature(raw_body: bytes, signature: Optional[str]) -> Dict[str, Any]:
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stripe webhook secret not configured",
        )

    if not signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe-Signature header",
        )

    try:
        return stripe.Webhook.construct_event(
            payload=raw_body,
            sig_header=signature,
            secret=STRIPE_WEBHOOK_SECRET,
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Stripe webhook signature",
        )
    except Exception:
        logger.exception("stripe_webhook_parse_failed")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Stripe webhook payload",
        )


@router.post("/lemonsqueezy", status_code=status.HTTP_202_ACCEPTED)
async def handle_lemonsqueezy_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_signature: Optional[str] = Header(None, description="HMAC-SHA256 signature from Lemon Squeezy"),
    db: Session = Depends(get_db),
):
    """
    Receives billing lifecycle events directly from Lemon Squeezy (e.g., subscription_created).
    Executes database updates in a background task to instantly return a 200 OK.
    """
    # 1. Read raw bytes for accurate cryptographic hashing
    raw_body = await request.body()
    
    # 2. Security Boundary: Verify Webhook Authenticity
    secret, mapped_tenant = _resolve_lemon_squeezy_secret(raw_body, x_signature)
    if not secret:
        logger.warning("invalid_lemon_squeezy_signature")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature.",
        )

    try:
        # 3. Parse verified payload
        payload: Dict[str, Any] = await request.json()
        event_name = payload.get("meta", {}).get("event_name")
        
        if not event_name:
            raise ValueError("Missing 'event_name' in payload meta.")

        tenant_id = _extract_tenant_id(payload)
        if mapped_tenant and tenant_id == "unknown":
            tenant_id = mapped_tenant
        if REQUIRE_WEBHOOK_TENANT_ID and tenant_id == "unknown":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing tenant_id in webhook payload",
            )
        if mapped_tenant and mapped_tenant != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Webhook tenant mismatch",
            )
        provider_event_id = _extract_webhook_event_id(payload, raw_body)

        deduped = _dedupe_webhook_event(
            db=db,
            tenant_id=tenant_id,
            provider=LEMON_SQUEEZY_PROVIDER,
            provider_event_id=provider_event_id,
            event_type=event_name,
            payload=payload,
        )
        if deduped:
            logger.info(
                "webhook_deduped tenant=%s event_id=%s",
                tenant_id,
                provider_event_id,
            )
            return {"status": "deduped", "message": "Duplicate webhook ignored."}

        # 4. Initialize Modular Billing Service
        billing_service = LemonSqueezyService(db)

        # 5. Offload I/O to Background Task
        # Prevents blocking the main analytical compute thread pool
        background_tasks.add_task(billing_service.process_webhook, event_name, payload)

        try:
            RecoveryAttributionService(db).maybe_attribute_from_webhook(
                tenant_id=tenant_id,
                event_name=event_name,
                payload=payload,
                provider=LEMON_SQUEEZY_PROVIDER,
            )
        except Exception:
            logger.exception(
                "recovery_attribution_failed tenant=%s event_id=%s",
                tenant_id,
                provider_event_id,
            )

        logger.info(f"✅ Accepted billing lifecycle event: {event_name}")
        return {"status": "accepted", "message": f"Event {event_name} queued for processing."}

    except ValueError as ve:
        logger.error(f"Payload validation error: {str(ve)}")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Critical failure routing billing webhook: {str(e)}")
        # Return 500 so Lemon Squeezy's exponential backoff retry logic kicks in
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal routing failure.")


@router.post("/stripe", status_code=status.HTTP_202_ACCEPTED)
async def handle_stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="Stripe-Signature"),
    db: Session = Depends(get_db),
):
    raw_body = await request.body()
    event, mapped_tenant = _resolve_stripe_event(raw_body, stripe_signature)
    event_payload = event.to_dict() if hasattr(event, "to_dict") else event

    event_name = event_payload.get("type")
    if not event_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe event type",
        )

    tenant_id = _extract_stripe_tenant_id(event_payload)
    if mapped_tenant and tenant_id == "unknown":
        tenant_id = mapped_tenant
    if REQUIRE_WEBHOOK_TENANT_ID and tenant_id == "unknown":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing tenant_id in Stripe metadata",
        )
    if mapped_tenant and mapped_tenant != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Webhook tenant mismatch",
        )
    provider_event_id = str(event_payload.get("id") or hashlib.sha256(raw_body).hexdigest())

    deduped = _dedupe_webhook_event(
        db=db,
        tenant_id=tenant_id,
        provider=STRIPE_PROVIDER,
        provider_event_id=provider_event_id,
        event_type=event_name,
        payload=event_payload,
    )
    if deduped:
        logger.info(
            "stripe_webhook_deduped tenant=%s event_id=%s",
            tenant_id,
            provider_event_id,
        )
        return {"status": "deduped", "message": "Duplicate webhook ignored."}

    _set_workspace_status(db, tenant_id, WORKSPACE_STATUS_BACKFILLING)

    try:
        RecoveryAttributionService(db).maybe_attribute_from_webhook(
            tenant_id=tenant_id,
            event_name=event_name,
            payload=event_payload,
            provider=STRIPE_PROVIDER,
        )
    except Exception:
        logger.exception(
            "stripe_recovery_attribution_failed tenant=%s event_id=%s",
            tenant_id,
            provider_event_id,
        )

    logger.info("stripe_webhook_accepted tenant=%s event=%s", tenant_id, event_name)
    return {"status": "accepted", "message": f"Event {event_name} queued for processing."}


@router.post("/resend", status_code=status.HTTP_202_ACCEPTED)
async def handle_resend_webhook(
    request: Request,
    resend_signature: Optional[str] = Header(None, alias="X-Resend-Signature"),
    db: Session = Depends(get_db),
):
    raw_body = await request.body()

    if not _verify_resend_signature(raw_body, resend_signature):
        logger.warning("invalid_resend_signature")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature.",
        )

    try:
        payload: Dict[str, Any] = await request.json()
        event_name = str(
            payload.get("type")
            or payload.get("event")
            or payload.get("name")
            or payload.get("data", {}).get("type")
            or ""
        ).strip()

        if not event_name:
            raise ValueError("Missing event type in Resend payload.")

        tenant_id = _extract_resend_tenant_id(payload)
        if REQUIRE_WEBHOOK_TENANT_ID and tenant_id == "unknown":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing tenant_id in webhook payload",
            )

        provider_event_id = _extract_webhook_event_id(payload, raw_body)
        deduped = _dedupe_recovery_delivery_event(
            db=db,
            tenant_id=tenant_id,
            provider_event_id=provider_event_id,
            event_type=event_name,
            payload=payload,
        )
        if deduped:
            logger.info("resend_webhook_deduped tenant=%s event_id=%s", tenant_id, provider_event_id)
            return {"status": "deduped", "message": "Duplicate webhook ignored."}

        provider_message_id = _extract_resend_message_id(payload)
        delivered = False
        if provider_message_id != "unknown" and event_name.lower() in {
            "delivered",
            "delivery.delivered",
            "email.delivered",
            "message.delivered",
        }:
            delivered = _mark_recovery_email_delivered(db, tenant_id, provider_message_id)

        if delivered:
            logger.info(
                "resend_webhook_delivered tenant=%s event_id=%s message_id=%s",
                tenant_id,
                provider_event_id,
                provider_message_id,
            )
        else:
            logger.info(
                "resend_webhook_accepted tenant=%s event=%s message_id=%s",
                tenant_id,
                event_name,
                provider_message_id,
            )

        return {
            "status": "accepted",
            "message": f"Event {event_name} queued for processing.",
            "delivered": delivered,
        }

    except ValueError as ve:
        logger.error("resend_webhook_validation_error %s", str(ve))
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))
    except HTTPException:
        raise
    except Exception:
        logger.exception("resend_webhook_routing_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal routing failure.",
        )


# ---------------------------------------------------------------------------
# INTERNAL DATA SYNC & CACHE MANAGEMENT
# ---------------------------------------------------------------------------

class DataSyncPayload(BaseModel):
    """Schema for internal Zero-ETL synchronization completion events."""
    tenant_id: str
    dataset_id: str
    sync_status: str


@router.post("/data-sync-complete", status_code=status.HTTP_202_ACCEPTED)
async def handle_data_sync_webhook(
    payload: DataSyncPayload,
    background_tasks: BackgroundTasks,
    x_internal_secret: str = Header(..., description="Internal cluster security token"),
    db: Session = Depends(get_db),
):
    """
    Receives events when the Data Ingestion Engine finishes pulling from a remote source.
    Triggers an immediate semantic cache bust so the AI/UI serves the freshest data.
    """
    # 1. Internal Cluster Security Check
    if x_internal_secret != INTERNAL_ROUTING_SECRET:
        logger.error(f"[{payload.tenant_id}] Unauthorized cache invalidation attempt.")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized cluster request.")

    # 2. Status Validation
    if payload.sync_status != "success":
        logger.info(f"[{payload.tenant_id}] Ignored sync webhook for {payload.dataset_id} (Status: {payload.sync_status})")
        return {"status": "ignored", "message": "Cache bust skipped due to unsuccessful sync."}

    dataset_id = payload.dataset_id.lower().strip()
    if dataset_id.startswith("stripe"):
        _set_workspace_status(db, payload.tenant_id, WORKSPACE_STATUS_READY)

    # 3. Offload Cache Invalidation
    # Fast-return prevents the heavy Sync Engine from hanging while Redis/Vector caches clear
    background_tasks.add_task(
        cache_manager.invalidate_dataset_cache, 
        tenant_id=payload.tenant_id, 
        dataset_id=payload.dataset_id
    )
    
    logger.info(f"🧹 [{payload.tenant_id}] Queued semantic cache invalidation for dataset {payload.dataset_id}")
    return {"status": "accepted", "message": "Cache invalidation queued."}