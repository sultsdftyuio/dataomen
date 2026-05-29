-- ============================================================================
-- ARCLI CORE SCHEMA — PART 3: SECURITY & RLS + RETENTION JOBS (v3.1)
-- ============================================================================
-- Run AFTER Part 2 (Outbox & Indexes).
-- Covers: Row Level Security policies for all tables, API key hardening,
--         pg_cron retention/TTL cleanup jobs.
--
-- SAFE TO RUN MULTIPLE TIMES: all DDL uses IF NOT EXISTS / OR REPLACE /
-- DO...EXCEPTION blocks. No destructive rewrites.
--
-- v3.1 CHANGES:
--   • events RLS now uses tenant_users join (consistent with all other tables).
--   • pg_cron jobs use DELETE+SCHEDULE for true idempotence.
--   • All auth.uid() comparisons remain UUID-native (no ::text cast).
-- ============================================================================

-- ============================================================================
-- SECTION 13: API KEY HARDENING
-- ============================================================================
-- hash_version tracks which hashing algorithm produced key_hash, enabling
-- a gradual rotation to a stronger algorithm (e.g. sha256 → argon2id)
-- without a flag day. New keys default to sha256; rotate in batches.
--
-- scopes allows per-key permission scoping for future access control
-- (e.g. ['events:write', 'campaigns:read']).

-- Guarantees at most one active (un-revoked) key per tenant at the database level.
-- Any race that slips past the app code is caught here as error code 23505.
CREATE UNIQUE INDEX IF NOT EXISTS uix_api_keys_tenant_active
  ON public.api_keys (tenant_id)
  WHERE revoked_at IS NULL;

-- Hash algorithm whitelist.
DO $$ BEGIN
    ALTER TABLE public.api_keys
        ADD CONSTRAINT chk_api_key_hash_version
        CHECK (hash_version IN ('sha256', 'bcrypt', 'argon2id'))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fast scope lookups.
CREATE INDEX IF NOT EXISTS idx_api_keys_scopes ON public.api_keys USING GIN (scopes);

COMMENT ON COLUMN public.api_keys.hash_version IS
    'Algorithm used to produce key_hash. Enables gradual rotation: '
    'verify current hash_version in application, re-hash on next use if upgrading.';

COMMENT ON COLUMN public.api_keys.scopes IS
    'Permission scopes granted to this key. Empty array = all permissions (legacy). '
    'Example: ARRAY[''events:write'', ''campaigns:read'']';

-- Index for the idempotency TTL cleanup job (Section 10).
CREATE INDEX IF NOT EXISTS idx_api_idempotency_expires
    ON api_idempotency_keys (expires_at);


-- ============================================================================
-- SECTION 9: RLS COVERAGE EXPANSION
-- ============================================================================
-- Any table reachable via the Supabase JS client must have RLS enabled.
-- Service role bypasses all RLS policies — backend workers are unaffected.
-- Tables marked BACKEND-ONLY have RLS enabled but no SELECT policy,
-- preventing accidental frontend exposure while preserving service-role access.
--
-- ALL policies use the tenant_users join model for consistent trust semantics.
-- auth.uid() returns UUID; tenant_users.user_id is UUID. No casts.

-- -------------------------------------------------------------------------
-- TENANT & USER TABLES
-- -------------------------------------------------------------------------

-- tenants: users can read their own tenant row.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "tenants_select_own" ON tenants
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = tenants.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tenant_settings: read own settings (no write from frontend — use API)
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "tenant_settings_select_own" ON tenant_settings
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = tenant_settings.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tenant_users: users can see their own membership records only
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "tenant_users_select_own" ON tenant_users
        FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tenant_billing: BACKEND-ONLY. Service role only.
ALTER TABLE tenant_billing ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE tenant_billing IS
    'BACKEND-ONLY billing data. No frontend access policy intentional.';

-- -------------------------------------------------------------------------
-- EVENTS & ANALYTICS (CONSISTENT TENANT_USERS MODEL)
-- -------------------------------------------------------------------------

