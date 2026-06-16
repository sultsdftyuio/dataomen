-- ============================================================================
-- ARCLI CORE SCHEMA -- COMBINED CANONICAL BASE (v3.3-fixed-PROPER)
-- ============================================================================
-- Merges v3.1 + v3.2 + v3.3-discrepancy-fixes + CRITICAL migration fixes.
-- Run BEFORE Files 1-3.
-- All DDL is idempotent (IF NOT EXISTS / OR REPLACE / DO-blocks).
--
-- CRITICAL FIXES OVER v3.3:
--   1. Migration helpers now patch name, display_name, plan columns on legacy
--      tenants tables (was causing: column "name" does not exist).
--   2. Fixed broken rename status->status (no-op) to proper status->provisioning_status.
--   3. Fixed duplicate "status" column definition in CREATE TABLE -- now uses
--      provisioning_status for the enum and status for the text lifecycle column.
--   4. All NOT NULL column additions use DEFAULT to safely handle existing rows.
--   5. events table gains user_id and event_name columns (required by
--      metrics_service.py aggregate_daily_metrics).
--   6. metric_values_daily and metric_values_segmented gain metric_name
--      TEXT column so Python MVP code can query by name directly without
--      joining through metric_configs.
--   7. Section 14 ALTER TABLE ... ADD COLUMN IF NOT EXISTS wrapped in
--      safer DO blocks that check information_schema.columns directly.
--   8. anomaly_alerts definition confirmed as: UUID id, severity TEXT,
--      message TEXT, is_resolved BOOLEAN -- api/database.py must match.
--   9. FIXED queue_items orphan tables: risk_score_explanations, campaign_events,
--      and manual_interventions now reference recovery_emails(id) instead of
--      the non-existent queue_items table.
--  10. Moved premature ALTER TABLE churn_risk_state ADD COLUMN statements
--      to AFTER the churn_risk_state table is created.
--
-- DESIGN DECISIONS (unchanged):
--   * NO inline REFERENCES in CREATE TABLE. All FKs live in Section 15.
--   * Child FKs (email_id, send_id) use ON DELETE SET NULL.
--   * tenant_users FKs use ON DELETE CASCADE.
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- TYPES
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE provisioning_state AS ENUM ('PROVISIONING', 'READY', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Idempotent enum expansion -- duplicate_object is the correct exception
-- for an already-existing label (PostgreSQL does NOT support
-- "ADD VALUE IF NOT EXISTS" syntax).
DO $$ BEGIN ALTER TYPE provisioning_state ADD VALUE 'PENDING';    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE provisioning_state ADD VALUE 'SYNCING';    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE provisioning_state ADD VALUE 'INDEXING';   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE provisioning_state ADD VALUE 'SUSPENDED';  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE provisioning_state ADD VALUE 'ARCHIVED';   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE provisioning_state ADD VALUE 'DELETED';    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- CORE TENANT & USER TABLES
-- ============================================================================

-- FIXED: Removed duplicate "status" column. Now uses provisioning_status for
-- the provisioning_state enum and status for the text account lifecycle column.
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name                TEXT               NOT NULL DEFAULT '',
    display_name        TEXT,
    plan                TEXT,
    provisioning_status provisioning_state DEFAULT 'PROVISIONING',
    status              TEXT               NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Migration helpers -- idempotent, safe on both fresh and existing databases.
-- ---------------------------------------------------------------------------

-- CRITICAL FIX v3.3-proper: Patch missing core columns on legacy schemas.
-- If the table was created by an older schema that lacked these columns,
-- we must add them with safe defaults so existing rows don't break.

-- name: NOT NULL in the canonical schema, but legacy tables may lack it.
-- We add it with safe defaults for existing rows.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'tenants'
           AND column_name  = 'name'
    ) THEN
        ALTER TABLE public.tenants ADD COLUMN name TEXT NOT NULL DEFAULT '';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'tenants'
           AND column_name  = 'display_name'
    ) THEN
        ALTER TABLE public.tenants ADD COLUMN display_name TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'tenants'
           AND column_name  = 'plan'
    ) THEN
        ALTER TABLE public.tenants ADD COLUMN plan TEXT;
    END IF;
END $$;

-- FIXED v3.3-proper: Rename legacy 'status' column (provisioning_state type)
-- to 'provisioning_status' to free the name for the TEXT account status column.
-- The old code had: RENAME COLUMN status TO status (a no-op).
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'tenants'
           AND column_name  = 'status'
           AND udt_name     = 'provisioning_state'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'tenants'
           AND column_name  = 'provisioning_status'
    ) THEN
        ALTER TABLE public.tenants RENAME COLUMN status TO provisioning_status;
    END IF;
END $$;

-- Ensure the provisioning_status column exists (covers schemas where the rename
-- above did not fire because the column was missing entirely).
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'tenants'
           AND column_name  = 'provisioning_status'
    ) THEN
        ALTER TABLE public.tenants
            ADD COLUMN provisioning_status provisioning_state DEFAULT 'PROVISIONING';
    END IF;
END $$;

-- Ensure the account/billing status text column exists (migration + fresh guard).
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'tenants'
           AND column_name  = 'status'
    ) THEN
        ALTER TABLE public.tenants
            ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
    END IF;
END $$;

