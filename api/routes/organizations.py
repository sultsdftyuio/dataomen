import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.auth import TenantContext, verify_tenant
from api.database import get_db
from models import Organization, SubscriptionTier

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Organizations"])


def _serialize_usage(org: Organization) -> Dict[str, Any]:
    tier = org.subscription_tier
    tier_value = tier.value if hasattr(tier, "value") else str(tier)

    return {
        "subscription_tier": tier_value,
        "current_storage_mb": float(org.current_storage_mb or 0.0),
        "max_storage_mb": int(org.max_storage_mb or 1024),
        "current_month_queries": int(org.current_month_queries or 0),
        "monthly_query_limit": int(org.monthly_query_limit or 1000),
    }


def _fallback_usage_payload() -> Dict[str, Any]:
    return {
        "subscription_tier": SubscriptionTier.FREE.value,
        "current_storage_mb": 0.0,
        "max_storage_mb": 1024,
        "current_month_queries": 0,
        "monthly_query_limit": 1000,
    }


@router.get("/api/organizations/me")
@router.get("/organizations/me")
async def get_my_organization_usage(
    context: TenantContext = Depends(verify_tenant),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns billing/usage telemetry for the authenticated tenant.
    Both paths are supported for backward compatibility with older clients.
    """
    org = db.query(Organization).filter(Organization.id == context.tenant_id).first()

    if org is None:
        logger.warning(
            "[%s] Organization record missing for usage endpoint. Returning free-tier fallback.",
            context.tenant_id,
        )
        return _fallback_usage_payload()

    return _serialize_usage(org)
