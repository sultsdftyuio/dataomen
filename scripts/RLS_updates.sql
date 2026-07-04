-- ============================================================================
-- ARCLI SQL FIX: TENANT SETTINGS RLS & BACKFILL GUARANTEE (CORRECTED ORDER)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: EXPAND RLS COVERAGE FOR tenant_settings (DDL MUST RUN FIRST)
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings FORCE ROW LEVEL SECURITY;

-- SELECT Policy
DROP POLICY IF EXISTS "tenant_settings_select_own" ON public.tenant_settings;
CREATE POLICY "tenant_settings_select_own" ON public.tenant_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = tenant_settings.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

-- INSERT Policy (Required for Upserts)
DROP POLICY IF EXISTS "tenant_settings_insert_own" ON public.tenant_settings;
CREATE POLICY "tenant_settings_insert_own" ON public.tenant_settings
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND LOWER(tu.role) IN ('owner', 'admin')
        )
    );

-- UPDATE Policy (Relaxed role check to include lowercase/uppercase admin & owner)
DROP POLICY IF EXISTS "tenant_settings_update_own" ON public.tenant_settings;
CREATE POLICY "tenant_settings_update_own" ON public.tenant_settings
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = tenant_settings.tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND LOWER(tu.role) IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = tenant_settings.tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND LOWER(tu.role) IN ('owner', 'admin')
        )
    );


-- ----------------------------------------------------------------------------
-- STEP 2: AUTO-INIT TRIGGER FOR NEW TENANTS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_tenant_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.tenant_settings (tenant_id, company_name, updated_at)
    VALUES (NEW.tenant_id, COALESCE(NEW.name, 'My Workspace'), NOW())
    ON CONFLICT (tenant_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_init_tenant_settings ON public.tenants;
CREATE TRIGGER trg_init_tenant_settings
    AFTER INSERT ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_tenant_settings();


-- ----------------------------------------------------------------------------
-- STEP 3: BACKFILL MISSING TENANT SETTINGS ROWS (DML DATA WRITES RUN LAST)
-- ----------------------------------------------------------------------------
-- Guarantees every workspace in `tenants` has a corresponding row in `tenant_settings`.
INSERT INTO public.tenant_settings (tenant_id, company_name, updated_at)
SELECT 
    t.tenant_id,
    COALESCE(t.name, 'My Workspace'),
    NOW()
FROM public.tenants t
ON CONFLICT (tenant_id) DO NOTHING;
-- Add explicit billing customer tracking to the core tenant boundary
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS dodo_customer_id text;

-- Index for rapid webhook resolution during async enrichment (Rule 2 & Rule 14)
CREATE INDEX IF NOT EXISTS idx_tenants_dodo_customer_id 
ON public.tenants(dodo_customer_id);