# api/dependencies.py
from fastapi import HTTPException, Depends
from api.database import get_db

async def require_active_subscription(tenant_id: str = Depends(get_current_tenant), db = Depends(get_db)):
    tenant = db.fetch_one("SELECT billing_status FROM tenants WHERE id = %s", (tenant_id,))
    
    if tenant["billing_status"] not in ["active", "trialing"]:
        raise HTTPException(
            status_code=402, 
            detail="Payment Required. Please update your billing details in the dashboard."
        )
    return tenant_id