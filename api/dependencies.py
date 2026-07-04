# api/dependencies.py
import logging
from fastapi import HTTPException, Depends, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from api.database import get_db
from api.auth import get_current_tenant_id, get_current_tenant

logger = logging.getLogger(__name__)

def require_active_subscription(
    tenant_id: str = Depends(get_current_tenant_id),
    db: Session = Depends(get_db)
) -> str:
    """
    FastAPI dependency that enforces subscription firewall rules.
    Verifies that the authenticated workspace is in an 'active' or 'trialing' state.
    """
    try:
        # Execute parameterized query safely using SQLAlchemy Session
        query = text("""
            SELECT billing_status 
            FROM tenants 
            WHERE tenant_id = :tenant_id 
            LIMIT 1
        """)
        row = db.execute(query, {"tenant_id": tenant_id}).fetchone()

    except Exception:
        logger.exception("Database error while checking subscription status for tenant=%s", tenant_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to verify workspace billing status."
        )

    # 1. Defensive check: prevent TypeError/500 crashes if workspace record is missing
    if not row:
        logger.warning("Billing status check failed: Tenant record not found for tenant_id=%s", tenant_id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace shell not found or incomplete."
        )

    # Safely extract billing_status whether SQLAlchemy returns a Row or Mapping object
    billing_status = str(
        row._mapping["billing_status"] if hasattr(row, "_mapping") else row[0]
    ).strip().lower()

    # 2. Enforce active subscription boundary
    if billing_status not in {"active", "trialing"}:
        logger.info("Payment required access attempt for tenant=%s (status: %s)", tenant_id, billing_status)
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Payment Required. Please update your billing details in the dashboard."
        )

    return tenant_id