-- events: tenant-scoped ingestion and analytics.
-- v3.1 FIX: Uses tenant_users join instead of JWT app_metadata claim.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "events_select_tenant" ON events
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = events.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "events_insert_tenant" ON events
        FOR INSERT WITH CHECK (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- churn_risk_state: read-only from frontend (writes via service role only)
ALTER TABLE churn_risk_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_risk_state FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "churn_risk_state_select_tenant" ON churn_risk_state
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = churn_risk_state.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- churn_risk_history: historical scoring runs visible to tenant users
ALTER TABLE churn_risk_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_risk_history FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "churn_risk_history_select_tenant" ON churn_risk_history
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = churn_risk_history.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- alerts: read-only from frontend
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "alerts_select_tenant" ON alerts
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = alerts.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- metric_values_daily: dashboard data, read-only
ALTER TABLE metric_values_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_values_daily FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "metric_values_daily_select_tenant" ON metric_values_daily
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = metric_values_daily.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- metric_values_segmented: dashboard data, read-only
ALTER TABLE metric_values_segmented ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_values_segmented FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "metric_values_segmented_select_tenant" ON metric_values_segmented
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = metric_values_segmented.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- anomaly_detector_logs: read-only for tenant users
ALTER TABLE anomaly_detector_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_detector_logs FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "anomaly_logs_select_tenant" ON anomaly_detector_logs
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = anomaly_detector_logs.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- churn_scoring_runs: read-only for tenant users
ALTER TABLE churn_scoring_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_scoring_runs FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "churn_scoring_runs_select_tenant" ON churn_scoring_runs
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = churn_scoring_runs.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- metric_configs: read-only for tenant users
ALTER TABLE metric_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_configs FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "metric_configs_select_tenant" ON metric_configs
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = metric_configs.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_activity_daily: read-only for tenant users
ALTER TABLE user_activity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_daily FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "user_activity_daily_select_tenant" ON user_activity_daily
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = user_activity_daily.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- alert_dispatch_logs: read-only for tenant users
ALTER TABLE alert_dispatch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_dispatch_logs FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "alert_dispatch_logs_select_tenant" ON alert_dispatch_logs
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = alert_dispatch_logs.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------------------------
-- RECOVERY & OUTBOX (BACKEND-ONLY)
-- -------------------------------------------------------------------------

-- recovery_emails: BACKEND-ONLY outbox.
ALTER TABLE recovery_emails ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_emails IS
    'BACKEND-ONLY outbox. RLS enabled; no frontend SELECT policy intentional. '
    'Access via bulk_dispatch_recovery_candidates RPC or service role only.';

-- recovery_suppressions: tenant-scoped (for unsubscribe lookups / status pages)
ALTER TABLE recovery_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_suppressions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "recovery_suppressions_select_tenant" ON recovery_suppressions
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = recovery_suppressions.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- recovery_attributions: read-only for tenant users (revenue attribution)
ALTER TABLE recovery_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_attributions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "recovery_attributions_select_tenant" ON recovery_attributions
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM tenant_users tu
                WHERE tu.tenant_id = recovery_attributions.tenant_id
                  AND tu.user_id = auth.uid()
            )
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- recovery_email_dlq: BACKEND-ONLY
ALTER TABLE recovery_email_dlq ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_email_dlq IS
    'BACKEND-ONLY dead-letter queue. No frontend access policy intentional.';

-- recovery_email_events: BACKEND-ONLY
ALTER TABLE recovery_email_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_email_events IS
    'BACKEND-ONLY delivery event log. No frontend access policy intentional.';

-- recovery_dispatch_dedup: BACKEND-ONLY
ALTER TABLE recovery_dispatch_dedup ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_dispatch_dedup IS
    'BACKEND-ONLY dispatch token idempotency store. No frontend access policy intentional.';

-- recovery_quota_usage: BACKEND-ONLY
ALTER TABLE recovery_quota_usage ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_quota_usage IS
    'BACKEND-ONLY per-tenant quota counters. No frontend access policy intentional.';

-- -------------------------------------------------------------------------
-- BILLING & API KEYS (BACKEND-ONLY)
-- -------------------------------------------------------------------------

-- billing_webhook_events: BACKEND-ONLY. Service role only.
ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE billing_webhook_events IS
    'BACKEND-ONLY billing event log. No frontend access policy intentional.';

