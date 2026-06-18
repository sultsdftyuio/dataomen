-- ============================================================================
-- 1. PATCH THE EXISTING manual_interventions TABLE
-- ============================================================================
ALTER TABLE manual_interventions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE manual_interventions ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE manual_interventions ADD COLUMN IF NOT EXISTS operator_id UUID;
ALTER TABLE manual_interventions ADD COLUMN IF NOT EXISTS duration_days INT;
ALTER TABLE manual_interventions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Safely enforce Idempotency
DO $$ BEGIN
    ALTER TABLE manual_interventions ADD CONSTRAINT unique_idempotency_per_tenant UNIQUE(tenant_id, idempotency_key);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- Enforce Multi-Tenant Isolation (Layer 3 Security)
ALTER TABLE manual_interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for manual interventions" ON manual_interventions;
CREATE POLICY "Tenant isolation for manual interventions"
ON manual_interventions
FOR ALL
USING (tenant_id = (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));


-- ============================================================================
-- 2. REWRITE PHASE 3 RPC (Using TEXT for tenant/customer IDs)
-- ============================================================================
CREATE OR REPLACE FUNCTION apply_manual_intervention(
    p_tenant_id TEXT,
    p_customer_id TEXT,
    p_action TEXT,
    p_duration_days INT,
    p_reason TEXT,
    p_idempotency_key TEXT
) 
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_operator_id UUID;
BEGIN
    v_operator_id := auth.uid();
    IF v_operator_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Verify tenant membership
    IF NOT EXISTS (SELECT 1 FROM tenant_users WHERE user_id = v_operator_id AND tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access';
    END IF;

    -- Insert the Audit Record (Maps to your existing 'notes' and 'operator_name' columns)
    INSERT INTO manual_interventions (
        tenant_id, customer_id, operator_id, operator_name, action, duration_days, notes, idempotency_key
    ) VALUES (
        p_tenant_id, p_customer_id, v_operator_id, 'Dashboard Operator', p_action, p_duration_days, p_reason, p_idempotency_key
    );

    -- Update the Queue / Outbox State
    IF p_action = 'suppress' THEN
        UPDATE recovery_emails 
        SET status = 'suppressed', updated_at = NOW()
        WHERE tenant_id = p_tenant_id AND user_id = p_customer_id;
        
    ELSIF p_action = 'cooldown' THEN
        UPDATE recovery_emails
        SET status = 'cooldown', 
            next_retry_at = NOW() + (p_duration_days || ' days')::INTERVAL,
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id AND user_id = p_customer_id;
    END IF;
END;
$$;


-- ============================================================================
-- 3. REWRITE PHASE 4 RPCs (Using TEXT for tenant/customer IDs)
-- ============================================================================
CREATE OR REPLACE FUNCTION claim_queue_account(
    p_tenant_id TEXT,
    p_customer_id TEXT
) 
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_operator_id UUID;
    v_existing_claim UUID;
BEGIN
    v_operator_id := auth.uid();
    IF v_operator_id IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); 
    END IF;

    IF NOT EXISTS (SELECT 1 FROM tenant_users WHERE user_id = v_operator_id AND tenant_id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Row lock to prevent race conditions
    SELECT claimed_by_operator INTO v_existing_claim
    FROM recovery_emails
    WHERE tenant_id = p_tenant_id AND user_id = p_customer_id
    FOR UPDATE;

    IF v_existing_claim IS NOT NULL THEN
        IF v_existing_claim = v_operator_id THEN
            RETURN jsonb_build_object('success', true, 'message', 'You already claimed this account.');
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'Account was just claimed by another operator.');
        END IF;
    END IF;

    UPDATE recovery_emails
    SET claimed_by_operator = v_operator_id,
        operator_claimed_at = NOW(),
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND user_id = p_customer_id;

    RETURN jsonb_build_object('success', true, 'message', 'Account claimed successfully.');
END;
$$;


CREATE OR REPLACE FUNCTION requeue_dead_letter(
    p_tenant_id TEXT,
    p_customer_id TEXT
) 
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_operator_id UUID := auth.uid();
BEGIN
    IF NOT EXISTS (SELECT 1 FROM tenant_users WHERE user_id = v_operator_id AND tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    UPDATE recovery_emails
    SET status = 'pending_dispatch',
        failure_stage = NULL,
        next_retry_at = NOW(),
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id 
      AND user_id = p_customer_id 
      AND status = 'dead_lettered';
END;
$$;