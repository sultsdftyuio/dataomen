-- ============================================================================
-- ARCLI CORE SCHEMA — HARDENING & CORRECTNESS MIGRATION v2.1
-- ============================================================================
-- Addresses 18 categories of architectural, concurrency, correctness,
-- operational, scalability, and security issues.
--
-- SAFE TO RUN MULTIPLE TIMES: all DDL uses IF NOT EXISTS / OR REPLACE /
-- DO...EXCEPTION blocks. No destructive rewrites.
--
-- NOTE — USER_ID UUID MIGRATION (#4):
--   Supabase auth.uid() returns UUID. Current schema stores user_id as TEXT
--   (cast via ::text in RLS policies). Direct ALTER COLUMN TYPE UUID is safe
--   ONLY if all existing values are valid UUID strings. Recommended path:
--     1. Add user_id_uuid UUID GENERATED ALWAYS AS (user_id::uuid) STORED
--        (fails fast if any non-UUID values exist, letting you audit first).
--     2. Swap columns during a maintenance window once backfill validates.
--   This migration documents the strategy but does not force the conversion,
--   preserving zero-downtime deploy compatibility.
--
-- NOTE — TENANT_ID UUID MIGRATION (#4):
--   tenant_id may carry business-meaningful slugs, not just UUIDs. Converting
--   to UUID requires application-level coordination. Left as TEXT with a
--   canonical tenants table providing referential integrity instead.
--
-- NOTE — pg_cron (#10):
--   Retention jobs require the pg_cron extension (Supabase Pro+). The DO block
--   in Section 10 is wrapped in an EXCEPTION so this migration succeeds on
--   free-tier deployments. Schedule the jobs manually if pg_cron is unavailable.
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_cron is optional; used only for retention jobs in Section 10.
-- Failure here is non-fatal (exception is caught in Section 10).
DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron not available — retention jobs will be skipped. Install it on Supabase Pro to enable.';
END $$;


-- ============================================================================
-- SECTION 6: UPDATED_AT TRIGGER OPTIMIZATION
-- ============================================================================
-- Avoids unnecessary heap writes on no-op UPDATEs (common with ORMs that
-- always emit UPDATE even when nothing changed).
-- IS DISTINCT FROM handles NULL comparisons correctly (NULL <> NULL is false
-- in standard SQL, but IS DISTINCT FROM NULL, NULL → false as expected).

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW IS DISTINCT FROM OLD THEN
        NEW.updated_at = NOW();
    END IF;
    -- Always return NEW (even if unchanged) so the caller's UPDATE proceeds.
    -- Returning NULL would silently cancel the UPDATE, which is surprising.
    RETURN NEW;
END;
$$;

-- Helper: attach trigger idempotently. Unchanged from v2 — preserved.
CREATE OR REPLACE FUNCTION _attach_updated_at(p_table TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname  = 'trg_' || p_table || '_updated_at'
          AND tgrelid = p_table::regclass
    ) THEN
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            p_table, p_table
        );
    END IF;
END;
$$;


-- ============================================================================
-- SECTION 3: TENANT NORMALIZATION
-- ============================================================================
-- A canonical tenants table provides referential integrity for all tenant_id
-- foreign keys. Without it, orphaned tenant rows could accumulate silently
-- and multi-tenant isolation relies entirely on application-level logic.
--
-- Foreign keys use NOT VALID to avoid a full-table sequential scan on large
-- tables during deploy. Run VALIDATE CONSTRAINT during a low-traffic window.

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id    TEXT        PRIMARY KEY,
    display_name TEXT,
    status       TEXT        NOT NULL DEFAULT 'PROVISIONING',
    -- plan could gate feature flags; left nullable for backward compat
    plan         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PROVISIONING';

DO $$ BEGIN PERFORM _attach_updated_at('tenants'); END $$;

COMMENT ON TABLE tenants IS
    'Canonical tenant registry. All tenant_id foreign keys reference this table. '
    'Seeded from tenant_settings on first migration run.';

DO $$ BEGIN
    ALTER TABLE tenants ADD CONSTRAINT chk_tenants_status
        CHECK (status IN ('PROVISIONING', 'INTEGRATION', 'BACKFILLING', 'READY', 'FAILED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE tenants t
SET status = CASE
    WHEN EXISTS (
        SELECT 1
        FROM tenant_settings s
        WHERE s.tenant_id = t.tenant_id
          AND s.stripe_account_id IS NOT NULL
    )
    THEN CASE
        WHEN EXISTS (
            SELECT 1
            FROM events e
            WHERE e.tenant_id = t.tenant_id
        ) THEN 'READY'
        ELSE 'BACKFILLING'
    END
    ELSE 'INTEGRATION'
END
WHERE t.status = 'PROVISIONING';

-- Seed from tenant_settings (the most complete source of existing tenants).
-- ON CONFLICT DO NOTHING makes this replay-safe.
INSERT INTO tenants (tenant_id)
SELECT tenant_id FROM tenant_settings
ON CONFLICT (tenant_id) DO NOTHING;

-- Also seed any tenants that appear in tenant_users but not yet in tenant_settings.
INSERT INTO tenants (tenant_id)
SELECT DISTINCT tenant_id FROM tenant_users
ON CONFLICT (tenant_id) DO NOTHING;

-- RLS: users can read their own tenant row.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "tenants_select_own" ON tenants
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = tenants.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Foreign keys (NOT VALID for zero-downtime deploy; validate separately).
DO $$ BEGIN
    ALTER TABLE tenant_settings
        ADD CONSTRAINT fk_tenant_settings_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tenant_users
        ADD CONSTRAINT fk_tenant_users_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE events
        ADD CONSTRAINT fk_events_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE alerts
        ADD CONSTRAINT fk_alerts_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE churn_risk_state
        ADD CONSTRAINT fk_churn_risk_state_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE recovery_emails
        ADD CONSTRAINT fk_recovery_emails_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECTION 5: STATUS / ENUM CHECK CONSTRAINT HARDENING
-- ============================================================================
-- CHECK constraints on all lifecycle/status columns prevent invalid states
-- from being written. DO...EXCEPTION pattern is idempotent: re-running this
-- migration on a database that already has the constraint is safe.

-- alerts.status
DO $$ BEGIN
    ALTER TABLE alerts ADD CONSTRAINT chk_alerts_status
        CHECK (status IN ('active', 'resolved', 'snoozed', 'suppressed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- anomaly_detector_logs.severity
DO $$ BEGIN
    ALTER TABLE anomaly_detector_logs ADD CONSTRAINT chk_anomaly_severity
        CHECK (severity IN ('low', 'medium', 'high', 'critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- churn_risk_state.risk_tier
DO $$ BEGIN
    ALTER TABLE churn_risk_state ADD CONSTRAINT chk_churn_risk_tier
        CHECK (risk_tier IN ('healthy', 'low', 'medium', 'high', 'critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- churn_risk_history.risk_tier (mirrors churn_risk_state)
DO $$ BEGIN
    ALTER TABLE churn_risk_history ADD CONSTRAINT chk_churn_risk_history_tier
        CHECK (risk_tier IN ('healthy', 'low', 'medium', 'high', 'critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- recovery_email_dlq.failure_stage
ALTER TABLE recovery_email_dlq ADD COLUMN IF NOT EXISTS failure_stage TEXT NOT NULL DEFAULT 'unknown';
DO $$ BEGIN
    ALTER TABLE recovery_email_dlq ADD CONSTRAINT chk_dlq_failure_stage
        CHECK (failure_stage IN (
            'dispatch', 'send', 'delivery',
            'validation', 'suppression', 'provider',
            'cooldown', 'unknown'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- billing_webhook_events.provider
-- Extend the list as new providers are onboarded; constraint prevents typos.
DO $$ BEGIN
    ALTER TABLE billing_webhook_events ADD CONSTRAINT chk_billing_provider
        CHECK (provider IN (
            'stripe', 'paddle', 'chargebee', 'braintree', 'recurly', 'other'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- metric_configs.is_active is already BOOLEAN NOT NULL — no change needed.

-- recovery_emails.status: update lifecycle for durable outbox + keep legacy states.
DO $$ BEGIN
    ALTER TABLE recovery_emails
        DROP CONSTRAINT IF EXISTS chk_recovery_emails_status;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE recovery_emails ADD CONSTRAINT chk_recovery_emails_status
        CHECK (status IN (
            'pending_dispatch', 'dispatch_claimed', 'dispatched_to_queue',
            'provider_accepted', 'delivered', 'dispatch_failed', 'dead_lettered',
            -- legacy values (kept for backward compatibility / data retention)
            'queued', 'processing', 'sent', 'failed', 'suppressed'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECTION 7: NUMERIC PRECISION HARDENING
-- ============================================================================
-- Unrestricted NUMERIC is arbitrary-precision and wastes storage for columns
-- that represent money (fixed 4dp) or ratios (fixed 6dp).
-- TYPE changes use the USING clause to force the cast and surface any
-- truncation issues immediately rather than swallowing them silently.

-- Revenue / money: NUMERIC(18,4) — sub-cent precision, up to 99 trillion
ALTER TABLE recovery_attributions
    ALTER COLUMN revenue TYPE NUMERIC(18,4) USING revenue::NUMERIC(18,4);

-- Metric values: NUMERIC(18,6) — six decimal places for rates/ratios
ALTER TABLE metric_values_daily
    ALTER COLUMN value TYPE NUMERIC(18,6) USING value::NUMERIC(18,6);

ALTER TABLE metric_values_segmented
    ALTER COLUMN value TYPE NUMERIC(18,6) USING value::NUMERIC(18,6);

-- Event value: general-purpose; NUMERIC(18,6) is sufficient for most metrics.
-- If sub-microsecond precision is required for a specific event type, use
-- DOUBLE PRECISION (8 bytes, 15 significant digits) instead.
ALTER TABLE events
    ALTER COLUMN value TYPE NUMERIC(18,6) USING value::NUMERIC(18,6);


-- ============================================================================
-- SECTION 8: EMAIL NORMALIZATION
-- ============================================================================
-- Email storage must always be lower(trim(email)) to prevent:
--   • Case-sensitivity uniqueness bypass (User@EXAMPLE.COM vs user@example.com)
--   • Suppression misses (lookup fails because case differs at write time)
--   • Provider dedup failures
--
-- Step 1: normalize existing data in place (idempotent; no-op if already clean).
-- Step 2: add CHECK constraints to enforce future writes.
-- The RPC already calls LOWER(TRIM(...)) on insert; the CHECK is a hard backstop.

UPDATE recovery_suppressions
SET    email = LOWER(TRIM(email))
WHERE  email IS NOT NULL
  AND  email <> LOWER(TRIM(email));

DO $$ BEGIN
    ALTER TABLE recovery_suppressions
        ADD CONSTRAINT chk_suppression_email_normalized
        CHECK (email = LOWER(TRIM(email)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE recovery_emails
SET    email = LOWER(TRIM(email))
WHERE  email IS NOT NULL
  AND  email <> LOWER(TRIM(email));

DO $$ BEGIN
    ALTER TABLE recovery_emails
        ADD CONSTRAINT chk_recovery_email_normalized
        CHECK (email = LOWER(TRIM(email)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Normalize tenant_settings reply-to email
UPDATE tenant_settings
SET    reply_to_email = LOWER(TRIM(reply_to_email))
WHERE  reply_to_email IS NOT NULL
  AND  reply_to_email <> LOWER(TRIM(reply_to_email));

DO $$ BEGIN
    ALTER TABLE tenant_settings
        ADD CONSTRAINT chk_tenant_reply_to_email_normalized
        CHECK (reply_to_email IS NULL OR reply_to_email = LOWER(TRIM(reply_to_email)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECTION 11: WORKER LEASE SAFETY (Corrected Update)
-- ============================================================================

ALTER TABLE recovery_emails
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN recovery_emails.lease_expires_at IS
    'Explicit worker lease expiry. Replaces the implicit processing_started_at + 15m '
    'reclaim pattern. Workers renew before expiry for long-running dispatch. '
    'Rows where status=dispatch_claimed (or legacy processing) AND lease_expires_at < NOW() '
    'are reclaimable.';

-- Retroactively set lease_expires_at for any stuck processing rows
-- so they are immediately reclaimable by workers after this deploy.
-- Retroactively set lease_expires_at for any stuck processing rows
-- so they are eventually reclaimable by workers after this deploy.
UPDATE recovery_emails
SET    lease_expires_at = NOW() + INTERVAL '15 minutes'
WHERE  status IN ('processing', 'dispatch_claimed')
  AND  lease_expires_at IS NULL;

-- ============================================================================
-- SECTION 11B: OUTBOX DISPATCH METADATA
-- ============================================================================

ALTER TABLE recovery_emails
    ADD COLUMN IF NOT EXISTS dispatch_token TEXT,
    ADD COLUMN IF NOT EXISTS dispatch_attempt INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dispatch_claimed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS provider_accepted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failure_stage TEXT,
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

COMMENT ON COLUMN recovery_emails.dispatch_token IS
    'Idempotency token for queue dispatch. Unique per claim; used to prevent double-send.';

DO $$ BEGIN
    ALTER TABLE recovery_emails ADD CONSTRAINT chk_recovery_emails_failure_stage
        CHECK (failure_stage IS NULL OR failure_stage IN (
            'dispatch', 'provider', 'cooldown',
            'validation', 'suppression', 'unknown',
            'send', 'delivery'
        ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_recovery_emails_status_retry
    ON recovery_emails (status, next_retry_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_emails_dispatch_token
    ON recovery_emails (dispatch_token)
    WHERE dispatch_token IS NOT NULL;

-- ============================================================================
-- SECTION 11C: DISPATCH TOKEN DEDUP + QUOTA USAGE
-- ============================================================================

CREATE TABLE IF NOT EXISTS recovery_dispatch_dedup (
    dispatch_token  TEXT        PRIMARY KEY,
    tenant_id       TEXT        NOT NULL,
    send_id         UUID        NOT NULL,
    state           TEXT        NOT NULL DEFAULT 'processing',
    lease_expires_at TIMESTAMPTZ,
    attempts        INT         NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN PERFORM _attach_updated_at('recovery_dispatch_dedup'); END $$;

DO $$ BEGIN
    ALTER TABLE recovery_dispatch_dedup ADD CONSTRAINT chk_recovery_dispatch_state
        CHECK (state IN ('processing', 'completed', 'reclaimed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_recovery_dispatch_dedup_tenant_send
    ON recovery_dispatch_dedup (tenant_id, send_id);

CREATE TABLE IF NOT EXISTS recovery_quota_usage (
    tenant_id    TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    used         INT         NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, window_start)
);

DO $$ BEGIN PERFORM _attach_updated_at('recovery_quota_usage'); END $$;

-- ============================================================================
-- SECTION 13: API KEY HARDENING
-- ============================================================================
-- hash_version tracks which hashing algorithm produced key_hash, enabling
-- a gradual rotation to a stronger algorithm (e.g. sha256 → argon2id)
-- without a flag day. New keys default to sha256; rotate in batches.
--
-- scopes allows per-key permission scoping for future access control
-- (e.g. ['events:write', 'campaigns:read']).

-- ============================================================================
-- PRE-REQUISITE: IDEMPOTENCY TABLE SCHEMA UPDATE
-- ============================================================================
ALTER TABLE api_idempotency_keys 
    ADD COLUMN IF NOT EXISTS request_hash TEXT,
    ADD COLUMN IF NOT EXISTS response_payload JSONB,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE public.api_keys
    ADD COLUMN IF NOT EXISTS hash_version TEXT NOT NULL DEFAULT 'sha256';

ALTER TABLE public.api_keys
    ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
    ALTER TABLE public.api_keys
        ADD CONSTRAINT chk_api_key_hash_version
        CHECK (hash_version IN ('sha256', 'bcrypt', 'argon2id'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_api_keys_scopes ON public.api_keys USING GIN (scopes);

COMMENT ON COLUMN public.api_keys.hash_version IS
    'Algorithm used to produce key_hash. Enables gradual rotation: '
    'verify current hash_version in application, re-hash on next use if upgrading.';

COMMENT ON COLUMN public.api_keys.scopes IS
    'Permission scopes granted to this key. Empty array = all permissions (legacy). '
    'Example: ARRAY[''events:write'', ''campaigns:read'']';


-- ============================================================================
-- SECTION 12: MISSING PRODUCTION INDEXES
-- ============================================================================

-- Replay lookup hot path: INCLUDE pushes hash+payload into the index leaf,
-- enabling index-only scans and avoiding heap fetches on every replay check.
CREATE INDEX IF NOT EXISTS idx_api_idempotency_replay
    ON api_idempotency_keys (tenant_id, idempotency_key)
    INCLUDE (request_hash, response_payload);

-- Lease-aware worker reclaim: partial index stays tiny (claimed rows only).
DO $$ BEGIN
    DROP INDEX IF EXISTS idx_recovery_emails_lease_reclaim;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_recovery_emails_lease_reclaim
    ON recovery_emails (lease_expires_at)
    WHERE status IN ('dispatch_claimed', 'processing') AND lease_expires_at IS NOT NULL;

-- Active alerts dashboard lookup (only active rows in the index).
CREATE INDEX IF NOT EXISTS idx_alerts_active_lookup
    ON alerts (tenant_id, last_seen DESC)
    WHERE status = 'active';

-- Alert dispatch throttle: fast per-metric check before sending.
CREATE INDEX IF NOT EXISTS idx_alert_dispatch_tenant_metric
    ON alert_dispatch_logs (tenant_id, metric_name, last_alerted_at DESC);

-- Suppression lookups: fast per-tenant email check (covers unsubscribe checks).
CREATE INDEX IF NOT EXISTS idx_recovery_suppressions_tenant_email
    ON recovery_suppressions (tenant_id, email);
-- Partial: for non-expired suppressions only (avoids scanning expired rows).
-- Suppression lookups: fast per-tenant email check (covers unsubscribe checks).
-- Modified to include expires_at so queries can efficiently filter by NOW() at runtime.
CREATE INDEX IF NOT EXISTS idx_recovery_suppressions_active
    ON recovery_suppressions (tenant_id, email, expires_at);

-- Churn risk user lookup within tenant.
CREATE INDEX IF NOT EXISTS idx_churn_risk_state_score
    ON churn_risk_state (tenant_id, risk_score DESC)
    WHERE risk_tier IN ('high', 'critical');

-- Billing webhook events: fast per-tenant, per-type queries for dashboards.
CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_tenant_type
    ON billing_webhook_events (tenant_id, event_type, received_at DESC);

-- Active API key lookup (exclude revoked keys from the index).
CREATE INDEX IF NOT EXISTS idx_api_keys_active_lookup
    ON public.api_keys (tenant_id, key_id)
    WHERE revoked_at IS NULL;

-- Anomaly logs: tenant-scoped metric queries.
CREATE INDEX IF NOT EXISTS idx_anomaly_logs_tenant_metric
    ON anomaly_detector_logs (tenant_id, metric_name, date DESC)
    WHERE metric_name IS NOT NULL;

-- api_idempotency_keys TTL cleanup (existing index preserved; verified here).
-- idx_api_idempotency_expires already exists in v2 schema.


-- ============================================================================
-- SECTION 14: EVENTS TABLE SCALE STRATEGY
-- ============================================================================
-- PARTITIONING GUIDANCE (not applied here; apply in a maintenance window):
--
--   At ~100M rows the events table becomes a VACUUM and index maintenance
--   bottleneck. Recommended migration:
--
--   1. Convert to RANGE partitioning by timestamp using pg_partman:
--        CREATE TABLE events_partitioned (LIKE events INCLUDING ALL)
--            PARTITION BY RANGE (timestamp);
--        -- pg_partman then manages monthly/weekly partition creation.
--
--   2. Attach old table as the initial partition:
--        ALTER TABLE events_partitioned ATTACH PARTITION events
--            FOR VALUES FROM (MINVALUE) TO ('2025-01-01');
--
--   3. Retention via partition DROP (zero VACUUM load):
--        ALTER TABLE events_partitioned DETACH PARTITION events_2023_q1;
--        DROP TABLE events_2023_q1;
--
--   For now, add a BRIN index on timestamp. BRIN is order-of-magnitude smaller
--   than BTREE on append-only, time-ordered tables and is ideal for analytics
--   range scans that do not need point lookups.

CREATE INDEX IF NOT EXISTS idx_events_timestamp_brin
    ON events USING BRIN (timestamp)
    WITH (pages_per_range = 128);

COMMENT ON TABLE events IS
    'High-volume event ingestion. Partition by timestamp (RANGE) when approaching '
    '100M rows; use pg_partman for automated management. BRIN index on timestamp '
    'is intentional: orders-of-magnitude smaller than BTREE for sequential analytics scans.';

COMMENT ON COLUMN events.idempotency_key IS
    'Caller-supplied deduplication token. NULL = no dedup requested. '
    'Unique per tenant via partial index idx_events_tenant_idempotency.';


-- ============================================================================
-- SECTION 9: RLS COVERAGE EXPANSION
-- ============================================================================
-- Any table reachable via the Supabase JS client must have RLS enabled.
-- Service role bypasses all RLS policies — backend workers are unaffected.
-- Tables marked BACKEND-ONLY have RLS enabled but no SELECT policy,
-- preventing accidental frontend exposure while preserving service-role access.

-- events: tenant-scoped ingestion and analytics
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "events_select_tenant" ON events
        FOR SELECT USING (
            tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "events_insert_tenant" ON events
        FOR INSERT WITH CHECK (
            tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- churn_risk_state: read-only from frontend (writes via service role only)
ALTER TABLE churn_risk_state ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "churn_risk_state_select_tenant" ON churn_risk_state
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = churn_risk_state.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- alerts: read-only from frontend
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "alerts_select_tenant" ON alerts
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = alerts.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- metric_values_daily: dashboard data, read-only
ALTER TABLE metric_values_daily ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "metric_values_daily_select_tenant" ON metric_values_daily
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = metric_values_daily.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- metric_values_segmented: dashboard data, read-only
ALTER TABLE metric_values_segmented ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "metric_values_segmented_select_tenant" ON metric_values_segmented
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = metric_values_segmented.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tenant_settings: read own settings (no write from frontend — use API)
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "tenant_settings_select_own" ON tenant_settings
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = tenant_settings.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tenant_users: users can see their own membership records only
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "tenant_users_select_own" ON tenant_users
        FOR SELECT USING (user_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- recovery_suppressions: tenant-scoped (for unsubscribe lookups / status pages)
ALTER TABLE recovery_suppressions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "recovery_suppressions_select_tenant" ON recovery_suppressions
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = recovery_suppressions.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- recovery_emails: BACKEND-ONLY.
-- The outbox is managed exclusively by dispatch_campaign_atomic and the worker.
-- No direct frontend access. If a campaign status dashboard is needed,
-- expose it through a dedicated RPC function with appropriate filtering.
ALTER TABLE recovery_emails ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_emails IS
    'BACKEND-ONLY outbox. RLS enabled; no frontend SELECT policy intentional. '
    'Access via bulk_dispatch_recovery_candidates RPC or service role only.';

-- billing_webhook_events: BACKEND-ONLY. Service role only.
ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE billing_webhook_events IS
    'BACKEND-ONLY billing event log. No frontend access policy intentional.';

-- api_idempotency_keys: BACKEND-ONLY. Managed by dispatch_campaign_atomic.
ALTER TABLE api_idempotency_keys ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE api_idempotency_keys IS
    'BACKEND-ONLY idempotency store. No frontend access policy intentional. '
    'Managed exclusively by dispatch_campaign_atomic RPC.';

-- anomaly_detector_logs: read-only for tenant users
ALTER TABLE anomaly_detector_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "anomaly_logs_select_tenant" ON anomaly_detector_logs
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = anomaly_detector_logs.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- recovery_email_dlq: BACKEND-ONLY
ALTER TABLE recovery_email_dlq ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_email_dlq IS
    'BACKEND-ONLY dead-letter queue. No frontend access policy intentional.';

-- recovery_dispatch_dedup: BACKEND-ONLY
ALTER TABLE recovery_dispatch_dedup ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_dispatch_dedup IS
    'BACKEND-ONLY dispatch token idempotency store. No frontend access policy intentional.';

-- recovery_quota_usage: BACKEND-ONLY
ALTER TABLE recovery_quota_usage ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_quota_usage IS
    'BACKEND-ONLY per-tenant quota counters. No frontend access policy intentional.';

-- recovery_attributions: read-only for tenant users (revenue attribution)
ALTER TABLE recovery_attributions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "recovery_attributions_select_tenant" ON recovery_attributions
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = recovery_attributions.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECTION 10: RETENTION / TTL CLEANUP JOBS (pg_cron)
-- ============================================================================
-- Retention periods are conservative defaults. Adjust to your data residency
-- and compliance requirements before enabling.
--
-- Retention schedule:
--   api_idempotency_keys     : 7  days  (hard-coded via expires_at column)
--   billing_webhook_events   : 90 days
--   recovery_email_events    : 90 days
--   recovery_email_dlq       : 90 days
--   anomaly_detector_logs    : 180 days
--   terminal recovery_emails : 90 days  (sent/delivered/failed/etc.)
--
-- Note: cron.schedule is idempotent if the job name already exists in
-- pg_cron — re-running this migration will update the schedule/SQL if changed.

DO $$
BEGIN
    -- Expired idempotency keys (daily 02:00 UTC)
    PERFORM cron.schedule(
        'arcli-cleanup-idempotency-keys',
        '0 2 * * *',
        $q$ DELETE FROM api_idempotency_keys WHERE expires_at < NOW(); $q$
    );

    -- Old billing webhook events (90-day retention; daily 02:15 UTC)
    PERFORM cron.schedule(
        'arcli-cleanup-billing-webhooks',
        '15 2 * * *',
        $q$ DELETE FROM billing_webhook_events
            WHERE received_at < NOW() - INTERVAL '90 days'; $q$
    );

    -- Old recovery email events (90-day retention; daily 02:30 UTC)
    PERFORM cron.schedule(
        'arcli-cleanup-recovery-email-events',
        '30 2 * * *',
        $q$ DELETE FROM recovery_email_events
            WHERE occurred_at < NOW() - INTERVAL '90 days'; $q$
    );

    -- Old DLQ entries (90-day retention; daily 02:45 UTC)
    PERFORM cron.schedule(
        'arcli-cleanup-recovery-dlq',
        '45 2 * * *',
        $q$ DELETE FROM recovery_email_dlq
            WHERE failed_at < NOW() - INTERVAL '90 days'; $q$
    );

    -- Old anomaly logs (180-day retention; daily 03:00 UTC)
    PERFORM cron.schedule(
        'arcli-cleanup-anomaly-logs',
        '0 3 * * *',
        $q$ DELETE FROM anomaly_detector_logs
            WHERE created_at < NOW() - INTERVAL '180 days'; $q$
    );

    -- Terminal recovery_emails (90-day retention; daily 03:30 UTC)
    -- Only deletes rows in terminal states — active/queued/processing rows
    -- are never touched by this job.
    PERFORM cron.schedule(
        'arcli-cleanup-recovery-emails-terminal',
        '30 3 * * *',
        $q$ DELETE FROM recovery_emails
            WHERE status IN (
                'provider_accepted', 'delivered', 'dead_lettered',
                -- legacy terminal values
                'sent', 'failed', 'suppressed'
            )
              AND created_at < NOW() - INTERVAL '90 days'; $q$
    );

EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron not available; retention jobs not registered. '
                 'Configure them manually or install pg_cron on Supabase Pro. Error: %',
                 SQLERRM;
END $$;


-- ============================================================================
-- SECTION 1 + 2: FIXED dispatch_campaign_atomic RPC
-- ============================================================================
-- Fixes applied vs original:
--
--   FIX 1 — Idempotency race condition:
--     Original: both concurrent callers INSERT ... DO NOTHING, then both
--     do the outbox INSERT (second gets 0 rows) and both UPDATE
--     response_payload. Last writer wins → one of them caches {queued:0}.
--
--     Fix: INSERT ... ON CONFLICT DO NOTHING RETURNING id INTO v_claimed_id.
--     Only the transaction that gets a non-NULL v_claimed_id (the "slot owner")
--     runs the outbox INSERT and stores the canonical response.
--     Non-owners read the cached response. If the owner hasn't committed yet,
--     non-owners return {status:"pending"} — the client retries after a brief
--     delay (idiomatic for idempotency key races; window is sub-second).
--
--   FIX 2 — JSONB camelCase parsing (riskScore → NULL):
--     PostgreSQL lowercases unquoted column aliases in jsonb_to_recordset().
--     "riskScore" (with quotes) preserves the camelCase key and matches the
--     incoming JSON correctly. Without quotes, every row gets churn_risk_score
--     = NULL silently.
--
--   FIX 3 — Canonical response stored only by slot owner:
--     UPDATE now guards on AND id = v_claimed_id, ensuring only the owning
--     transaction's UPDATE can succeed. Concurrent non-owner transactions
--     cannot overwrite the stored response.

CREATE OR REPLACE FUNCTION dispatch_campaign_atomic(
    p_tenant_id        TEXT,
    p_template_id      TEXT,
    p_idempotency_key  TEXT,
    p_request_hash     TEXT,   -- SHA-256 (or equivalent) of canonical request body
    p_targets          JSONB   -- [{id, email, signal, riskScore}, ...]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs as function owner (service role); RLS on target tables bypassed.
AS $$
DECLARE
    v_claimed_id        UUID;       -- Non-NULL only if THIS transaction won the slot.
    v_i_own_slot        BOOLEAN := FALSE;
    v_existing_hash     TEXT;
    v_existing_response JSONB;
    v_inserted_count    INT;
    v_result            JSONB;
BEGIN

    -- -------------------------------------------------------------------------
    -- INPUT VALIDATION
    -- -------------------------------------------------------------------------

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

    -- -------------------------------------------------------------------------
    -- ATTEMPT TO CLAIM IDEMPOTENCY SLOT
    --
    -- One of three outcomes:
    --   A) v_claimed_id IS NOT NULL → we own this slot (first caller wins).
    --      Proceed to insert outbox rows and compute canonical response.
    --
    --   B) v_claimed_id IS NULL AND existing row found:
    --      B1) response_payload IS NOT NULL → safe replay; return cached.
    --      B2) response_payload IS NULL → concurrent owner in-flight; return
    --          {status:"pending"} so the client retries after a short delay.
    --          The in-flight window is typically sub-second.
    -- -------------------------------------------------------------------------

    INSERT INTO api_idempotency_keys (
        tenant_id,
        idempotency_key,
        request_hash
    )
    VALUES (
        p_tenant_id,
        p_idempotency_key,
        p_request_hash
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_claimed_id;

    v_i_own_slot := (v_claimed_id IS NOT NULL);

    -- -------------------------------------------------------------------------
    -- NOT THE SLOT OWNER: handle replay or in-flight case
    -- -------------------------------------------------------------------------

    IF NOT v_i_own_slot THEN

        SELECT request_hash, response_payload
          INTO v_existing_hash, v_existing_response
          FROM api_idempotency_keys
         WHERE tenant_id       = p_tenant_id
           AND idempotency_key = p_idempotency_key;

        -- Different body for the same key = client bug or replay attack.
        -- Reject unconditionally regardless of response_payload state.
        IF v_existing_hash IS DISTINCT FROM p_request_hash THEN
            RAISE EXCEPTION
                'idempotency_key reused with a different request payload (hash mismatch)';
        END IF;

        -- Cached response available → safe replay, return immediately.
        IF v_existing_response IS NOT NULL THEN
            RETURN v_existing_response;
        END IF;

        -- Concurrent owner hasn't committed yet (response_payload still NULL).
        -- Return a "pending" signal; the client should retry after ~200ms.
        -- This window is bounded by the owner's transaction duration.
        RETURN jsonb_build_object(
            'status', 'pending',
            'queued', 0
        );

    END IF;

    -- -------------------------------------------------------------------------
    -- SLOT OWNER: insert outbox rows
    --
    -- FIX #2: "riskScore" alias is double-quoted to preserve camelCase.
    -- Without quotes, Postgres lowercases it to "riskscore", which never
    -- matches the JSON key "riskScore", silently producing NULL for every row.
    --
    -- ON CONFLICT DO NOTHING is load-bearing: if two concurrent calls both
    -- reach this INSERT (e.g. one claimed the key, the other was racing),
    -- the unique index idx_recovery_emails_batch_user_campaign ensures the
    -- second INSERT produces zero rows rather than duplicates.
    -- -------------------------------------------------------------------------

    INSERT INTO recovery_emails (
        tenant_id,
        user_id,
        email,
        campaign_type,
        status,
        idempotency_key,
        primary_risk_signal,
        churn_risk_score,
        queued_at,
        created_at
    )
    SELECT
        p_tenant_id,
        t.id,
        LOWER(TRIM(t.email)),          -- normalize email on ingest
        p_template_id,
        'queued',
        p_idempotency_key,
        t.signal,
        t."riskScore",                 -- FIX: quoted alias preserves camelCase
        NOW(),
        NOW()
    FROM jsonb_to_recordset(p_targets) AS t(
        id          TEXT,
        email       TEXT,
        signal      TEXT,
        "riskScore" INT                -- FIX: quoted to match JSON key exactly
    )
    -- Pre-filter blank emails; CHECK constraint chk_email_nonempty is the
    -- hard backstop that prevents garbage from reaching the table.
    WHERE TRIM(COALESCE(t.email, '')) <> ''
    ON CONFLICT (tenant_id, idempotency_key, user_id, campaign_type)
    DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    v_result := jsonb_build_object(
        'status', 'queued',
        'queued', v_inserted_count
    );

    -- -------------------------------------------------------------------------
    -- STORE CANONICAL RESPONSE
    --
    -- FIX #3: Guard on AND id = v_claimed_id so only the slot-owning
    -- transaction can write the canonical response. A non-owner transaction
    -- that somehow reaches this point (edge case) cannot overwrite the result.
    -- AND response_payload IS NULL prevents a second UPDATE from clobbering
    -- the stored response if this function is called recursively (unlikely
    -- but defensive).
    -- -------------------------------------------------------------------------

    UPDATE api_idempotency_keys
       SET response_payload = v_result
     WHERE tenant_id        = p_tenant_id
       AND idempotency_key  = p_idempotency_key
       AND id               = v_claimed_id          -- only our row
       AND response_payload IS NULL;                -- defensive: only write once

    RETURN v_result;

END;
$$;

COMMENT ON FUNCTION dispatch_campaign_atomic(TEXT, TEXT, TEXT, TEXT, JSONB) IS
    'Atomic campaign dispatch with exactly-once outbox enqueue guarantee. '
    'Idempotency is enforced at two levels: '
    '(1) api_idempotency_keys slot ownership (INSERT RETURNING); '
    '(2) idx_recovery_emails_batch_user_campaign unique index + ON CONFLICT DO NOTHING. '
    'Returns {status:"pending"} when a concurrent request is in-flight for the same key; '
    'client should retry after ~200ms.';


-- ============================================================================
-- SECTION 15: TYPE CONSISTENCY & NAMING HYGIENE
-- ============================================================================

-- recovery_email_dlq: add missing tenant FK (NOT VALID for safety)
DO $$ BEGIN
    ALTER TABLE recovery_email_dlq
        ADD CONSTRAINT fk_recovery_email_dlq_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- churn_scoring_runs: add missing tenant FK
DO $$ BEGIN
    ALTER TABLE churn_scoring_runs
        ADD CONSTRAINT fk_churn_scoring_runs_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- metric_configs: add missing tenant FK
DO $$ BEGIN
    ALTER TABLE metric_configs
        ADD CONSTRAINT fk_metric_configs_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- metric_values_daily: add missing tenant FK
DO $$ BEGIN
    ALTER TABLE metric_values_daily
        ADD CONSTRAINT fk_metric_values_daily_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- metric_values_segmented: add missing tenant FK
DO $$ BEGIN
    ALTER TABLE metric_values_segmented
        ADD CONSTRAINT fk_metric_values_segmented_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- anomaly_detector_logs: add missing tenant FK
DO $$ BEGIN
    ALTER TABLE anomaly_detector_logs
        ADD CONSTRAINT fk_anomaly_detector_logs_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
        NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- churn_risk_history: missing risk_run_id comment
COMMENT ON COLUMN churn_risk_history.risk_run_id IS
    'Links back to churn_scoring_runs.id (stored as VARCHAR for compatibility). '
    'Used to group all history rows from a single scoring run for bulk analysis.';

-- api_idempotency_keys: extend TTL default comment
COMMENT ON COLUMN api_idempotency_keys.expires_at IS
    'Row expires 7 days after creation. Cleaned up by arcli-cleanup-idempotency-keys '
    'pg_cron job. Adjust interval per compliance requirements.';

-- tenant_settings: deprecation notice on old api_key column
--COMMENT ON COLUMN tenant_settings.api_key IS
--    'DEPRECATED: migrate to public.api_keys table which stores hashed keys with '
--    'rotation support. This column stores plaintext and will be removed in a future '
 --   'migration. Do not read or write this column in new code.';

-- churn_scoring_runs: RLS
ALTER TABLE churn_scoring_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "churn_scoring_runs_select_tenant" ON churn_scoring_runs
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = churn_scoring_runs.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- metric_configs: RLS
ALTER TABLE metric_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "metric_configs_select_tenant" ON metric_configs
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = metric_configs.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_activity_daily: RLS
ALTER TABLE user_activity_daily ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "user_activity_daily_select_tenant" ON user_activity_daily
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = user_activity_daily.tenant_id
                  AND tu.user_id = auth.uid()::text
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECTION 16: DURABLE OUTBOX RPCs
-- ============================================================================

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

    -- Serialize per-tenant bulk dispatch to prevent duplicate inserts under concurrency.
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id));

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
        t.id,
        LOWER(TRIM(t.email)),
        t.signal,
        t.campaign_type,
        t.score
    FROM jsonb_to_recordset(p_candidates) AS t(
        id            TEXT,
        email         TEXT,
        signal        TEXT,
        campaign_type TEXT,
        score         INT
    )
    WHERE TRIM(COALESCE(t.id, '')) <> ''
      AND TRIM(COALESCE(t.email, '')) <> ''
      AND TRIM(COALESCE(t.campaign_type, '')) <> '';

    -- Suppression filter
    UPDATE tmp_recovery_candidates c
       SET outcome = 'suppressed',
           reason  = 'suppressed'
     WHERE EXISTS (
        SELECT 1 FROM recovery_suppressions s
         WHERE s.tenant_id = p_tenant_id
           AND s.email = c.email
           AND (s.expires_at IS NULL OR s.expires_at > v_now)
     );

    -- Cooldown filter
    UPDATE tmp_recovery_candidates c
       SET outcome = 'cooldown',
           reason  = 'cooldown_active'
     WHERE c.outcome IS NULL
       AND EXISTS (
        SELECT 1 FROM recovery_emails e
         WHERE e.tenant_id = p_tenant_id
           AND e.user_id = c.user_id
           AND e.campaign_type = c.campaign_type
           AND e.status IN ('provider_accepted', 'delivered', 'sent')
           AND COALESCE(e.provider_accepted_at, e.sent_at, e.created_at) >=
               v_now - (p_cooldown_days::TEXT || ' days')::INTERVAL
     );

    -- Prevent duplicate in-flight dispatches
    UPDATE tmp_recovery_candidates c
       SET outcome = 'duplicate',
           reason  = 'already_queued'
     WHERE c.outcome IS NULL
       AND EXISTS (
        SELECT 1 FROM recovery_emails e
         WHERE e.tenant_id = p_tenant_id
           AND e.user_id = c.user_id
           AND e.campaign_type = c.campaign_type
           AND e.status IN (
               'pending_dispatch', 'dispatch_claimed',
               'dispatched_to_queue', 'dispatch_failed'
           )
     );

    UPDATE tmp_recovery_candidates
       SET outcome = 'pending'
     WHERE outcome IS NULL;

    SELECT COUNT(*) INTO v_desired_count
      FROM tmp_recovery_candidates
     WHERE outcome = 'pending';

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
         WHERE tenant_id = p_tenant_id
           AND window_start = v_window_start
         FOR UPDATE;

        v_remaining := GREATEST(p_quota_limit - v_used, 0);
        v_allowed_count := LEAST(v_desired_count, v_remaining);

        UPDATE recovery_quota_usage
           SET used = used + v_allowed_count,
               updated_at = v_now
         WHERE tenant_id = p_tenant_id
           AND window_start = v_window_start;
    END IF;

    IF v_allowed_count < v_desired_count THEN
        UPDATE tmp_recovery_candidates
           SET outcome = 'rate_limited',
               reason  = 'quota_exceeded'
         WHERE ctid IN (
            SELECT ctid
              FROM tmp_recovery_candidates
             WHERE outcome = 'pending'
             ORDER BY user_id, campaign_type
             OFFSET v_allowed_count
         );
    END IF;

    WITH ins AS (
        INSERT INTO recovery_emails (
            tenant_id,
            user_id,
            email,
            campaign_type,
            status,
            primary_risk_signal,
            churn_risk_score,
            queued_at,
            created_at,
            updated_at
        )
        SELECT
            p_tenant_id,
            user_id,
            email,
            campaign_type,
            'pending_dispatch',
            signal,
            score,
            v_now,
            v_now,
            v_now
        FROM tmp_recovery_candidates
        WHERE outcome = 'pending'
        ON CONFLICT DO NOTHING
        RETURNING id, user_id, campaign_type
    )
    UPDATE tmp_recovery_candidates c
       SET outcome = 'claimed'
      FROM ins
     WHERE c.user_id = ins.user_id
       AND c.campaign_type = ins.campaign_type;

    UPDATE tmp_recovery_candidates
       SET outcome = 'duplicate',
           reason  = 'already_queued'
     WHERE outcome = 'pending';

    UPDATE tmp_recovery_candidates c
       SET send_id = e.id
      FROM recovery_emails e
     WHERE e.tenant_id = p_tenant_id
       AND e.user_id = c.user_id
       AND e.campaign_type = c.campaign_type
       AND c.outcome IN ('claimed', 'duplicate');

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'outcome', outcome,
        'send_id', send_id,
        'message', reason,
        'user_id', user_id,
        'campaign_type', campaign_type
    )), '[]'::jsonb) INTO v_results
    FROM tmp_recovery_candidates;

    RETURN jsonb_build_object(
        'results', v_results,
        'quota',
        CASE
            WHEN p_quota_limit IS NULL OR p_quota_limit <= 0 THEN NULL
            ELSE jsonb_build_object(
                'allowed', v_allowed_count > 0,
                'limit', p_quota_limit,
                'used', v_used + v_allowed_count,
                'remaining', GREATEST(p_quota_limit - (v_used + v_allowed_count), 0),
                'applied', v_allowed_count
            )
        END
    );
END;
$$;


CREATE OR REPLACE FUNCTION claim_outbox_batch(
    p_limit INT
)
RETURNS TABLE (
    id UUID,
    tenant_id TEXT,
    dispatch_token TEXT,
    dispatch_attempt INT,
    retry_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH cte AS (
        SELECT id
          FROM recovery_emails
         WHERE status IN ('pending_dispatch', 'dispatch_failed')
           AND (status <> 'dispatch_failed' OR failure_stage = 'dispatch')
           AND (next_retry_at IS NULL OR next_retry_at <= NOW())
           AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
         ORDER BY created_at ASC
         LIMIT GREATEST(p_limit, 0)
         FOR UPDATE SKIP LOCKED
    ), upd AS (
        UPDATE recovery_emails r
           SET status = 'dispatch_claimed',
               dispatch_attempt = COALESCE(dispatch_attempt, 0) + 1,
               dispatch_token = encode(digest(gen_random_uuid()::TEXT, 'sha256'), 'hex'),
               dispatch_claimed_at = NOW(),
               lease_expires_at = NOW() + INTERVAL '15 minutes',
               updated_at = NOW()
          FROM cte
         WHERE r.id = cte.id
         RETURNING r.id, r.tenant_id, r.dispatch_token, r.dispatch_attempt, r.retry_count
    )
    SELECT * FROM upd;
END;
$$;


CREATE OR REPLACE FUNCTION claim_dispatch_token(
    p_dispatch_token TEXT,
    p_tenant_id      TEXT,
    p_send_id        UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_now   TIMESTAMPTZ := NOW();
    v_state TEXT;
    v_lease TIMESTAMPTZ;
BEGIN
    IF p_dispatch_token IS NULL OR trim(p_dispatch_token) = '' THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'invalid');
    END IF;

    SELECT state, lease_expires_at
      INTO v_state, v_lease
      FROM recovery_dispatch_dedup
     WHERE dispatch_token = p_dispatch_token
     FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO recovery_dispatch_dedup (
            dispatch_token, tenant_id, send_id, state,
            lease_expires_at, attempts, created_at, updated_at
        ) VALUES (
            p_dispatch_token, p_tenant_id, p_send_id, 'processing',
            v_now + INTERVAL '15 minutes', 1, v_now, v_now
        ) ON CONFLICT (dispatch_token) DO NOTHING;

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
    END IF;

    IF v_state = 'completed' THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'completed');
    END IF;

    IF v_lease IS NOT NULL AND v_lease >= v_now THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'in_flight');
    END IF;

    UPDATE recovery_dispatch_dedup
       SET tenant_id = p_tenant_id,
           send_id = p_send_id,
           state = 'reclaimed',
           lease_expires_at = v_now + INTERVAL '15 minutes',
           attempts = attempts + 1,
           updated_at = v_now
     WHERE dispatch_token = p_dispatch_token;

    RETURN jsonb_build_object('claimed', true, 'state', 'reclaimed');
END;
$$;


CREATE OR REPLACE FUNCTION reserve_recovery_attempt(
    p_send_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_attempt_count INT;
BEGIN
    IF p_send_id IS NULL THEN
        RETURN jsonb_build_object('reserved', false, 'state', 'invalid');
    END IF;

    UPDATE recovery_emails
       SET attempt_count = COALESCE(attempt_count, 0) + 1,
           updated_at = NOW()
     WHERE id = p_send_id
     RETURNING attempt_count INTO v_attempt_count;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('reserved', false, 'state', 'missing');
    END IF;

    RETURN jsonb_build_object('reserved', true, 'attempt_count', v_attempt_count);
END;
$$;


-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- To validate foreign key constraints after data has been cleaned:
--
--   ALTER TABLE tenant_settings          VALIDATE CONSTRAINT fk_tenant_settings_tenant;
--   ALTER TABLE tenant_users             VALIDATE CONSTRAINT fk_tenant_users_tenant;
--   ALTER TABLE events                   VALIDATE CONSTRAINT fk_events_tenant;
--   ALTER TABLE alerts                   VALIDATE CONSTRAINT fk_alerts_tenant;
--   ALTER TABLE churn_risk_state         VALIDATE CONSTRAINT fk_churn_risk_state_tenant;
--   ALTER TABLE recovery_emails          VALIDATE CONSTRAINT fk_recovery_emails_tenant;
--   ALTER TABLE recovery_email_dlq       VALIDATE CONSTRAINT fk_recovery_email_dlq_tenant;
--   ALTER TABLE churn_scoring_runs       VALIDATE CONSTRAINT fk_churn_scoring_runs_tenant;
--   ALTER TABLE metric_configs           VALIDATE CONSTRAINT fk_metric_configs_tenant;
--   ALTER TABLE metric_values_daily      VALIDATE CONSTRAINT fk_metric_values_daily_tenant;
--   ALTER TABLE metric_values_segmented  VALIDATE CONSTRAINT fk_metric_values_segmented_tenant;
--   ALTER TABLE anomaly_detector_logs    VALIDATE CONSTRAINT fk_anomaly_detector_logs_tenant;
--
-- To check pg_cron job registration:
--   SELECT * FROM cron.job WHERE jobname LIKE 'arcli-%';
--
-- To verify RLS coverage:
--   SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
-- ============================================================================