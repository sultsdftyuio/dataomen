-- ============================================================================
-- ARCLI CORE SCHEMA — PART 3: SECURITY & RLS + RETENTION JOBS (v3.5)
-- ============================================================================
-- Run AFTER Part 2 (Outbox & Indexes).
-- Covers: Row Level Security policies for all tables, API key hardening,
--         pg_cron retention/TTL cleanup jobs.
--
-- SAFE TO RUN MULTIPLE TIMES: Policy DDL uses DROP POLICY IF EXISTS followed
-- by CREATE POLICY. This guarantees policies are always upgraded to the latest 
-- version without throwing errors and without destroying any table data.
--
-- v3.5 CHANGES:
--   • RLS Upsert Pattern: Replaced DO/EXCEPTION blocks with DROP/CREATE to 
--     prevent silent schema drift and guarantee policy updates.
--   • Type-Safe Identity: All auth.uid() and user_id comparisons are strictly
--     cast to ::text to prevent silent RLS failures on legacy databases.
-- ============================================================================

-- ============================================================================
-- SECTION 13: API KEY HARDENING
-- ============================================================================

-- Guarantees at most one active (un-revoked) key per tenant at the database level.
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
-- Explicit ::text casting guarantees safety against legacy UUID/TEXT schema drift.

-- -------------------------------------------------------------------------
-- TENANT & USER TABLES
-- -------------------------------------------------------------------------

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenants_select_own" ON tenants;
CREATE POLICY "tenants_select_own" ON tenants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = tenants.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "tenants_update_own" ON tenants;
CREATE POLICY "tenants_update_own" ON tenants
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = tenants.tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND tu.role = 'owner'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = tenants.tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND tu.role = 'owner'
        )
    );

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_settings_select_own" ON tenant_settings;
CREATE POLICY "tenant_settings_select_own" ON tenant_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = tenant_settings.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "tenant_settings_update_own" ON tenant_settings;
CREATE POLICY "tenant_settings_update_own" ON tenant_settings
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = tenant_settings.tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND tu.role = 'owner'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = tenant_settings.tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND tu.role = 'owner'
        )
    );

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_users_select_own" ON tenant_users;
CREATE POLICY "tenant_users_select_own" ON tenant_users
    FOR SELECT USING (user_id::text = auth.uid()::text);

-- tenant_billing: BACKEND-ONLY. Service role only.
ALTER TABLE tenant_billing ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE tenant_billing IS
    'BACKEND-ONLY billing data. No frontend access policy intentional.';

-- -------------------------------------------------------------------------
-- EVENTS & ANALYTICS (CONSISTENT TENANT_USERS MODEL)
-- -------------------------------------------------------------------------

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select_tenant" ON events;
CREATE POLICY "events_select_tenant" ON events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = events.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "events_insert_tenant" ON events;
CREATE POLICY "events_insert_tenant" ON events
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE churn_risk_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_risk_state FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "churn_risk_state_select_tenant" ON churn_risk_state;
CREATE POLICY "churn_risk_state_select_tenant" ON churn_risk_state
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = churn_risk_state.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE churn_risk_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_risk_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "churn_risk_history_select_tenant" ON churn_risk_history;
CREATE POLICY "churn_risk_history_select_tenant" ON churn_risk_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = churn_risk_history.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alerts_select_tenant" ON alerts;
CREATE POLICY "alerts_select_tenant" ON alerts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = alerts.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE metric_values_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_values_daily FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metric_values_daily_select_tenant" ON metric_values_daily;
CREATE POLICY "metric_values_daily_select_tenant" ON metric_values_daily
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = metric_values_daily.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE metric_values_segmented ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_values_segmented FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metric_values_segmented_select_tenant" ON metric_values_segmented;
CREATE POLICY "metric_values_segmented_select_tenant" ON metric_values_segmented
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = metric_values_segmented.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE anomaly_detector_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_detector_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anomaly_logs_select_tenant" ON anomaly_detector_logs;
CREATE POLICY "anomaly_logs_select_tenant" ON anomaly_detector_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = anomaly_detector_logs.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE anomaly_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_alerts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anomaly_alerts_select_tenant" ON anomaly_alerts;
CREATE POLICY "anomaly_alerts_select_tenant" ON anomaly_alerts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = anomaly_alerts.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE churn_scoring_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_scoring_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "churn_scoring_runs_select_tenant" ON churn_scoring_runs;
CREATE POLICY "churn_scoring_runs_select_tenant" ON churn_scoring_runs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = churn_scoring_runs.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE metric_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_configs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metric_configs_select_tenant" ON metric_configs;
CREATE POLICY "metric_configs_select_tenant" ON metric_configs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = metric_configs.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "metric_configs_all_own" ON metric_configs;
CREATE POLICY "metric_configs_all_own" ON metric_configs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = metric_configs.tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND tu.role = 'owner'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = metric_configs.tenant_id
              AND tu.user_id::text = auth.uid()::text
              AND tu.role = 'owner'
        )
    );

