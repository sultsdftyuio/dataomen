"""
ARCLI.TECH - API Ingestion Layer
Component: Secure Webhook & Billing Router
Strategy: Edge-Verified Ingestion & Asynchronous Task Offloading
"""

import os
import hmac
import hashlib
import logging
from typing import Dict, Any

from fastapi import APIRouter, Depends, Request, Header, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

# Core Infrastructure
from api.database import get_db
from api.services.lemon_squeezy_service import LemonSqueezyService
from api.services.cache_manager import cache_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])

# Environment Secrets
LEMON_SQUEEZY_WEBHOOK_SECRET = os.getenv("LEMON_SQUEEZY_WEBHOOK_SECRET", "")
INTERNAL_ROUTING_SECRET = os.getenv("ARCLI_INTERNAL_SECRET", "dev_override_token")

# ---------------------------------------------------------------------------
# LEMON SQUEEZY BILLING LIFECYCLE
# ---------------------------------------------------------------------------

def verify_lemon_squeezy_signature(raw_body: bytes, signature: str) -> bool:
    """
    Validates the cryptographic HMAC-SHA256 signature provided by Lemon Squeezy.
    Uses compare_digest to prevent timing attacks.
    """
    if not signature or not LEMON_SQUEEZY_WEBHOOK_SECRET:
        return False
        
    expected_signature = hmac.new(
        LEMON_SQUEEZY_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected_signature, signature)


@router.post("/lemonsqueezy", status_code=status.HTTP_202_ACCEPTED)
async def handle_lemonsqueezy_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_signature: str = Header(None, description="HMAC-SHA256 signature from Lemon Squeezy"),
    db: Session = Depends(get_db)
):
    """
    Receives billing lifecycle events directly from Lemon Squeezy (e.g., subscription_created).
    Executes database updates in a background task to instantly return a 200 OK.
    """
    # 1. Read raw bytes for accurate cryptographic hashing
    raw_body = await request.body()
    
    # 2. Security Boundary: Verify Webhook Authenticity
    if not verify_lemon_squeezy_signature(raw_body, x_signature):
        logger.warning("🚨 Invalid Lemon Squeezy webhook signature detected.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid webhook signature."
        )

    try:
        # 3. Parse verified payload
        payload: Dict[str, Any] = await request.json()
        event_name = payload.get("meta", {}).get("event_name")
        
        if not event_name:
            raise ValueError("Missing 'event_name' in payload meta.")

        # 4. Initialize Modular Billing Service
        billing_service = LemonSqueezyService(db)

        # 5. Offload I/O to Background Task
        # Prevents blocking the main analytical compute thread pool
        background_tasks.add_task(billing_service.process_webhook, event_name, payload)

        logger.info(f"✅ Accepted billing lifecycle event: {event_name}")
        return {"status": "accepted", "message": f"Event {event_name} queued for processing."}

    except ValueError as ve:
        logger.error(f"Payload validation error: {str(ve)}")
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve))
    except Exception as e:
        logger.error(f"Critical failure routing billing webhook: {str(e)}")
        # Return 500 so Lemon Squeezy's exponential backoff retry logic kicks in
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal routing failure.")


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
    x_internal_secret: str = Header(..., description="Internal cluster security token")
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

    # 3. Offload Cache Invalidation
    # Fast-return prevents the heavy Sync Engine from hanging while Redis/Vector caches clear
    background_tasks.add_task(
        cache_manager.invalidate_dataset_cache, 
        tenant_id=payload.tenant_id, 
        dataset_id=payload.dataset_id
    )
    
    logger.info(f"🧹 [{payload.tenant_id}] Queued semantic cache invalidation for dataset {payload.dataset_id}")
    return {"status": "accepted", "message": "Cache invalidation queued."}