-- api_idempotency_keys: BACKEND-ONLY. Managed by dispatch_campaign_atomic.
ALTER TABLE api_idempotency_keys ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE api_idempotency_keys IS
    'BACKEND-ONLY idempotency store. No frontend access policy intentional. '
    'Managed exclusively by dispatch_campaign_atomic RPC.';

-- api_keys: BACKEND-ONLY. Sensitive credentials; service role only.
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE api_keys IS
    'BACKEND-ONLY API key storage. No frontend access policy intentional. '
    'Managed via service-role RPCs.';


-- ============================================================================
-- SECTION 10: RETENTION / TTL CLEANUP JOBS (pg_cron)
-- ============================================================================
-- Retention periods are conservative defaults. Adjust to your data residency
-- and compliance requirements before enabling.
--
-- IDEMPOTENCY FIX (v3.1): We DELETE FROM cron.job by name before scheduling.
-- This guarantees at most one job instance exists regardless of deploy history.
-- If pg_cron is unavailable, the outer exception block catches it gracefully.
-- ============================================================================

DO $$
BEGIN
    -- Expired idempotency keys (daily 02:00 UTC)
    DELETE FROM cron.job WHERE jobname = 'arcli-cleanup-idempotency-keys';
    PERFORM cron.schedule(
        'arcli-cleanup-idempotency-keys',
        '0 2 * * *',
        $q$ DELETE FROM api_idempotency_keys WHERE expires_at < NOW(); $q$
    );

    -- Old billing webhook events (90-day retention; daily 02:15 UTC)
    DELETE FROM cron.job WHERE jobname = 'arcli-cleanup-billing-webhooks';
    PERFORM cron.schedule(
        'arcli-cleanup-billing-webhooks',
        '15 2 * * *',
        $q$ DELETE FROM billing_webhook_events
            WHERE received_at < NOW() - INTERVAL '90 days'; $q$
    );

    -- Old recovery email events (90-day retention; daily 02:30 UTC)
    DELETE FROM cron.job WHERE jobname = 'arcli-cleanup-recovery-email-events';
    PERFORM cron.schedule(
        'arcli-cleanup-recovery-email-events',
        '30 2 * * *',
        $q$ DELETE FROM recovery_email_events
            WHERE occurred_at < NOW() - INTERVAL '90 days'; $q$
    );

    -- Old DLQ entries (90-day retention; daily 02:45 UTC)
    DELETE FROM cron.job WHERE jobname = 'arcli-cleanup-recovery-dlq';
    PERFORM cron.schedule(
        'arcli-cleanup-recovery-dlq',
        '45 2 * * *',
        $q$ DELETE FROM recovery_email_dlq
            WHERE failed_at < NOW() - INTERVAL '90 days'; $q$
    );

    -- Old anomaly logs (180-day retention; daily 03:00 UTC)
    DELETE FROM cron.job WHERE jobname = 'arcli-cleanup-anomaly-logs';
    PERFORM cron.schedule(
        'arcli-cleanup-anomaly-logs',
        '0 3 * * *',
        $q$ DELETE FROM anomaly_detector_logs
            WHERE created_at < NOW() - INTERVAL '180 days'; $q$
    );

    -- Terminal recovery_emails (90-day retention; daily 03:30 UTC)
    -- Only deletes rows in terminal states — active/queued/processing rows
    -- are never touched by this job.
    DELETE FROM cron.job WHERE jobname = 'arcli-cleanup-recovery-emails-terminal';
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
-- END OF PART 3 — SECURITY & RLS + RETENTION JOBS
-- ============================================================================
-- Post-deploy checklist:
--   1. Validate FKs during low traffic:
--      ALTER TABLE <table> VALIDATE CONSTRAINT <fk_name>;
--   2. Validate CHECK constraints from Parts 1 & 2:
--      ALTER TABLE alerts VALIDATE CONSTRAINT chk_alerts_status;
--      ALTER TABLE recovery_emails VALIDATE CONSTRAINT chk_recovery_emails_status;
--      ...
--   3. Verify RLS:
--      SELECT schemaname, tablename, rowsecurity
--      FROM pg_tables WHERE schemaname = 'public';
--   4. Verify cron jobs:
--      SELECT * FROM cron.job WHERE jobname LIKE 'arcli-%';
-- ============================================================================