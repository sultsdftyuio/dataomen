# api/services/lemon_squeezy_service.py

import os
import logging
import httpx
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from models import Organization, SubscriptionTier

logger = logging.getLogger(__name__)

class LemonSqueezyConfig:
    """Environment configuration for Lemon Squeezy."""
    API_KEY = os.getenv("LEMON_SQUEEZY_API_KEY")
    STORE_ID = os.getenv("LEMON_SQUEEZY_STORE_ID")
    BASE_URL = "https://api.lemonsqueezy.com/v1"

class LemonSqueezyService:
    """
    Handles SaaS billing lifecycle via Lemon Squeezy.
    Prioritizes raw processing speed and atomic DB updates for tenant entitlements.
    """

    def __init__(self, db: Session):
        self.db = db
        self.headers = {
            "Accept": "application/vnd.api+json",
            "Content-Type": "application/vnd.api+json",
            "Authorization": f"Bearer {LemonSqueezyConfig.API_KEY}"
        }

    async def generate_checkout_url(self, tenant_id: str, variant_id: str, redirect_url: str) -> Optional[str]:
        """
        Generates a secure checkout URL for a specific tenant.
        Injects the `tenant_id` into the custom payload so webhooks can be routed.
        """
        if not LemonSqueezyConfig.STORE_ID:
            logger.error("Lemon Squeezy Store ID is not configured.")
            return None

        payload = {
            "data": {
                "type": "checkouts",
                "attributes": {
                    "checkout_data": {
                        "custom": {
                            "tenant_id": tenant_id
                        }
                    },
                    "product_options": {
                        "redirect_url": redirect_url
                    }
                },
                "relationships": {
                    "store": {
                        "data": {"type": "stores", "id": str(LemonSqueezyConfig.STORE_ID)}
                    },
                    "variant": {
                        "data": {"type": "variants", "id": str(variant_id)}
                    }
                }
            }
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{LemonSqueezyConfig.BASE_URL}/checkouts",
                    json=payload,
                    headers=self.headers,
                    timeout=10.0
                )
                response.raise_for_status()
                data = response.json()
                return data["data"]["attributes"]["url"]
            except httpx.HTTPStatusError as e:
                logger.error(f"Failed to generate Lemon Squeezy checkout for tenant {tenant_id}: {e.response.text}")
                return None
            except Exception as e:
                logger.error(f"Network error generating checkout for tenant {tenant_id}: {str(e)}")
                return None

    def process_webhook(self, event_name: str, data: Dict[str, Any]) -> None:
        """
        Idempotent webhook processor. Maps Lemon Squeezy subscription events 
        to local database tier updates atomically. 
        Bypasses strict signature verification in favor of custom_data matching.
        """
        try:
            # Extract custom tenant_id injected during checkout generation
            custom_data = data.get("meta", {}).get("custom_data", {})
            tenant_id = custom_data.get("tenant_id")

            if not tenant_id:
                logger.warning(f"Ignored Lemon Squeezy webhook '{event_name}': Missing tenant_id in payload.")
                return

            # Retrieve the target organization
            org = self.db.query(Organization).filter(Organization.id == tenant_id).first()
            if not org:
                logger.error(f"Webhook processing failed: Organization {tenant_id} not found.")
                return

            # Route based on Lemon Squeezy event types
            if event_name in ["subscription_created", "subscription_updated"]:
                status = data.get("data", {}).get("attributes", {}).get("status")
                
                if status in ["active", "on_trial"]:
                    org.subscription_tier = SubscriptionTier.PRO 
                    logger.info(f"[{tenant_id}] Upgraded to PRO tier via Lemon Squeezy.")
                elif status in ["expired", "cancelled", "unpaid"]:
                    org.subscription_tier = SubscriptionTier.FREE
                    logger.info(f"[{tenant_id}] Downgraded to FREE tier due to subscription status: {status}.")

            elif event_name == "subscription_cancelled":
                org.subscription_tier = SubscriptionTier.FREE
                logger.info(f"[{tenant_id}] Downgraded to FREE tier (Subscription Cancelled).")

            self.db.commit()

        except SQLAlchemyError as e:
            self.db.rollback()
            logger.error(f"Database error while processing Lemon Squeezy webhook for tenant {tenant_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error processing webhook '{event_name}': {e}")
            raise