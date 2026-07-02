DO $$ 
BEGIN
    -- Check if the legacy 'name' column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'api_keys' 
          AND column_name = 'name'
    ) THEN
        -- 1. Migrate legacy data to the new 'label' column
        UPDATE public.api_keys 
        SET label = name 
        WHERE label IS NULL AND name IS NOT NULL;

        -- 2. Remove the NOT NULL constraint so the Python code can insert successfully
        EXECUTE 'ALTER TABLE public.api_keys ALTER COLUMN name DROP NOT NULL;';
    END IF;
END $$;

DO $$ 
BEGIN
    -- 1. Remove NOT NULL constraint from legacy 'masked_key'
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'api_keys' 
          AND column_name = 'masked_key'
    ) THEN
        EXECUTE 'ALTER TABLE public.api_keys ALTER COLUMN masked_key DROP NOT NULL;';
    END IF;

    -- 2. Defensively remove NOT NULL constraint from legacy 'is_revoked' 
    -- (Based on code comments indicating it was replaced by 'revoked_at')
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
DECLARE
    v_constraint_name text;
BEGIN
    -- 1. Drop the legacy 'id' column completely
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'tenant_settings' 
          AND column_name = 'id'
    ) THEN
        -- Using CASCADE safely drops it even if it was acting as the primary key
        EXECUTE 'ALTER TABLE public.tenant_settings DROP COLUMN id CASCADE;';
    END IF;

    -- 2. Ensure 'tenant_id' is the primary key for UPSERTs to work correctly
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu 
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_schema = 'public' 
          AND tc.table_name = 'tenant_settings' 
          AND tc.constraint_type = 'PRIMARY KEY' 
          AND ccu.column_name = 'tenant_id'
    ) THEN
        -- Clear any other rogue primary keys just in case
        SELECT constraint_name INTO v_constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'tenant_settings'
          AND constraint_type = 'PRIMARY KEY';

        IF v_constraint_name IS NOT NULL THEN
            EXECUTE 'ALTER TABLE public.tenant_settings DROP CONSTRAINT ' || v_constraint_name || ' CASCADE;';
        END IF;

        -- Promote tenant_id to Primary Key
        ALTER TABLE public.tenant_settings ADD PRIMARY KEY (tenant_id);
    END IF;
END $$;
DO $$ 
BEGIN
    -- Add the missing updated_at column to api_keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'api_keys' 
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.api_keys ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
DO $$ 
BEGIN
    -- Check if the legacy 'storage_tier' column exists and drop its NOT NULL constraint
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
    -- Check if the legacy foreign key constraint pointing to 'organizations' exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tenant_settings_tenant_id_fkey'
          AND table_name = 'tenant_settings'
          AND table_schema = 'public'
    ) THEN
        -- Drop the legacy constraint
        EXECUTE 'ALTER TABLE public.tenant_settings DROP CONSTRAINT tenant_settings_tenant_id_fkey CASCADE;';
    END IF;
END $$;
-- 2. Create the new vw_customer_operations view
-- Uses churn_risk_state as the base dimension to include all customers,
-- LEFT JOINing the most recent recovery email state.
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
    
    -- Fallbacks to ensure we always have a display name
    COALESCE(crs.customer_name, SPLIT_PART(re.email, '@', 1), crs.user_id) AS name,
    re.email AS email,
    
    -- Metrics
    COALESCE(crs.risk_score, re.churn_risk_score, 0) AS risk_score,
    COALESCE(crs.mrr_at_risk, 0) AS mrr_at_risk,
    
    -- Signals
    COALESCE(re.primary_risk_signal, crs.risk_tier, 'No active signals') AS signal,
    'activity' AS signal_type, -- Can be expanded later based on actual signal origin
    
    -- Deterministic State Mapping
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
        'healthy' -- Default state if not in queue
    ) AS state,
    
    COALESCE(re.next_retry_at, re.lease_expires_at) AS next_action_time,
    
    -- Assignment (UUID cast to text for now until user join is implemented)
    re.claimed_by_operator::text AS assigned_to_name
    
FROM churn_risk_state crs
LEFT JOIN latest_recovery re 
    ON crs.tenant_id = re.tenant_id AND crs.user_id = re.user_id;

-- 3. Create the tenant-level metrics view for the HUD
-- This pushes the O(N) calculations to PostgreSQL, keeping Next.js memory footprint tiny.
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