-- Add the status check constraint idempotently.
DO $$ BEGIN
    ALTER TABLE public.tenants
        ADD CONSTRAINT tenants_status_check
        CHECK (status IN ('active', 'suspended', 'past_due', 'deleted'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenant_users (
    tenant_id  TEXT,
    user_id    UUID,
    role       TEXT        DEFAULT 'owner',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (tenant_id, user_id)
);

-- Strict 1:1 user-to-workspace for the solo-founder MVP phase.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_users_user_id
    ON tenant_users(user_id);

CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id      TEXT PRIMARY KEY,
    reply_to_email TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_billing (
    tenant_id           TEXT PRIMARY KEY,
    stripe_customer_id  TEXT UNIQUE,
    subscription_status TEXT        DEFAULT 'incomplete',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- API KEYS & IDEMPOTENCY
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    TEXT        NOT NULL,
    key_id       TEXT        NOT NULL,
    key_hash     TEXT        NOT NULL DEFAULT '',
    revoked_at   TIMESTAMPTZ,
    hash_version TEXT        NOT NULL DEFAULT 'sha256',
    scopes       TEXT[]      NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, key_id)
);

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    idempotency_key  TEXT        NOT NULL,
    request_hash     TEXT        NOT NULL,
    response_payload JSONB,
    expires_at       TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, idempotency_key)
);

-- ============================================================================
-- EVENTS & ANALYTICS TABLES
-- ============================================================================

-- FIXED v3.3: Added user_id and event_name columns required by
-- metrics_service.py aggregate_daily_metrics().
CREATE TABLE IF NOT EXISTS events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT        NOT NULL,
    user_id         TEXT,                  -- ADDED: distinct user counts
    event_name      TEXT        NOT NULL DEFAULT '',  -- ADDED: group_by aggregations
    idempotency_key TEXT,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    value           NUMERIC,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT        NOT NULL,
    status     TEXT        NOT NULL DEFAULT 'active',
    last_seen  TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anomaly_alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT        NOT NULL,
    metric_name TEXT        NOT NULL,
    severity    TEXT,
    message     TEXT,
    is_resolved BOOLEAN     DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_dispatch_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    metric_name     TEXT,
    last_alerted_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS churn_risk_state (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT        NOT NULL,
    user_id    TEXT        NOT NULL,
    risk_tier  TEXT,
    risk_score NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 1. ADD MISSING "AIR TRAFFIC CONTROL" COLUMNS (moved AFTER churn_risk_state creation)
-- ============================================================================

-- Add MRR and Name to the risk state (the easiest place to cache customer identity)
ALTER TABLE churn_risk_state ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE churn_risk_state ADD COLUMN IF NOT EXISTS mrr_at_risk NUMERIC(18,2) DEFAULT 0;

-- ============================================================================
-- 2. CREATE THE UNIFIED RADAR VIEW (recovery_emails must exist first, so moved)
--    NOTE: View is created in Section 4 after recovery_emails is defined.
-- ============================================================================

-- ============================================================================
-- 3. RISK & CAMPAIGN TABLES (FIXED: queue_items -> recovery_emails)
-- ============================================================================

-- Risk factor explanations (written by the scoring engine)
CREATE TABLE IF NOT EXISTS risk_score_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id uuid,  -- references recovery_emails.id (FK added in Section 15)
  factor text NOT NULL,
  weight integer NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Campaign events (written by the automation pipeline)
CREATE TABLE IF NOT EXISTS campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id uuid,  -- references recovery_emails.id (FK added in Section 15)
  name text NOT NULL,
  date timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('delivered','opened','clicked','replied','bounced','suppressed','dead_lettered')),
  created_at timestamptz DEFAULT now()
);

-- Operator actions (written by the queue client)
CREATE TABLE IF NOT EXISTS manual_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id uuid,  -- references recovery_emails.id (FK added in Section 15)
  action text NOT NULL,
  operator_name text NOT NULL,
  date timestamptz NOT NULL DEFAULT now(),
  notes text
);

-- ============================================================================
-- MORE EVENTS & ANALYTICS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS churn_risk_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT         NOT NULL,
    risk_run_id         VARCHAR(255),
    user_id             TEXT         NOT NULL,
    churn_risk_score    NUMERIC,
    risk_tier           TEXT,
    primary_risk_signal TEXT,
    created_at          TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON COLUMN churn_risk_history.risk_tier IS
    'Mirrors churn_risk_state.risk_tier for historical trend analysis.';
COMMENT ON COLUMN churn_risk_history.risk_run_id IS
    'Links back to churn_scoring_runs.id. Used to group history rows per run.';

