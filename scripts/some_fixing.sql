-- ============================================================================
-- 1. LEGACY api_keys MIGRATIONS
-- ============================================================================

DO $$ 
BEGIN
    -- Migrate legacy 'name' -> 'label' and relax legacy NOT NULLs
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'api_keys' 
          AND column_name = 'name'
    ) THEN
        UPDATE public.api_keys 
        SET label = name 
        WHERE label IS NULL AND name IS NOT NULL;

        EXECUTE 'ALTER TABLE public.api_keys ALTER COLUMN name DROP NOT NULL;';
    END IF;
END $$;

DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'api_keys' 
          AND column_name = 'masked_key'
    ) THEN
        EXECUTE 'ALTER TABLE public.api_keys ALTER COLUMN masked_key DROP NOT NULL;';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'api_keys' 
          AND column_name = 'is_revoked'
    ) THEN
        EXECUTE 'ALTER TABLE public.api_keys ALTER COLUMN is_revoked DROP NOT NULL;';
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'api_keys' 
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.api_keys ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;


-- ============================================================================
-- 2. LEGACY tenant_settings MIGRATIONS
-- ============================================================================

DO $$
DECLARE
    v_constraint_name text;
BEGIN
    -- Drop legacy 'id' column if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'tenant_settings' 
          AND column_name = 'id'
    ) THEN
        EXECUTE 'ALTER TABLE public.tenant_settings DROP COLUMN id CASCADE;';
    END IF;

    -- Ensure tenant_id is the primary key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu 
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public' 
          AND tc.table_name = 'tenant_settings' 
          AND tc.constraint_type = 'PRIMARY KEY' 
          AND ccu.column_name = 'tenant_id'
    ) THEN
        SELECT constraint_name INTO v_constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'tenant_settings'
          AND constraint_type = 'PRIMARY KEY';

        IF v_constraint_name IS NOT NULL THEN
            EXECUTE 'ALTER TABLE public.tenant_settings DROP CONSTRAINT ' || v_constraint_name || ' CASCADE;';
        END IF;

        ALTER TABLE public.tenant_settings ADD PRIMARY KEY (tenant_id);
    END IF;
END $$;

DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'tenant_settings' 
          AND column_name = 'storage_tier'
    ) THEN
        EXECUTE 'ALTER TABLE public.tenant_settings ALTER COLUMN storage_tier DROP NOT NULL;';
    END IF;
END $$;

DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tenant_settings_tenant_id_fkey'
          AND table_name = 'tenant_settings'
          AND table_schema = 'public'
    ) THEN
        EXECUTE 'ALTER TABLE public.tenant_settings DROP CONSTRAINT tenant_settings_tenant_id_fkey CASCADE;';
    END IF;
END $$;

-- Re-add the FK constraint idempotently
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tenant_settings_tenant_id_fkey'
          AND table_name = 'tenant_settings'
          AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.tenant_settings 
        ADD CONSTRAINT tenant_settings_tenant_id_fkey 
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id) ON DELETE CASCADE;
    END IF;
END $$;


-- ============================================================================
-- 3. VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW vw_customer_operations AS
WITH latest_recovery AS (
    SELECT DISTINCT ON (tenant_id, user_id) *
    FROM recovery_emails
    ORDER BY tenant_id, user_id, created_at DESC
)
SELECT
    crs.tenant_id || ':' || crs.user_id AS id,
    crs.tenant_id,
    crs.user_id AS customer_id,
    
    COALESCE(crs.customer_name, SPLIT_PART(re.email, '@', 1), crs.user_id) AS name,
    re.email AS email,
    
    COALESCE(crs.risk_score, re.churn_risk_score, 0) AS risk_score,
    COALESCE(crs.mrr_at_risk, 0) AS mrr_at_risk,
    
    COALESCE(re.primary_risk_signal, crs.risk_tier, 'No active signals') AS signal,
    'activity' AS signal_type,
    
    COALESCE(
        CASE
            WHEN re.status = 'dead_lettered' THEN 'dead_lettered'
            WHEN re.status IN ('dispatch_failed', 'failed') THEN 'failed'
            WHEN re.status IN ('pending_dispatch', 'queued') THEN 'pending'
            WHEN re.status IN ('dispatch_claimed', 'processing', 'dispatched_to_queue') THEN 'processing'
            WHEN re.status IN ('provider_accepted', 'delivered', 'sent') THEN 'cooldown'
            WHEN re.status = 'suppressed' THEN 'suppressed'
            ELSE NULL
        END,
        'healthy'
    ) AS state,
    
    COALESCE(re.next_retry_at, re.lease_expires_at) AS next_action_time,
    re.claimed_by_operator::text AS assigned_to_name
    
