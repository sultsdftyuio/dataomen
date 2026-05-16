"""
Lemon Squeezy webhook processing.

This is a minimal handler to keep webhook ingestion operational. Extend with
billing state updates as needed.
"""

import logging
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class LemonSqueezyService:
    def __init__(self, db: Optional[Session] = None) -> None:
        self.db = db

    def process_webhook(self, event_name: str, payload: Dict[str, Any]) -> None:
        if not event_name:
            logger.warning("lemonsqueezy_webhook_missing_event")
            return

        logger.info("lemonsqueezy_webhook_received event=%s", event_name)
        _ = payload