CREATE TABLE IF NOT EXISTS churn_scoring_runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    TEXT        NOT NULL,
    status       TEXT        DEFAULT 'running',
    started_at   TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metric_configs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT        NOT NULL,
    metric_name TEXT        NOT NULL,
    config      JSONB       DEFAULT '{}',
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- FIXED v3.3: Added metric_name TEXT for direct querying by Python MVP code
-- without requiring a join through metric_configs.  metric_config_id is
-- retained for normalized relationships.
CREATE TABLE IF NOT EXISTS metric_values_daily (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    metric_config_id UUID,                      -- normalized FK (optional)
    metric_name      TEXT,                      -- ADDED: direct name lookup
    date             DATE        NOT NULL,
    value            NUMERIC,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- FIXED v3.3: Added metric_name TEXT (same rationale as metric_values_daily)
CREATE TABLE IF NOT EXISTS metric_values_segmented (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    metric_config_id UUID,                      -- normalized FK (optional)
    metric_name      TEXT,                      -- ADDED: direct name lookup
    segment          TEXT,
    date             DATE        NOT NULL,
    value            NUMERIC,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anomaly_detector_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT        NOT NULL,
    detector_type TEXT,
    severity      TEXT,
    metric_name   TEXT,
    date          DATE,
    log_data      JSONB       DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_activity_daily (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT        NOT NULL,
    user_id        TEXT,
    date           DATE        NOT NULL,
    activity_count INT         DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RECOVERY / OUTBOX TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS recovery_emails (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            TEXT        NOT NULL,
    user_id              TEXT        NOT NULL,
    email                TEXT        NOT NULL CHECK (email <> ''),
    campaign_type        TEXT        NOT NULL,
    status               TEXT        NOT NULL DEFAULT 'pending_dispatch',
    idempotency_key      TEXT,
    primary_risk_signal  TEXT,
    churn_risk_score     INT,
    dispatch_token       TEXT,
    dispatch_attempt     INT         DEFAULT 0,
    dispatch_claimed_at  TIMESTAMPTZ,
    dispatched_at        TIMESTAMPTZ,
    provider_accepted_at TIMESTAMPTZ,
    delivered_at         TIMESTAMPTZ,
    sent_at              TIMESTAMPTZ,
    lease_expires_at     TIMESTAMPTZ,
    next_retry_at        TIMESTAMPTZ,
    failure_stage        TEXT,
    retry_count          INT         DEFAULT 0,
    queued_at            TIMESTAMPTZ,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index: only enforces when idempotency_key is supplied.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_emails_batch_user_campaign
    ON recovery_emails(tenant_id, idempotency_key, user_id, campaign_type)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS recovery_suppressions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT        NOT NULL,
    email      TEXT        NOT NULL,
    reason     TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS recovery_quota_usage (
    tenant_id    TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    used         INT         NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, window_start)
);

CREATE TABLE IF NOT EXISTS recovery_dispatch_dedup (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_token   TEXT        UNIQUE NOT NULL,
    tenant_id        TEXT        NOT NULL,
    send_id          UUID,
    state            TEXT        NOT NULL DEFAULT 'processing',
    lease_expires_at TIMESTAMPTZ,
    attempts         INT         DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_email_dlq (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT        NOT NULL,
    email_id      UUID,
    error_message TEXT,
    failure_stage TEXT        NOT NULL DEFAULT 'unknown',
    retry_count   INT         DEFAULT 0,
    failed_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_email_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT        NOT NULL,
    email_id    UUID,
    event_type  TEXT,
    occurred_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_attributions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT        NOT NULL,
    email_id      UUID,
    user_id       TEXT,
    campaign_type TEXT,
    revenue       NUMERIC,
    attributed_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT        NOT NULL,
    provider    TEXT,
    event_type  TEXT,
    received_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. CREATE THE UNIFIED RADAR VIEW (after recovery_emails exists)
-- ============================================================================
-- This view acts as the single source of truth for the Next.js Frontend.
-- It maps backend worker statuses directly to our UI state badges.

CREATE OR REPLACE VIEW vw_risk_queue_radar AS
SELECT
    re.id,
    re.tenant_id,
    re.user_id AS customer_id,

    -- Fallback to email prefix if customer_name isn't populated yet
    COALESCE(crs.customer_name, SPLIT_PART(re.email, '@', 1)) AS customer_name,
    re.email AS customer_email,

    -- Score and MRR from Risk State
    COALESCE(re.churn_risk_score, crs.risk_score, 0) AS risk_score,
    COALESCE(crs.mrr_at_risk, 0) AS mrr_at_risk,

    -- Strict mapping of backend enum to frontend UI states
    CASE
        WHEN re.status = 'dead_lettered' THEN 'dead_lettered'
        WHEN re.status IN ('dispatch_failed', 'failed') THEN 'failed'
        WHEN re.status IN ('pending_dispatch', 'queued') THEN 'pending'
        WHEN re.status IN ('dispatch_claimed', 'processing', 'dispatched_to_queue') THEN 'processing'
        WHEN re.status IN ('provider_accepted', 'delivered', 'sent') THEN 'cooldown'
        WHEN re.status = 'suppressed' THEN 'suppressed'
        ELSE 'pending'
    END AS state,

    -- Next automated action time
    COALESCE(re.next_retry_at, re.lease_expires_at) AS next_action_time,

    -- Future-proofing Phase 4: Assignment (Returns UUID for now)
    re.claimed_by_operator AS assigned_operator_id

FROM recovery_emails re
LEFT JOIN churn_risk_state crs
    ON re.tenant_id = crs.tenant_id AND re.user_id = crs.user_id
-- We filter out ancient 'completed' campaigns so the radar doesn't get cluttered.
-- Only show recent cooldowns (e.g., last 30 days) and active/failed queue items.
WHERE re.status NOT IN ('provider_accepted', 'delivered', 'sent')
   OR (re.created_at > NOW() - INTERVAL '30 days');

-- ============================================================================
-- Add Incident Assignment tracking to the outbox (AFTER recovery_emails exists)
-- ============================================================================
ALTER TABLE recovery_emails ADD COLUMN IF NOT EXISTS claimed_by_operator UUID;
ALTER TABLE recovery_emails ADD COLUMN IF NOT EXISTS operator_claimed_at TIMESTAMPTZ;

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

-- -------------------------------------------------------------------------
-- provision_initial_workspace: Race-safe singleton workspace creation
-- NOTE: writes to provisioning_status (was status in v3.2, renamed).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION provision_initial_workspace(target_user_id UUID, default_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    existing_tenant_id TEXT;
    new_tenant_id      TEXT;
BEGIN
    LOOP
        SELECT tenant_id INTO existing_tenant_id
          FROM tenant_users
         WHERE user_id = target_user_id;

        IF existing_tenant_id IS NOT NULL THEN
            RETURN existing_tenant_id;
        END IF;

        BEGIN
            INSERT INTO tenants (name, provisioning_status)
            VALUES (default_name, 'READY')
            RETURNING tenant_id INTO new_tenant_id;

            INSERT INTO tenant_users (tenant_id, user_id, role)
            VALUES (new_tenant_id, target_user_id, 'owner');

            RETURN new_tenant_id;
        EXCEPTION WHEN unique_violation THEN
            CONTINUE;
        END;
    END LOOP;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to provision workspace for user %: %', target_user_id, SQLERRM;
END;
$$;

COMMENT ON FUNCTION provision_initial_workspace(UUID, TEXT) IS
    'Deterministic workspace provisioning with race-safe singleton guarantee. '
    'Uses subtransaction exception handling so Postgres auto-rolls back '
    'orphaned tenant inserts on race loss.';

-- -------------------------------------------------------------------------
-- dispatch_campaign_atomic: Exactly-once campaign dispatch
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dispatch_campaign_atomic(
    p_tenant_id        TEXT,
    p_template_id      TEXT,
    p_idempotency_key  TEXT,
    p_request_hash     TEXT,
    p_targets          JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_claimed_id        UUID;
    v_i_own_slot        BOOLEAN := FALSE;
    v_existing_hash     TEXT;
    v_existing_response JSONB;
    v_inserted_count    INT;
    v_result            JSONB;
BEGIN
    IF p_tenant_id IS NULL OR trim(p_tenant_id) = '' THEN
        RAISE EXCEPTION 'p_tenant_id must not be empty';
    END IF;
    IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'p_idempotency_key must not be empty';
    END IF;
    IF p_request_hash IS NULL OR trim(p_request_hash) = '' THEN
        RAISE EXCEPTION 'p_request_hash must not be empty';
    END IF;
    IF p_targets IS NULL
        OR jsonb_typeof(p_targets) <> 'array'
        OR jsonb_array_length(p_targets) = 0
    THEN
        RAISE EXCEPTION 'p_targets must be a non-empty JSON array';
    END IF;

    INSERT INTO api_idempotency_keys (tenant_id, idempotency_key, request_hash)
    VALUES (p_tenant_id, p_idempotency_key, p_request_hash)
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_claimed_id;

    v_i_own_slot := (v_claimed_id IS NOT NULL);

    IF NOT v_i_own_slot THEN
        SELECT request_hash, response_payload
          INTO v_existing_hash, v_existing_response
          FROM api_idempotency_keys
         WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;

        IF v_existing_hash IS DISTINCT FROM p_request_hash THEN
            RAISE EXCEPTION 'idempotency_key reused with a different request payload (hash mismatch)';
        END IF;

        IF v_existing_response IS NOT NULL THEN
            RETURN v_existing_response;
        END IF;

        RETURN jsonb_build_object('status', 'pending', 'queued', 0);
    END IF;

    INSERT INTO recovery_emails (
        tenant_id, user_id, email, campaign_type, status,
        idempotency_key, primary_risk_signal, churn_risk_score,
        queued_at, created_at
    )
    SELECT
        p_tenant_id,
        t.id,
        LOWER(TRIM(t.email)),
        p_template_id,
        'pending_dispatch',
        p_idempotency_key,
        t.signal,
        t."riskScore",
        NOW(), NOW()
    FROM jsonb_to_recordset(p_targets) AS t(
        id          TEXT,
        email       TEXT,
        signal      TEXT,
        "riskScore" INT
    )
    WHERE TRIM(COALESCE(t.email, '')) <> ''
    ON CONFLICT (tenant_id, idempotency_key, user_id, campaign_type)
    WHERE idempotency_key IS NOT NULL
    DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    v_result := jsonb_build_object('status', 'queued', 'queued', v_inserted_count);

    UPDATE api_idempotency_keys
       SET response_payload = v_result
     WHERE tenant_id        = p_tenant_id
       AND idempotency_key  = p_idempotency_key
       AND id               = v_claimed_id
       AND response_payload IS NULL;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION dispatch_campaign_atomic(TEXT, TEXT, TEXT, TEXT, JSONB) IS
    'Atomic campaign dispatch with exactly-once outbox enqueue guarantee. '
    'Idempotency enforced via api_idempotency_keys slot ownership plus '
    'partial unique index on recovery_emails. '
    'Returns {status:"pending"} when concurrent request in-flight.';

-- -------------------------------------------------------------------------
-- bulk_dispatch_recovery_candidates: Bulk dispatch with quota & suppression
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bulk_dispatch_recovery_candidates(
    p_tenant_id          TEXT,
    p_candidates         JSONB,
    p_cooldown_days      INT,
    p_quota_limit        INT DEFAULT NULL,
    p_quota_window_sec   INT DEFAULT 3600,
    p_run_id             TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now            TIMESTAMPTZ := NOW();
    v_window_start   TIMESTAMPTZ;
    v_desired_count  INT := 0;
    v_allowed_count  INT := 0;
    v_remaining      INT := 0;
    v_used           INT := 0;
    v_results        JSONB;
BEGIN
    IF p_tenant_id IS NULL OR trim(p_tenant_id) = '' THEN
        RAISE EXCEPTION 'p_tenant_id must not be empty';
    END IF;
    IF p_candidates IS NULL
        OR jsonb_typeof(p_candidates) <> 'array'
        OR jsonb_array_length(p_candidates) = 0
    THEN
        RETURN jsonb_build_object('results', '[]'::jsonb, 'quota', NULL);
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id));

    DROP TABLE IF EXISTS tmp_recovery_candidates;

    CREATE TEMP TABLE tmp_recovery_candidates (
        user_id       TEXT,
        email         TEXT,
        signal        TEXT,
        campaign_type TEXT,
        score         INT,
        outcome       TEXT,
        reason        TEXT,
        send_id       UUID
    ) ON COMMIT DROP;

    INSERT INTO tmp_recovery_candidates (user_id, email, signal, campaign_type, score)
    SELECT DISTINCT ON (t.id, t.campaign_type)
        t.id, LOWER(TRIM(t.email)), t.signal, t.campaign_type, t.score
    FROM jsonb_to_recordset(p_candidates) AS t(
        id TEXT, email TEXT, signal TEXT, campaign_type TEXT, score INT
    )
    WHERE TRIM(COALESCE(t.id, ''))            <> ''
      AND TRIM(COALESCE(t.email, ''))          <> ''
      AND TRIM(COALESCE(t.campaign_type, ''))  <> '';

    UPDATE tmp_recovery_candidates c
       SET outcome = 'suppressed', reason = 'suppressed'
     WHERE EXISTS (
        SELECT 1 FROM recovery_suppressions s
         WHERE s.tenant_id = p_tenant_id
           AND s.email     = c.email
           AND (s.expires_at IS NULL OR s.expires_at > v_now)
     );

    UPDATE tmp_recovery_candidates c
       SET outcome = 'cooldown', reason = 'cooldown_active'
     WHERE c.outcome IS NULL
       AND EXISTS (
        SELECT 1 FROM recovery_emails e
         WHERE e.tenant_id     = p_tenant_id
           AND e.user_id       = c.user_id
           AND e.campaign_type = c.campaign_type
           AND e.status IN ('provider_accepted', 'delivered', 'sent')
           AND COALESCE(e.provider_accepted_at, e.sent_at, e.created_at) >=
               v_now - (p_cooldown_days::TEXT || ' days')::INTERVAL
     );

    UPDATE tmp_recovery_candidates c
       SET outcome = 'duplicate', reason = 'already_queued'
     WHERE c.outcome IS NULL
       AND EXISTS (
        SELECT 1 FROM recovery_emails e
         WHERE e.tenant_id     = p_tenant_id
           AND e.user_id       = c.user_id
           AND e.campaign_type = c.campaign_type
           AND e.status IN (
               'pending_dispatch', 'dispatch_claimed',
               'dispatched_to_queue', 'dispatch_failed'
           )
     );

    UPDATE tmp_recovery_candidates SET outcome = 'pending' WHERE outcome IS NULL;

    SELECT COUNT(*) INTO v_desired_count
      FROM tmp_recovery_candidates WHERE outcome = 'pending';

    v_allowed_count := v_desired_count;

    IF p_quota_limit IS NOT NULL AND p_quota_limit > 0 THEN
        v_window_start := to_timestamp(
            floor(extract(epoch from v_now) / p_quota_window_sec) * p_quota_window_sec
        );

        INSERT INTO recovery_quota_usage (tenant_id, window_start, used, updated_at)
        VALUES (p_tenant_id, v_window_start, 0, v_now)
        ON CONFLICT (tenant_id, window_start) DO NOTHING;

        SELECT used INTO v_used
          FROM recovery_quota_usage
         WHERE tenant_id    = p_tenant_id
           AND window_start = v_window_start
         FOR UPDATE;

        v_remaining     := GREATEST(p_quota_limit - v_used, 0);
        v_allowed_count := LEAST(v_desired_count, v_remaining);

        UPDATE recovery_quota_usage
           SET used = used + v_allowed_count, updated_at = v_now
         WHERE tenant_id    = p_tenant_id
           AND window_start = v_window_start;
    END IF;

    IF v_allowed_count < v_desired_count THEN
        UPDATE tmp_recovery_candidates
           SET outcome = 'rate_limited', reason = 'quota_exceeded'
         WHERE ctid IN (
            SELECT ctid FROM tmp_recovery_candidates
             WHERE outcome = 'pending'
             ORDER BY user_id, campaign_type OFFSET v_allowed_count
         );
    END IF;

    WITH ins AS (
        INSERT INTO recovery_emails (
            tenant_id, user_id, email, campaign_type, status,
            primary_risk_signal, churn_risk_score,
            queued_at, created_at, updated_at
        )
        SELECT p_tenant_id, user_id, email, campaign_type, 'pending_dispatch',
               signal, score, v_now, v_now, v_now
          FROM tmp_recovery_candidates WHERE outcome = 'pending'
        ON CONFLICT DO NOTHING
        RETURNING id, user_id, campaign_type
    )
    UPDATE tmp_recovery_candidates c
       SET outcome = 'claimed'
      FROM ins
     WHERE c.user_id       = ins.user_id
       AND c.campaign_type = ins.campaign_type;

    UPDATE tmp_recovery_candidates
       SET outcome = 'duplicate', reason = 'already_queued'
     WHERE outcome = 'pending';

    UPDATE tmp_recovery_candidates c
       SET send_id = e.id
      FROM recovery_emails e
     WHERE e.tenant_id     = p_tenant_id
       AND e.user_id       = c.user_id
       AND e.campaign_type = c.campaign_type
       AND c.outcome IN ('claimed', 'duplicate');

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'outcome',       outcome,
        'send_id',       send_id,
        'message',       reason,
        'user_id',       user_id,
        'campaign_type', campaign_type
    )), '[]'::jsonb) INTO v_results
    FROM tmp_recovery_candidates;

    RETURN jsonb_build_object(
        'results', v_results,
        'quota',
        CASE
            WHEN p_quota_limit IS NULL OR p_quota_limit <= 0 THEN NULL
            ELSE jsonb_build_object(
                'allowed',    v_allowed_count > 0,
                'limit',      p_quota_limit,
                'used',       v_used + v_allowed_count,
                'remaining',  GREATEST(p_quota_limit - (v_used + v_allowed_count), 0),
                'applied',    v_allowed_count
            )
        END
    );
END;
$$;

-- -------------------------------------------------------------------------
-- claim_outbox_batch: Worker claims a batch of emails for dispatch
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_outbox_batch(p_limit INT)
RETURNS TABLE (
    id               UUID,
    tenant_id        TEXT,
    dispatch_token   TEXT,
    dispatch_attempt INT,
    retry_count      INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    WITH cte AS (
        SELECT id FROM recovery_emails
         WHERE status IN ('pending_dispatch', 'dispatch_failed')
           AND (status <> 'dispatch_failed' OR failure_stage = 'dispatch')
           AND (next_retry_at IS NULL OR next_retry_at <= NOW())
           AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
         ORDER BY created_at ASC
         LIMIT GREATEST(p_limit, 0)
         FOR UPDATE SKIP LOCKED
    ), upd AS (
        UPDATE recovery_emails r
           SET status           = 'dispatch_claimed',
               dispatch_attempt = COALESCE(dispatch_attempt, 0) + 1,
               dispatch_token   = encode(digest(gen_random_uuid()::TEXT, 'sha256'), 'hex'),
               dispatch_claimed_at = NOW(),
               lease_expires_at = NOW() + INTERVAL '15 minutes',
               updated_at       = NOW()
          FROM cte WHERE r.id = cte.id
         RETURNING r.id, r.tenant_id, r.dispatch_token, r.dispatch_attempt, r.retry_count
    )
    SELECT * FROM upd;
END;
$$;

-- -------------------------------------------------------------------------
-- claim_dispatch_token: Deduplicate at the provider boundary
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_dispatch_token(
    p_dispatch_token TEXT,
    p_tenant_id      TEXT,
    p_send_id        UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now   TIMESTAMPTZ := NOW();
    v_state TEXT;
    v_lease TIMESTAMPTZ;
BEGIN
    IF p_dispatch_token IS NULL OR trim(p_dispatch_token) = '' THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'invalid');
    END IF;

    INSERT INTO recovery_dispatch_dedup (
        dispatch_token, tenant_id, send_id, state,
        lease_expires_at, attempts, created_at, updated_at
    ) VALUES (
        p_dispatch_token, p_tenant_id, p_send_id, 'processing',
        v_now + INTERVAL '15 minutes', 1, v_now, v_now
    )
    ON CONFLICT (dispatch_token) DO NOTHING;

    IF FOUND THEN
        RETURN jsonb_build_object('claimed', true, 'state', 'claimed');
    END IF;

    SELECT state, lease_expires_at
      INTO v_state, v_lease
      FROM recovery_dispatch_dedup
     WHERE dispatch_token = p_dispatch_token
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'missing');
    END IF;

    IF v_state = 'completed' THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'completed');
    END IF;

    IF v_lease IS NOT NULL AND v_lease >= v_now THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'in_flight');
    END IF;

    UPDATE recovery_dispatch_dedup
       SET tenant_id       = p_tenant_id,
           send_id         = p_send_id,
           state           = 'reclaimed',
           lease_expires_at = v_now + INTERVAL '15 minutes',
           attempts        = attempts + 1,
           updated_at      = v_now
     WHERE dispatch_token = p_dispatch_token;

    RETURN jsonb_build_object('claimed', true, 'state', 'reclaimed');
END;
$$;

-- ============================================================================
-- SECTION 14: MIGRATION SAFETY -- ENSURE FK COLUMNS EXIST
-- ============================================================================
-- If any table was created by an older schema (or a failed partial run) the
-- column referenced by a FK below may be missing.  Column additions are
-- wrapped in DO blocks that check information_schema.columns directly for
-- full idempotency on all PostgreSQL versions.
-- ============================================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_users' AND column_name='tenant_id') THEN
        ALTER TABLE tenant_users ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_users' AND column_name='user_id') THEN
        ALTER TABLE tenant_users ADD COLUMN user_id UUID;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_billing' AND column_name='tenant_id') THEN
        ALTER TABLE tenant_billing ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_settings' AND column_name='tenant_id') THEN
        ALTER TABLE tenant_settings ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='tenant_id') THEN
        ALTER TABLE events ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
