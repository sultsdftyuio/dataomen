# api/routes/billing.py

import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

# -------------------------------------------------------------------------
# Core Modular Orchestrators & Dependencies
# Updated to strict absolute imports to prevent ModuleNotFoundError crashes
# -------------------------------------------------------------------------
from api.database import get_db
from api.auth import get_current_user  # Dependency that verifies Supabase JWT
from api.services.lemon_squeezy_service import LemonSqueezyService

logger = logging.getLogger(__name__)

# Route Registration
router = APIRouter(prefix="/api/billing", tags=["Billing"])

# ==========================================
# STRICT DATA CONTRACTS (PYDANTIC)
# ==========================================

class CheckoutRequest(BaseModel):
    variant_id: str = Field(..., description="The Lemon Squeezy product variant ID.")
    redirect_url: str = Field(..., description="The return URL upon successful checkout.")

# ==========================================
# ENDPOINTS
# ==========================================

@router.post("/checkout")
async def create_checkout_session(
    request: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, str]:
    """
    Generates a secure, tenant-linked checkout URL.
    Verifies the user's Supabase session first to ensure the tenant_id is authentic
    and properly isolated.
    """
    try:
        # 1. Strict Security Validation: Extract tenant/organization ID securely from JWT
        tenant_id = current_user.get("organization_id") or current_user.get("sub")
        
        if not tenant_id:
            logger.warning("Unauthorized checkout attempt: No tenant identity found in Supabase token.")
            raise HTTPException(status_code=403, detail="Unauthorized: No tenant identity found.")

        # 2. Initialize the billing orchestration service
        billing_service = LemonSqueezyService(db)

        # 3. Generate Checkout URL (Injecting tenant_id safely for webhook mapping)
        checkout_url = await billing_service.generate_checkout_url(
            tenant_id=tenant_id,
            variant_id=request.variant_id,
            redirect_url=request.redirect_url
        )

        if not checkout_url:
            raise HTTPException(status_code=502, detail="Could not initialize remote payment session.")

        logger.info(f"✅ [{tenant_id}] Generated secure checkout session.")
        return {"checkout_url": checkout_url}

    except HTTPException:
        # Re-raise known HTTP exceptions cleanly
        raise
    except Exception as e:
        logger.error(f"❌ [{current_user.get('sub')}] Failed to provision checkout session: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal billing engine orchestration error.")