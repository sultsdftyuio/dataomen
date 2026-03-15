# api/routes/billing.py

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from auth import get_current_user  # Dependency that verifies Supabase JWT
from services.lemon_squeezy_service import LemonSqueezyService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/billing", tags=["Billing"])

class CheckoutRequest(BaseModel):
    variant_id: str
    redirect_url: str

@router.post("/checkout")
async def create_checkout_session(
    request: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Generates a secure, tenant-linked checkout URL.
    Verifies the user's Supabase session first to ensure the tenant_id is authentic.
    """
    try:
        # Extract the tenant/organization ID from the verified Supabase token
        tenant_id = current_user.get("organization_id") or current_user.get("sub")
        
        if not tenant_id:
            raise HTTPException(status_code=403, detail="Unauthorized: No tenant identity found.")

        # Initialize the billing service
        billing_service = LemonSqueezyService(db)

        # Request the URL from Lemon Squeezy, injecting our tenant_id for webhook routing
        checkout_url = await billing_service.generate_checkout_url(
            tenant_id=tenant_id,
            variant_id=request.variant_id,
            redirect_url=request.redirect_url
        )

        if not checkout_url:
            raise HTTPException(status_code=502, detail="Could not initialize payment session.")

        logger.info(f"Generated checkout session for tenant {tenant_id}")
        return {"checkout_url": checkout_url}

    except Exception as e:
        logger.error(f"Failed to create checkout for {current_user.get('sub')}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal billing engine error.")