-- FIXED v3.3: Also ensure events.user_id and events.event_name exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='user_id') THEN
        ALTER TABLE events ADD COLUMN user_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='event_name') THEN
        ALTER TABLE events ADD COLUMN event_name TEXT NOT NULL DEFAULT '';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alerts' AND column_name='tenant_id') THEN
        ALTER TABLE alerts ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='anomaly_alerts' AND column_name='tenant_id') THEN
        ALTER TABLE anomaly_alerts ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alert_dispatch_logs' AND column_name='tenant_id') THEN
        ALTER TABLE alert_dispatch_logs ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='churn_risk_state' AND column_name='tenant_id') THEN
        ALTER TABLE churn_risk_state ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='churn_risk_history' AND column_name='tenant_id') THEN
        ALTER TABLE churn_risk_history ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='churn_scoring_runs' AND column_name='tenant_id') THEN
        ALTER TABLE churn_scoring_runs ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='metric_configs' AND column_name='tenant_id') THEN
        ALTER TABLE metric_configs ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='metric_values_daily' AND column_name='tenant_id') THEN
        ALTER TABLE metric_values_daily ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
-- FIXED v3.3: Ensure metric_values_daily.metric_name exists
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='metric_values_daily' AND column_name='metric_name') THEN
        ALTER TABLE metric_values_daily ADD COLUMN metric_name TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='metric_values_daily' AND column_name='updated_at') THEN
        ALTER TABLE metric_values_daily ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='metric_values_segmented' AND column_name='tenant_id') THEN
        ALTER TABLE metric_values_segmented ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
