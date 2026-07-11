-- ============================================================================
-- ARCLI UNIFIED PRODUCTION MIGRATION v3.2
-- Covers: Billing Enum Fixes ('canceling'), Tenant Settings & Email Templates RLS
-- Safe to run multiple times: uses IF NOT EXISTS / OR REPLACE / DROP POLICY
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PART 0: BILLING ENUM TYPE HARDENING ('canceling')
-- Resolves PostgreSQL error 22P02 during Pro plan cancellation syncs
-- ----------------------------------------------------------------------------

-- 1. Add 'canceling' to billing_state (if your database uses this type name)
DO $$ BEGIN
    ALTER TYPE billing_state ADD VALUE IF NOT EXISTS 'canceling' AFTER 'active';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- 2. Add 'canceling' to platform_billing_state (defined in scripts/payments.sql)
DO $$ BEGIN
    ALTER TYPE platform_billing_state ADD VALUE IF NOT EXISTS 'canceling' AFTER 'active';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- 3. Add 'canceling' to customer_subscription_state (if used for internal tenant tracking)
DO $$ BEGIN
    ALTER TYPE customer_subscription_state ADD VALUE IF NOT EXISTS 'canceling' AFTER 'active';
EXCEPTION WHEN undefined_object THEN NULL; END $$;


-- ----------------------------------------------------------------------------
-- PART 1: TENANT SETTINGS SCHEMA & RLS COVERAGE
-- ----------------------------------------------------------------------------

-- Ensure normalized sender_email column exists
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
    body_text TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safely backfill any missing columns if table existed previously without them
ALTER TABLE public.email_templates
    ADD COLUMN IF NOT EXISTS body_text TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

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


-- ----------------------------------------------------------------------------
-- PART 3: PROSPECT INTELLIGENCE API CACHE + TENANT RLS
-- Resolves PostgREST PGRST205 for public.service_profiles/public.lead_matches
-- while enforcing tenant isolation through authenticated tenant membership.
-- ----------------------------------------------------------------------------

BEGIN;

CREATE TABLE IF NOT EXISTS public.service_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    website_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review',
    extraction_status TEXT,
    target_audience TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    core_problem TEXT NOT NULL DEFAULT '',
    unique_value_prop TEXT NOT NULL DEFAULT '',
    use_cases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    pain_points TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    buying_triggers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    negative_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    excluded_audiences TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    profile_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    profile JSONB NOT NULL DEFAULT '{}'::JSONB,
    data JSONB NOT NULL DEFAULT '{}'::JSONB,
    approved_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    source_post_id UUID,
    match_status TEXT NOT NULL DEFAULT 'qualified',
    verifier_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    similarity_score DOUBLE PRECISION,
    embedding_score DOUBLE PRECISION,
    match_score DOUBLE PRECISION,
    pain_detected TEXT,
    match_reason TEXT,
    verification JSONB NOT NULL DEFAULT '{}'::JSONB,
    verifier_result JSONB NOT NULL DEFAULT '{}'::JSONB,
    source_post JSONB NOT NULL DEFAULT '{}'::JSONB,
    source_post_data JSONB NOT NULL DEFAULT '{}'::JSONB,
    source_post_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    post JSONB NOT NULL DEFAULT '{}'::JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    matched_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_profiles_tenant_updated
    ON public.service_profiles(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_matches_tenant_status_score
    ON public.lead_matches(tenant_id, match_status, verifier_score DESC, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lead_matches TO authenticated;

ALTER TABLE public.service_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_profiles_select_tenant" ON public.service_profiles;
DROP POLICY IF EXISTS "service_profiles_insert_tenant" ON public.service_profiles;
DROP POLICY IF EXISTS "service_profiles_update_tenant" ON public.service_profiles;
DROP POLICY IF EXISTS "service_profiles_delete_tenant" ON public.service_profiles;
DROP POLICY IF EXISTS "service_profiles_tenant_isolation" ON public.service_profiles;
CREATE POLICY "service_profiles_tenant_isolation" ON public.service_profiles
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = service_profiles.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = service_profiles.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE public.lead_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_matches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_matches_select_tenant" ON public.lead_matches;
DROP POLICY IF EXISTS "lead_matches_insert_tenant" ON public.lead_matches;
DROP POLICY IF EXISTS "lead_matches_update_tenant" ON public.lead_matches;
DROP POLICY IF EXISTS "lead_matches_delete_tenant" ON public.lead_matches;
DROP POLICY IF EXISTS "lead_matches_tenant_isolation" ON public.lead_matches;
CREATE POLICY "lead_matches_tenant_isolation" ON public.lead_matches
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = lead_matches.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = lead_matches.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
    );

NOTIFY pgrst, 'reload schema';

COMMIT;
