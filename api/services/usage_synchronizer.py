import logging
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from api.database import SessionLocal
from models import Organization

# Depending on your stack, import your payment gateway client
from api.services.lemon_squeezy_service import LemonSqueezyService 

logger = logging.getLogger(__name__)

class UsageSynchronizer:
    """
    Phase 9: Background Metering Sync.
    
    Sweeps the local database for unbilled compute usage and syncs it with 
    the external payment provider (Lemon Squeezy / Stripe).
    """

    def __init__(self):
        self.billing_provider = LemonSqueezyService()

    def run_batch_sync(self) -> int:
        """
        Called by a cron job (e.g., Celery Beat) every hour.
        Returns the number of tenants successfully synced.
        """
        logger.info("Starting batch usage synchronization with billing provider...")
        synced_count = 0

        with SessionLocal() as db:
            # Find all active tenants with pending usage to report
            tenants_to_sync = db.query(Organization).filter(
                Organization.unbilled_usage_sync_pending > 0,
                Organization.subscription_id != None
            ).all()

            if not tenants_to_sync:
                logger.info("No pending usage to sync.")
                return 0

            for tenant in tenants_to_sync:
                pending_usage = tenant.unbilled_usage_sync_pending
                
                try:
                    # Report usage to Lemon Squeezy/Stripe
                    success = self.billing_provider.report_usage(
                        subscription_id=tenant.subscription_id,
                        usage_amount=pending_usage
                    )

                    if success:
                        # ATOMIC LOCK to reset the counter
                        locked_tenant = db.query(Organization).filter(
                            Organization.id == tenant.id
                        ).with_for_update().first()
                        
                        locked_tenant.unbilled_usage_sync_pending -= pending_usage
                        db.commit()
                        synced_count += 1
                        logger.info(f"[{tenant.id}] Successfully synced {pending_usage} compute credits to billing provider.")
                    else:
                        logger.error(f"[{tenant.id}] Billing provider rejected usage report.")

                except Exception as e:
                    db.rollback()
                    logger.error(f"[{tenant.id}] Failed to sync usage: {str(e)}")

        logger.info(f"Usage sync complete. Synced {synced_count} tenants.")
        return synced_count
# Global singleton
usage_synchronizer = UsageSynchronizer()