FROM churn_risk_state crs
LEFT JOIN latest_recovery re 
    ON crs.tenant_id = re.tenant_id AND crs.user_id = re.user_id;

CREATE OR REPLACE VIEW vw_customer_operations_metrics AS
SELECT
    tenant_id,
    COUNT(customer_id) AS total_customers,
    COUNT(customer_id) FILTER (WHERE risk_score >= 50 AND risk_score < 70) AS at_risk_count,
    COUNT(customer_id) FILTER (WHERE risk_score >= 70) AS critical_count,
    COUNT(customer_id) FILTER (WHERE state = 'pending') AS pending_count,
    COUNT(customer_id) FILTER (WHERE state = 'dead_lettered') AS dead_letter_count,
    SUM(mrr_at_risk) FILTER (WHERE risk_score >= 50) AS total_mrr_at_risk
FROM vw_customer_operations
GROUP BY tenant_id;


-- ============================================================================
-- 4. FUNCTIONS / RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_queue_intervention(
  p_tenant_id UUID,
  p_user_id TEXT,
  p_action TEXT,
  p_duration_days INT,
  p_operator_name TEXT,
  p_reason TEXT,
  p_idempotency_key UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cooldown_date TIMESTAMPTZ;
BEGIN
  IF EXISTS (SELECT 1 FROM manual_interventions WHERE idempotency_key = p_idempotency_key) THEN
    RETURN;
  END IF;

  IF p_action = 'suppress' THEN
    UPDATE churn_risk_state
    SET is_suppressed = true
    WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

    UPDATE recovery_emails
    SET status = 'suppressed'
    WHERE tenant_id = p_tenant_id 
      AND user_id = p_user_id 
      AND status IN ('pending_dispatch', 'queued');
      
  ELSIF p_action = 'cooldown' THEN
    v_cooldown_date := NOW() + (p_duration_days || ' days')::interval;
    
    UPDATE recovery_emails
    SET status = 'cooldown',
        lease_expires_at = v_cooldown_date
    WHERE tenant_id = p_tenant_id 
      AND user_id = p_user_id 
      AND status IN ('pending_dispatch', 'queued', 'failed');
  END IF;

  INSERT INTO manual_interventions (
    tenant_id, user_id, action, operator_name, notes, idempotency_key
  ) VALUES (
    p_tenant_id, 
    p_user_id, 
    CASE WHEN p_action = 'suppress' THEN 'Suppressed' ELSE 'Cooldown Applied (' || p_duration_days || ' days)' END, 
    p_operator_name, 
    p_reason, 
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION claim_account_intervention(
  p_tenant_id UUID,
  p_item_id UUID,
  p_operator_id UUID,
  p_operator_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id TEXT;
BEGIN
  UPDATE recovery_emails
  SET claimed_by_operator = p_operator_id
  WHERE tenant_id = p_tenant_id AND id = p_item_id AND claimed_by_operator IS NULL
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Account could not be claimed. It may not exist or is already assigned.';
  END IF;

  INSERT INTO manual_interventions (tenant_id, user_id, action, operator_name)
  VALUES (p_tenant_id, v_user_id, 'Account Claimed', p_operator_name);
END;
$$;

CREATE OR REPLACE FUNCTION requeue_dead_letter_intervention(
  p_tenant_id UUID,
  p_item_id UUID,
  p_operator_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id TEXT;
BEGIN
  UPDATE recovery_emails
  SET status = 'pending_dispatch',
      error_logs = NULL,
      next_retry_at = NOW()
  WHERE tenant_id = p_tenant_id AND id = p_item_id AND status = 'dead_lettered'
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Could not requeue. Account may not exist or is not in a dead-letter state.';
  END IF;

  INSERT INTO manual_interventions (tenant_id, user_id, action, operator_name)
  VALUES (p_tenant_id, v_user_id, 'Dead Letter Requeued', p_operator_name);
END;
$$;


-- ============================================================================
-- 5. INDEXES (Idempotent)
-- ============================================================================

-- FIX: Use IF NOT EXISTS to prevent 42P07 on re-runs
CREATE INDEX IF NOT EXISTS idx_recovery_emails_latest 
ON recovery_emails (tenant_id, user_id, created_at DESC);


-- ============================================================================
-- 6. tenants BILLING STATE (Idempotent + Backfill-safe)
-- ============================================================================

-- Add columns without NOT NULL first so existing rows don't block creation
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(50),
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billing_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS dodo_customer_id TEXT,
ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_billing_state') THEN
        ALTER TYPE platform_billing_state ADD VALUE IF NOT EXISTS 'free';
    END IF;
END $$;

-- Backfill legacy free_trial rows to restricted Free Access.
-- Pro entitlement is only granted after a verified Dodo subscription webhook.
UPDATE tenants
SET plan_tier = CASE
    WHEN LOWER(COALESCE(plan_tier, plan, '')) = 'pro' THEN 'pro'
    ELSE 'free'
END
WHERE plan_tier IS NULL OR plan_tier = 'free_trial';

UPDATE tenants
SET subscription_status = CASE
    WHEN plan_tier = 'pro' THEN COALESCE(NULLIF(subscription_status, ''), 'active')
    ELSE 'free'
END
WHERE subscription_status IS NULL
   OR subscription_status = ''
   OR (plan_tier <> 'pro' AND subscription_status <> 'free');

UPDATE tenants SET trial_ends_at = NULL WHERE plan_tier <> 'pro';
UPDATE tenants SET billing_status = 'free'
WHERE billing_status IS NULL AND plan_tier <> 'pro';
UPDATE tenants SET billing_status = 'trialing'
WHERE billing_status IS NULL AND plan_tier = 'pro' AND subscription_status = 'trialing';
UPDATE tenants SET billing_status = 'active'
WHERE billing_status IS NULL AND plan_tier = 'pro' AND subscription_status = 'active';
UPDATE tenants SET billing_status = 'past_due'
WHERE billing_status IS NULL AND plan_tier = 'pro' AND subscription_status = 'past_due';
UPDATE tenants SET billing_status = 'canceled'
WHERE billing_status IS NULL;

-- Set defaults and NOT NULL. The Pro trial clock starts via Dodo, not at signup.
ALTER TABLE tenants ALTER COLUMN plan_tier SET DEFAULT 'free';
ALTER TABLE tenants ALTER COLUMN subscription_status SET DEFAULT 'free';
ALTER TABLE tenants ALTER COLUMN trial_ends_at DROP DEFAULT;
ALTER TABLE tenants ALTER COLUMN billing_status SET DEFAULT 'free';
ALTER TABLE tenants ALTER COLUMN plan_tier SET NOT NULL;
ALTER TABLE tenants ALTER COLUMN subscription_status SET NOT NULL;

-- Recreate CHECK constraints so old 14-day/free_trial defaults do not survive.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_tier_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_plan_tier_check
CHECK (plan_tier IN ('free', 'free_trial', 'pro'));

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_subscription_status_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_subscription_status_check
CHECK (subscription_status IN ('free', 'trialing', 'active', 'past_due', 'canceled', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_tenants_dodo_customer_id
ON tenants(dodo_customer_id);

CREATE INDEX IF NOT EXISTS idx_tenants_dodo_subscription_id
ON tenants(dodo_subscription_id);
