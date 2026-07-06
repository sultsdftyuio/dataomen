-- ============================================================================
-- ARCLI CORE SCHEMA — EMAIL TEMPLATES & QUEUE VIEWS
-- SAFE TO RUN MULTIPLE TIMES: uses IF NOT EXISTS / OR REPLACE / DROP VIEW
-- ============================================================================
-- Add sender_email column to tenant_settings if it doesn't already exist
ALTER TABLE public.tenant_settings 
ADD COLUMN IF NOT EXISTS sender_email text;

-- Normalize existing emails just in case
UPDATE public.tenant_settings
SET sender_email = LOWER(TRIM(sender_email))
WHERE sender_email IS NOT NULL
  AND sender_email <> LOWER(TRIM(sender_email));

-- Enforce email formatting & normalization at the database level
DO $$ BEGIN
    ALTER TABLE public.tenant_settings
        ADD CONSTRAINT chk_tenant_sender_email_normalized
        CHECK (sender_email IS NULL OR sender_email = LOWER(TRIM(sender_email)))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION reserve_email_dispatch(
    p_dispatch_token TEXT,
    p_tenant_id TEXT,
    p_send_id UUID,
    p_max_attempts INT
)
RETURNS TABLE (
    record JSONB,
    claim_status TEXT,
    cooldown_status TEXT,
    attempt_count INT,
    error TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_record JSONB;
    v_claimed BOOLEAN := FALSE;
    v_claim_status TEXT := 'missing';
    v_cooldown_status TEXT := 'ok';
    v_attempt_count INT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Claim dispatch token (idempotent deduplication)
    -- Matches table defined in foundations1.sql
    SELECT TRUE INTO v_claimed
    FROM recovery_dispatch_dedup
    WHERE token = p_dispatch_token
      AND tenant_id = p_tenant_id
      AND send_id = p_send_id
      AND claimed_at IS NULL
    FOR UPDATE SKIP LOCKED;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::JSONB, 'duplicate'::TEXT, NULL::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;
    
    UPDATE recovery_dispatch_dedup
    SET claimed_at = v_now
    WHERE token = p_dispatch_token;
    
    v_claim_status := 'claimed';

    -- 2. Fetch record
    -- Matches table defined in foundations1.sql
    SELECT TO_JSONB(r.*) INTO v_record
    FROM recovery_emails r
    WHERE r.tenant_id = p_tenant_id AND r.id = p_send_id;
    
    IF v_record IS NULL THEN
        RETURN QUERY SELECT v_record, v_claim_status, 'missing_record'::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;

    -- 3. Terminal status check
    IF (v_record->>'status')::TEXT IN ('provider_accepted', 'delivered', 'dead_lettered') THEN
        RETURN QUERY SELECT v_record, v_claim_status, 'terminal'::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;

    -- 4. Max attempts
    IF (v_record->>'attempt_count')::INT >= p_max_attempts THEN
        RETURN QUERY SELECT v_record, v_claim_status, 'max_attempts'::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;

    -- 5. Global cap (24h)
    PERFORM 1 FROM recovery_emails
    WHERE tenant_id = p_tenant_id
      AND user_id = (v_record->>'user_id')::TEXT
      AND status IN ('provider_accepted', 'delivered')
      AND provider_accepted_at >= v_now - INTERVAL '24 hours'
    LIMIT 1;
    
    IF FOUND THEN
        RETURN QUERY SELECT v_record, v_claim_status, 'global_cap'::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;

    -- 6. Template cooldown (7d)
    PERFORM 1 FROM recovery_emails
    WHERE tenant_id = p_tenant_id
      AND user_id = (v_record->>'user_id')::TEXT
      AND campaign_type = (v_record->>'campaign_type')::TEXT
      AND status IN ('provider_accepted', 'delivered')
      AND provider_accepted_at >= v_now - INTERVAL '7 days'
    LIMIT 1;
    
    IF FOUND THEN
        RETURN QUERY SELECT v_record, v_claim_status, 'template_cooldown'::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;

    -- 7. Reserve attempt
    UPDATE recovery_emails
    SET attempt_count = COALESCE(attempt_count, 0) + 1,
        updated_at = v_now
    WHERE id = p_send_id
    RETURNING attempt_count INTO v_attempt_count;

    RETURN QUERY SELECT v_record, v_claim_status, 'ok'::TEXT, v_attempt_count, NULL::TEXT;
END;
$$;

-- ============================================================================
-- 2. EMAIL TEMPLATES TABLE
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

DO $$ BEGIN 
    ALTER TABLE public.email_templates
    ADD CONSTRAINT fk_email_templates_tenant 
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id)
    ON DELETE CASCADE
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_email_templates_tenant 
    ON public.email_templates(tenant_id, created_at DESC);

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

-- ============================================================================
-- 3. AT-RISK USERS (RADAR VIEW)
-- ============================================================================
-- Must DROP CASCADE first to strictly prevent 42P16 error on iterative deploys
DROP VIEW IF EXISTS public.vw_risk_queue_radar CASCADE;

CREATE VIEW public.vw_risk_queue_radar AS
SELECT
    re.id,
    re.tenant_id,
    re.user_id AS customer_id,
    COALESCE(crs.customer_name, SPLIT_PART(re.email, '@', 1)) AS customer_name,
    re.email AS customer_email,
    COALESCE(re.churn_risk_score, crs.risk_score, 0) AS risk_score,
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
    COALESCE(re.primary_risk_signal, crs.risk_tier, 'High Risk Detected') AS signal,
    re.updated_at AS last_active
FROM public.recovery_emails re
LEFT JOIN public.churn_risk_state crs
    ON re.tenant_id = crs.tenant_id AND re.user_id = crs.user_id
WHERE re.status NOT IN ('provider_accepted', 'delivered', 'sent')
   OR (re.created_at > NOW() - INTERVAL '30 days');
