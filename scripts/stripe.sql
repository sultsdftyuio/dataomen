CREATE OR REPLACE FUNCTION upsert_stripe_integration(
    p_tenant_id TEXT,
    p_stripe_account_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    -- Rule 6: Hostile Multi-Tenancy Defense
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify the caller is an active member of THIS specific tenant
    IF NOT EXISTS (
        SELECT 1 FROM tenant_users 
        WHERE tenant_id = p_tenant_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized tenant access: user % does not belong to tenant %', v_user_id, p_tenant_id;
    END IF;

    -- Upsert the Stripe Account ID safely into tenant_settings
    INSERT INTO tenant_settings (tenant_id, stripe_account_id, updated_at)
    VALUES (p_tenant_id, p_stripe_account_id, NOW())
    ON CONFLICT (tenant_id) 
    DO UPDATE SET 
        stripe_account_id = EXCLUDED.stripe_account_id,
        updated_at = NOW();

    -- Advance the State Machine so the frontend knows we are syncing
    UPDATE tenants
    SET provisioning_status = 'SYNCING', updated_at = NOW()
    WHERE tenant_id = p_tenant_id;
END;
$$;

COMMENT ON FUNCTION upsert_stripe_integration(TEXT, TEXT) IS 
'Safely associates a Stripe Connect Account ID to a tenant, enforcing strictly that the caller is a member of that workspace.';