-- FIXED v3.3: Ensure metric_values_segmented.metric_name exists
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='metric_values_segmented' AND column_name='metric_name') THEN
        ALTER TABLE metric_values_segmented ADD COLUMN metric_name TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='anomaly_detector_logs' AND column_name='tenant_id') THEN
        ALTER TABLE anomaly_detector_logs ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_activity_daily' AND column_name='tenant_id') THEN
        ALTER TABLE user_activity_daily ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_emails' AND column_name='tenant_id') THEN
        ALTER TABLE recovery_emails ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_suppressions' AND column_name='tenant_id') THEN
        ALTER TABLE recovery_suppressions ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_quota_usage' AND column_name='tenant_id') THEN
        ALTER TABLE recovery_quota_usage ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_dispatch_dedup' AND column_name='tenant_id') THEN
        ALTER TABLE recovery_dispatch_dedup ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_email_dlq' AND column_name='tenant_id') THEN
        ALTER TABLE recovery_email_dlq ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_email_events' AND column_name='tenant_id') THEN
        ALTER TABLE recovery_email_events ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_attributions' AND column_name='tenant_id') THEN
        ALTER TABLE recovery_attributions ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='billing_webhook_events' AND column_name='tenant_id') THEN
        ALTER TABLE billing_webhook_events ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='api_keys' AND column_name='tenant_id') THEN
        ALTER TABLE api_keys ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='api_idempotency_keys' AND column_name='tenant_id') THEN
        ALTER TABLE api_idempotency_keys ADD COLUMN tenant_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='risk_score_explanations' AND column_name='queue_item_id') THEN
        ALTER TABLE risk_score_explanations ADD COLUMN queue_item_id UUID;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaign_events' AND column_name='queue_item_id') THEN
        ALTER TABLE campaign_events ADD COLUMN queue_item_id UUID;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manual_interventions' AND column_name='queue_item_id') THEN
        ALTER TABLE manual_interventions ADD COLUMN queue_item_id UUID;
    END IF;
