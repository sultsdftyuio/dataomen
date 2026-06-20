-- ============================================================================
-- 1. EMAIL TEMPLATES TABLE (Perfect as-is)
-- ============================================================================
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

-- Tenant FK (DEFERRABLE per Arcli standards)
DO $$ BEGIN 
    ALTER TABLE public.email_templates
    ADD CONSTRAINT fk_email_templates_tenant 
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id)
    ON DELETE CASCADE
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fast lookup for the frontend
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant 
    ON public.email_templates(tenant_id, created_at DESC);

-- Strict RLS Policies
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_templates_select_tenant" ON public.email_templates;
CREATE POLICY "email_templates_select_tenant" ON public.email_templates
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = email_templates.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

-- Optional: Insert a dummy template so your UI isn't empty
-- INSERT INTO public.email_templates (tenant_id, name, subject, type) 
-- VALUES ('YOUR_TENANT_ID', 'Payment Failed - Gentle Reminder', 'Action Required: Payment failed', 'billing');


-- ============================================================================
-- 2. AT-RISK USERS (RADAR VIEW - FIXED TO PREVENT 42P16 ERROR)
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_risk_queue_radar AS
SELECT
    re.id,
    re.tenant_id,
    re.user_id AS customer_id,
    COALESCE(crs.customer_name, SPLIT_PART(re.email, '@', 1)) AS customer_name,
    re.email AS customer_email,
    COALESCE(re.churn_risk_score, crs.risk_score, 0) AS risk_score,
    
    -- MUST stay here (Column 7) to avoid the 42P16 rename error
    COALESCE(crs.mrr_at_risk, 0) AS mrr_at_risk,
    
    CASE
        WHEN re.status = 'dead_lettered' THEN 'dead_lettered'
        WHEN re.status IN ('dispatch_failed', 'failed') THEN 'failed'
        WHEN re.status IN ('pending_dispatch', 'queued') THEN 'pending'
        WHEN re.status IN ('dispatch_claimed', 'processing', 'dispatched_to_queue') THEN 'processing'
        WHEN re.status IN ('provider_accepted', 'delivered', 'sent') THEN 'cooldown'
        WHEN re.status = 'suppressed' THEN 'suppressed'
        ELSE 'pending'
    END AS state,
    COALESCE(re.next_retry_at, re.lease_expires_at) AS next_action_time,
    re.claimed_by_operator AS assigned_operator_id,

    -- ADDED AT THE END: Exposed for CampaignsClient without breaking existing columns
    COALESCE(re.primary_risk_signal, crs.risk_tier, 'High Risk Detected') AS signal,
    re.updated_at AS last_active
    
FROM public.recovery_emails re
LEFT JOIN public.churn_risk_state crs
    ON re.tenant_id = crs.tenant_id AND re.user_id = crs.user_id
WHERE re.status NOT IN ('provider_accepted', 'delivered', 'sent')
   OR (re.created_at > NOW() - INTERVAL '30 days');