ALTER TABLE user_activity_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_daily FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_activity_daily_select_tenant" ON user_activity_daily;
CREATE POLICY "user_activity_daily_select_tenant" ON user_activity_daily
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = user_activity_daily.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE alert_dispatch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_dispatch_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_dispatch_logs_select_tenant" ON alert_dispatch_logs;
CREATE POLICY "alert_dispatch_logs_select_tenant" ON alert_dispatch_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = alert_dispatch_logs.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

-- -------------------------------------------------------------------------
-- RECOVERY & OUTBOX (BACKEND-ONLY)
-- -------------------------------------------------------------------------

ALTER TABLE recovery_emails ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_emails IS
    'BACKEND-ONLY outbox. RLS enabled; no frontend SELECT policy intentional. '
    'Access via bulk_dispatch_recovery_candidates RPC or service role only.';

ALTER TABLE recovery_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_suppressions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recovery_suppressions_select_tenant" ON recovery_suppressions;
CREATE POLICY "recovery_suppressions_select_tenant" ON recovery_suppressions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = recovery_suppressions.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

ALTER TABLE recovery_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_attributions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recovery_attributions_select_tenant" ON recovery_attributions;
CREATE POLICY "recovery_attributions_select_tenant" ON recovery_attributions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM tenant_users tu
            WHERE tu.tenant_id = recovery_attributions.tenant_id
              AND tu.user_id::text = auth.uid()::text
        )
    );

-- BACKEND-ONLY TABLES (No frontend access required/allowed)
ALTER TABLE recovery_email_dlq ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_email_dlq IS 'BACKEND-ONLY dead-letter queue.';

ALTER TABLE recovery_email_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_email_events IS 'BACKEND-ONLY delivery event log.';

ALTER TABLE recovery_dispatch_dedup ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_dispatch_dedup IS 'BACKEND-ONLY dispatch token idempotency store.';

ALTER TABLE recovery_quota_usage ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recovery_quota_usage IS 'BACKEND-ONLY per-tenant quota counters.';

ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE billing_webhook_events IS 'BACKEND-ONLY billing event log.';

ALTER TABLE api_idempotency_keys ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE api_idempotency_keys IS 'BACKEND-ONLY idempotency store.';

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE api_keys IS 'BACKEND-ONLY API key storage.';

-- ============================================================================
-- SECTION 9B: REALTIME PUBLICATION (OPTIONAL)
-- ============================================================================

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime
            WITH (publish = 'insert, update, delete');
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime
            SET (publish = 'insert, update, delete');
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE anomaly_alerts;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE churn_risk_state;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECTION 10: RETENTION / TTL CLEANUP JOBS (pg_cron)
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
    DELETE FROM cron.job WHERE jobname = 'arcli-cleanup-recovery-emails-terminal';
    PERFORM cron.schedule(
        'arcli-cleanup-recovery-emails-terminal',
        '30 3 * * *',
        $q$ DELETE FROM recovery_emails
            WHERE status IN (
                'provider_accepted', 'delivered', 'dead_lettered',
                'sent', 'failed', 'suppressed'
            )
              AND created_at < NOW() - INTERVAL '90 days'; $q$
    );

EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron not available; retention jobs not registered. '
                 'Configure them manually or install pg_cron on Supabase Pro. Error: %',
                 SQLERRM;
END $$;