END $$;

-- Child FK columns (SET NULL targets)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_email_events' AND column_name='email_id') THEN
        ALTER TABLE recovery_email_events ADD COLUMN email_id UUID;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_email_dlq' AND column_name='email_id') THEN
        ALTER TABLE recovery_email_dlq ADD COLUMN email_id UUID;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_dispatch_dedup' AND column_name='send_id') THEN
        ALTER TABLE recovery_dispatch_dedup ADD COLUMN send_id UUID;
    END IF;
END $$;

-- New columns added in v3.3 (safe for existing databases)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='api_keys' AND column_name='key_hash') THEN
        ALTER TABLE api_keys ADD COLUMN key_hash TEXT NOT NULL DEFAULT '';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_attributions' AND column_name='email_id') THEN
        ALTER TABLE recovery_attributions ADD COLUMN email_id UUID;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_attributions' AND column_name='user_id') THEN
        ALTER TABLE recovery_attributions ADD COLUMN user_id TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_attributions' AND column_name='campaign_type') THEN
        ALTER TABLE recovery_attributions ADD COLUMN campaign_type TEXT;
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='recovery_attributions' AND column_name='attributed_at') THEN
        ALTER TABLE recovery_attributions ADD COLUMN attributed_at TIMESTAMPTZ;
    END IF;
