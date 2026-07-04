-- ============================================================================
-- ARCLI FULL PRODUCTION MIGRATION: TENANT SETTINGS & EMAIL TEMPLATES RLS
-- Safe to run multiple times: uses IF NOT EXISTS / OR REPLACE / DROP POLICY
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 1: TENANT SETTINGS SCHEMA & RLS COVERAGE
-- ----------------------------------------------------------------------------

-- Ensure normalized sender_email column exists (from scripts/email_templates.sql)
ALTER TABLE public.tenant_settings 
ADD COLUMN IF NOT EXISTS sender_email text;

UPDATE public.tenant_settings
SET sender_email = LOWER(TRIM(sender_email))
WHERE sender_email IS NOT NULL
  AND sender_email <> LOWER(TRIM(sender_email));

DO $$ BEGIN
    ALTER TABLE public.tenant_settings
        ADD CONSTRAINT chk_tenant_sender_email_normalized
        CHECK (sender_email IS NULL OR sender_email = LOWER(TRIM(sender_email)))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enable and force RLS on tenant_settings
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

-- INSERT Policy
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

-- UPDATE Policy
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

-- Auto-Init Trigger for New Tenants
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

-- Backfill missing settings rows for existing tenants
INSERT INTO public.tenant_settings (tenant_id, company_name, updated_at)
SELECT 
    t.tenant_id,
    COALESCE(t.name, 'My Workspace'),
    NOW()
FROM public.tenants t
ON CONFLICT (tenant_id) DO NOTHING;

-- Explicit billing customer tracking on core tenant boundary
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS dodo_customer_id text,
ADD COLUMN IF NOT EXISTS dodo_subscription_id text,
ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
ADD COLUMN IF NOT EXISTS billing_status text;

CREATE INDEX IF NOT EXISTS idx_tenants_dodo_customer_id 
ON public.tenants(dodo_customer_id);

CREATE INDEX IF NOT EXISTS idx_tenants_dodo_subscription_id
ON public.tenants(dodo_subscription_id);


-- ----------------------------------------------------------------------------
-- PART 2: EMAIL TEMPLATES TABLE DEFINITION & FULL CRUD RLS
-- Targets authoritative table: public.email_templates
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'recovery',
    body_html TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN 
    ALTER TABLE public.email_templates
    ADD CONSTRAINT fk_email_templates_tenant 
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id)
    ON DELETE CASCADE
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_email_templates_tenant 
    ON public.email_templates(tenant_id, created_at DESC);

-- Enable and force RLS on email_templates
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates FORCE ROW LEVEL SECURITY;

-- 1. SELECT Policy (Read access for all authenticated workspace members)
DROP POLICY IF EXISTS "email_templates_select_tenant" ON public.email_templates;
CREATE POLICY "email_templates_select_tenant" ON public.email_templates
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = email_templates.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

-- 2. INSERT Policy (Create access for workspace members)
DROP POLICY IF EXISTS "email_templates_insert_tenant" ON public.email_templates;
CREATE POLICY "email_templates_insert_tenant" ON public.email_templates
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND LOWER(tu.role) IN ('owner', 'admin', 'member')
        )
    );

-- 3. UPDATE Policy (Update access for workspace members)
DROP POLICY IF EXISTS "email_templates_update_tenant" ON public.email_templates;
CREATE POLICY "email_templates_update_tenant" ON public.email_templates
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = email_templates.tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND LOWER(tu.role) IN ('owner', 'admin', 'member')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = email_templates.tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND LOWER(tu.role) IN ('owner', 'admin', 'member')
        )
    );

-- 4. DELETE Policy (Delete access restricted to workspace admins and owners)
DROP POLICY IF EXISTS "email_templates_delete_tenant" ON public.email_templates;
CREATE POLICY "email_templates_delete_tenant" ON public.email_templates
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = email_templates.tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND LOWER(tu.role) IN ('owner', 'admin')
        )
    );
