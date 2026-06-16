-- 1. Create the Audit Table for Manual Interventions
CREATE TABLE IF NOT EXISTS manual_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL, -- Core Identity Boundary
    customer_id UUID NOT NULL,
    operator_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('suppress', 'cooldown')),
    duration_days INT, -- e.g., 7, 14, 30 (Null for suppression)
    reason TEXT NOT NULL CHECK (char_length(TRIM(reason)) > 0),
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Guarantee idempotency at the database level
    UNIQUE(tenant_id, idempotency_key) 
);

-- Enforce Layer 3 Security (RLS)
ALTER TABLE manual_interventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for manual interventions"
ON manual_interventions
FOR ALL
USING (tenant_id = (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()));

-- 2. Create the Atomic RPC Function
-- This ensures the audit log and the queue state update happen together or not at all.
CREATE OR REPLACE FUNCTION apply_manual_intervention(
    p_tenant_id UUID,
    p_customer_id UUID,
    p_action TEXT,
    p_duration_days INT,
    p_reason TEXT,
    p_idempotency_key TEXT
) 
RETURNS VOID 
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to bypass RLS for the transaction
AS $$
DECLARE
    v_operator_id UUID;
BEGIN
    -- Get current authenticated user
    v_operator_id := auth.uid();
    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify tenant membership
    IF NOT EXISTS (SELECT 1 FROM tenant_users WHERE user_id = v_operator_id AND tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized tenant access';
    END IF;

    -- 1. Insert the Audit Record (Will throw unique constraint violation if idempotency_key exists)
    INSERT INTO manual_interventions (
        tenant_id, customer_id, operator_id, action, duration_days, reason, idempotency_key
    ) VALUES (
        p_tenant_id, p_customer_id, v_operator_id, p_action, p_duration_days, p_reason, p_idempotency_key
    );

    -- 2. Update the Queue / Outbox State
    IF p_action = 'suppress' THEN
        UPDATE recovery_queue -- Replace with your actual outbox/queue table
        SET status = 'suppressed', updated_at = NOW()
        WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id;
        
    ELSIF p_action = 'cooldown' THEN
        UPDATE recovery_queue
        SET status = 'cooldown', 
            next_run_at = NOW() + (p_duration_days || ' days')::INTERVAL,
            updated_at = NOW()
        WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id;
    END IF;
END;
$$;

-- 1. Race-Safe Account Claiming
-- Uses strict row-locking to ensure two operators clicking at the exact same millisecond
-- don't both think they claimed it.
CREATE OR REPLACE FUNCTION claim_queue_account(
    p_tenant_id UUID,
    p_customer_id UUID
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

    -- Verify tenant membership
    IF NOT EXISTS (SELECT 1 FROM tenant_users WHERE user_id = v_operator_id AND tenant_id = p_tenant_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Lock the row to prevent race conditions
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

    -- Apply the claim
    UPDATE recovery_emails
    SET claimed_by_operator = v_operator_id,
        operator_claimed_at = NOW(),
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND user_id = p_customer_id;

    RETURN jsonb_build_object('success', true, 'message', 'Account claimed successfully.');
END;
$$;

-- 2. Dead-Letter Recovery (Requeue)
CREATE OR REPLACE FUNCTION requeue_dead_letter(
    p_tenant_id UUID,
    p_customer_id UUID
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

    -- Reset status to pending_dispatch so the Python worker picks it up again
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