END $$;

-- ============================================================================
-- SECTION 15: CORE FOREIGN KEYS
-- ============================================================================
-- All FKs live here so they can be deployed with:
--   NOT VALID            -> skips full-table scan during deploy
--   DEFERRABLE INITIALLY DEFERRED -> allows complex transactions
--
-- Child FKs (email_id, send_id) use ON DELETE SET NULL so audit/DLQ rows
-- survive parent deletion and can be cleaned by retention jobs independently.
-- ============================================================================

DO $$ BEGIN ALTER TABLE tenant_users
    ADD CONSTRAINT fk_tenant_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    ON DELETE CASCADE NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
        ALTER TABLE tenant_users
            ADD CONSTRAINT fk_tenant_users_user FOREIGN KEY (user_id) REFERENCES auth.users(id)
            ON DELETE CASCADE NOT VALID DEFERRABLE INITIALLY DEFERRED;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE tenant_billing
    ADD CONSTRAINT fk_tenant_billing_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE tenant_settings
    ADD CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE events
    ADD CONSTRAINT fk_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE alerts
    ADD CONSTRAINT fk_alerts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE anomaly_alerts
    ADD CONSTRAINT fk_anomaly_alerts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    ON DELETE CASCADE NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE alert_dispatch_logs
    ADD CONSTRAINT fk_alert_dispatch_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE churn_risk_state
    ADD CONSTRAINT fk_churn_risk_state_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE churn_risk_history
    ADD CONSTRAINT fk_churn_risk_history_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE churn_scoring_runs
    ADD CONSTRAINT fk_churn_scoring_runs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE metric_configs
    ADD CONSTRAINT fk_metric_configs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE metric_values_daily
    ADD CONSTRAINT fk_metric_values_daily_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE metric_values_segmented
    ADD CONSTRAINT fk_metric_values_segmented_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE anomaly_detector_logs
    ADD CONSTRAINT fk_anomaly_detector_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE user_activity_daily
    ADD CONSTRAINT fk_user_activity_daily_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE recovery_emails
    ADD CONSTRAINT fk_recovery_emails_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE recovery_suppressions
    ADD CONSTRAINT fk_recovery_suppressions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE recovery_quota_usage
    ADD CONSTRAINT fk_recovery_quota_usage_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE recovery_dispatch_dedup
    ADD CONSTRAINT fk_recovery_dispatch_dedup_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE recovery_email_dlq
    ADD CONSTRAINT fk_recovery_email_dlq_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE recovery_email_events
    ADD CONSTRAINT fk_recovery_email_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Child FKs: ON DELETE SET NULL preserves audit/DLQ rows independently.
