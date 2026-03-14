# api/routes/webhooks.py

import logging
from fastapi import APIRouter, Depends, Request, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any

from database import get_db
from services.lemon_squeezy_service import LemonSqueezyService

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