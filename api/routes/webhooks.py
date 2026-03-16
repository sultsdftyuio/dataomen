# api/routes/webhooks.py

import logging
from fastapi import APIRouter, Depends, Request, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any

from database import get_db
from services.lemon_squeezy_service import LemonSqueezyService
# --- ADD THIS AROUND LINE 9 ---
from services.cache_manager import cache_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])

@router.post("/lemonsqueezy")
async def handle_lemonsqueezy_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Receives billing lifecycle events directly from Lemon Squeezy.
    Executes the database updates in a background task to immediately return a 200 OK,
    preventing Lemon Squeezy from timing out and unnecessarily retrying the webhook.
    """
    try:
        # Parse the incoming JSON payload
        payload: Dict[str, Any] = await request.json()
        
        # Lemon Squeezy includes the event type in the meta object
        event_name = payload.get("meta", {}).get("event_name")
        if not event_name:
            logger.warning("Received Lemon Squeezy webhook without an event_name.")
            raise HTTPException(status_code=400, detail="Missing event_name")

        # Initialize the high-performance billing service
        service = LemonSqueezyService(db)

        # Offload the database I/O to a background task. 
        # This keeps the analytical compute engine thread pool free from blocking I/O.
        background_tasks.add_task(service.process_webhook, event_name, payload)

        logger.info(f"Accepted Lemon Squeezy webhook: {event_name}")
        return {"status": "accepted", "message": f"Webhook {event_name} queued for processing."}

    except ValueError as ve:
        logger.error(f"Validation error in webhook: {str(ve)}")
        raise HTTPException(status_code=422, detail="Unprocessable payload")
    except Exception as e:
        logger.error(f"Critical failure handling Lemon Squeezy webhook: {str(e)}")
        # Returning a 500 ensures Lemon Squeezy's retry logic kicks in if the server is genuinely failing
        raise HTTPException(status_code=500, detail="Internal webhook processing error")
    # --- ADD THIS AT THE BOTTOM OF THE FILE (Around Line 43) ---

class DataSyncPayload(BaseModel):
    tenant_id: str
    dataset_id: str
    sync_status: str

@router.post("/data-sync-complete")
async def handle_data_sync_webhook(
    payload: DataSyncPayload,
    background_tasks: BackgroundTasks
):
    """
    Receives events when a dataset finishes updating from its remote source.
    Triggers an immediate cache bust so users see the freshest data.
    """
    if payload.sync_status != "success":
        return {"status": "ignored", "message": "Sync not successful"}

    # Offload cache busting to background task to respond to webhook instantly
    background_tasks.add_task(
        cache_manager.invalidate_dataset_cache, 
        payload.tenant_id, 
        payload.dataset_id
    )
    
    logger.info(f"[{payload.tenant_id}] Queued cache invalidation for dataset {payload.dataset_id}")
    return {"status": "accepted", "message": "Cache invalidation queued."}