DO $$ BEGIN ALTER TABLE recovery_email_events
    ADD CONSTRAINT fk_recovery_email_events_email FOREIGN KEY (email_id) REFERENCES recovery_emails(id)
    ON DELETE SET NULL NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE recovery_email_dlq
    ADD CONSTRAINT fk_recovery_email_dlq_email FOREIGN KEY (email_id) REFERENCES recovery_emails(id)
    ON DELETE SET NULL NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE recovery_dispatch_dedup
    ADD CONSTRAINT fk_recovery_dispatch_dedup_send FOREIGN KEY (send_id) REFERENCES recovery_emails(id)
    ON DELETE SET NULL NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE recovery_attributions
    ADD CONSTRAINT fk_recovery_attributions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE billing_webhook_events
    ADD CONSTRAINT fk_billing_webhook_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE api_keys
    ADD CONSTRAINT fk_api_keys_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE api_idempotency_keys
    ADD CONSTRAINT fk_api_idempotency_keys_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- New FKs in v3.3 (metric_values -> metric_configs)
DO $$ BEGIN ALTER TABLE metric_values_daily
    ADD CONSTRAINT fk_metric_values_daily_config FOREIGN KEY (metric_config_id) REFERENCES metric_configs(id)
    ON DELETE SET NULL NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE metric_values_segmented
    ADD CONSTRAINT fk_metric_values_segmented_config FOREIGN KEY (metric_config_id) REFERENCES metric_configs(id)
    ON DELETE SET NULL NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FIXED v3.3: FKs for the three queue_item_id tables (now referencing recovery_emails.id)
DO $$ BEGIN ALTER TABLE risk_score_explanations
    ADD CONSTRAINT fk_risk_score_explanations_email FOREIGN KEY (queue_item_id) REFERENCES recovery_emails(id)
    ON DELETE CASCADE NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE campaign_events
    ADD CONSTRAINT fk_campaign_events_email FOREIGN KEY (queue_item_id) REFERENCES recovery_emails(id)
    ON DELETE CASCADE NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE manual_interventions
    ADD CONSTRAINT fk_manual_interventions_email FOREIGN KEY (queue_item_id) REFERENCES recovery_emails(id)
    ON DELETE CASCADE NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- SECTION 16: ADDITIONAL INDEXES & CONSTRAINTS
-- ============================================================================
-- Safe, idempotent additions that do NOT modify existing column types or
-- function signatures, so downstream Files 1-3 continue to work unchanged.
-- ============================================================================

-- Outbox worker claim query (covers claim_outbox_batch filter + ordering)
CREATE INDEX IF NOT EXISTS idx_recovery_emails_claim
    ON recovery_emails(status, next_retry_at, lease_expires_at, created_at)
    WHERE status IN ('pending_dispatch', 'dispatch_failed');

-- Bulk dispatch duplicate / cooldown checks
CREATE INDEX IF NOT EXISTS idx_recovery_emails_user_campaign
    ON recovery_emails(tenant_id, user_id, campaign_type, status, provider_accepted_at, sent_at, created_at);

-- Idempotency key TTL cleanup job
CREATE INDEX IF NOT EXISTS idx_api_idempotency_keys_expires
    ON api_idempotency_keys(expires_at)
    WHERE expires_at IS NOT NULL;

-- Prevent duplicate risk-state rows per tenant/user
CREATE UNIQUE INDEX IF NOT EXISTS idx_churn_risk_state_tenant_user
    ON churn_risk_state(tenant_id, user_id);

-- Prevent duplicate daily activity rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_activity_daily_tenant_user_date
    ON user_activity_daily(tenant_id, user_id, date);

-- FIXED v3.3: Index on events.event_name for metrics_service aggregations
CREATE INDEX IF NOT EXISTS idx_events_tenant_name_ts
    ON events(tenant_id, event_name, timestamp);

-- FIXED v3.3: Index on metric_values_daily.metric_name for direct lookups
CREATE INDEX IF NOT EXISTS idx_metric_values_daily_name_date
    ON metric_values_daily(tenant_id, metric_name, date);

-- Enforce ON CONFLICT target for metric_values_daily upserts
CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_values_daily_tenant_metric_date
    ON metric_values_daily(tenant_id, metric_name, date);

-- FIXED v3.3: Index on metric_values_segmented.metric_name for direct lookups
CREATE INDEX IF NOT EXISTS idx_metric_values_segmented_name_date
    ON metric_values_segmented(tenant_id, metric_name, date);

-- ============================================================================
-- END OF COMBINED CANONICAL BASE v3.3-fixed-PROPER
-- ============================================================================
-- Next: run File 1 (triggers, CHECKs, normalization, numeric precision).
-- ============================================================================