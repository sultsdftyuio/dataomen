CREATE OR REPLACE FUNCTION reserve_email_dispatch(
    p_dispatch_token TEXT,
    p_tenant_id TEXT,
    p_send_id TEXT,
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
    -- 1. Claim dispatch token (idempotent; assumes your existing claim logic)
    -- Replace with your actual token claim logic or call your existing RPC
    SELECT TRUE INTO v_claimed
    FROM recovery_email_dispatch_tokens
    WHERE token = p_dispatch_token
      AND tenant_id = p_tenant_id
      AND send_id = p_send_id
      AND claimed_at IS NULL
    FOR UPDATE SKIP LOCKED;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::JSONB, 'duplicate'::TEXT, NULL::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;
    
    UPDATE recovery_email_dispatch_tokens
    SET claimed_at = v_now
    WHERE token = p_dispatch_token;
    
    v_claim_status := 'claimed';

    -- 2. Fetch record
    SELECT TO_JSONB(r.*) INTO v_record
    FROM recovery_email_table r
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
    PERFORM 1 FROM recovery_email_table
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
    PERFORM 1 FROM recovery_email_table
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
    UPDATE recovery_email_table
    SET attempt_count = attempt_count + 1,
        updated_at = v_now
    WHERE id = p_send_id
    RETURNING attempt_count INTO v_attempt_count;

    RETURN QUERY SELECT v_record, v_claim_status, 'ok'::TEXT, v_attempt_count, NULL::TEXT;
END;
$$;
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