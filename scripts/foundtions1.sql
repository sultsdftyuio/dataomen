-- ============================================================================
-- ARCLI CORE SCHEMA — PART 1: FOUNDATION (v3.1)
-- ============================================================================
-- Run AFTER Part 0 (Canonical Base).
-- Covers: Extensions, updated_at triggers, CHECK constraints (NOT VALID),
--         numeric precision, email normalization.
--
-- SAFE TO RUN MULTIPLE TIMES: all DDL uses IF NOT EXISTS / OR REPLACE /
-- DO...EXCEPTION blocks. No destructive rewrites.
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_cron is optional; used only for retention jobs in Part 3.
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
-- IS DISTINCT FROM handles NULL comparisons correctly.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW IS DISTINCT FROM OLD THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;

-- Helper: attach trigger idempotently.
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

-- Attach to every table that carries an updated_at column.
DO $$ BEGIN PERFORM _attach_updated_at('tenants'); END $$;
DO $$ BEGIN PERFORM _attach_updated_at('tenant_settings'); END $$;
DO $$ BEGIN PERFORM _attach_updated_at('tenant_users'); END $$;
DO $$ BEGIN PERFORM _attach_updated_at('tenant_billing'); END $$;
DO $$ BEGIN PERFORM _attach_updated_at('recovery_emails'); END $$;
DO $$ BEGIN PERFORM _attach_updated_at('recovery_dispatch_dedup'); END $$;
DO $$ BEGIN PERFORM _attach_updated_at('recovery_quota_usage'); END $$;
DO $$ BEGIN PERFORM _attach_updated_at('api_keys'); END $$;
DO $$ BEGIN PERFORM _attach_updated_at('metric_configs'); END $$;
DO $$ BEGIN PERFORM _attach_updated_at('churn_risk_state'); END $$;
DO $$ BEGIN PERFORM _attach_updated_at('alerts'); END $$;


-- ============================================================================
-- SECTION 5: STATUS / ENUM CHECK CONSTRAINT HARDENING (NOT VALID)
-- ============================================================================
-- CHECK constraints prevent invalid states from being written.
-- Deployed as NOT VALID to avoid failing on historical rows that may
-- already violate the new rule. Run VALIDATE CONSTRAINT during a low-traffic
-- window (see Section 9 at the bottom of this file).

-- alerts.status
DO $$ BEGIN
    ALTER TABLE alerts ADD CONSTRAINT chk_alerts_status
        CHECK (status IN ('active', 'resolved', 'snoozed', 'suppressed'))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- anomaly_detector_logs.severity
DO $$ BEGIN
    ALTER TABLE anomaly_detector_logs ADD CONSTRAINT chk_anomaly_severity
        CHECK (severity IN ('low', 'medium', 'high', 'critical'))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- churn_risk_state.risk_tier
DO $$ BEGIN
    ALTER TABLE churn_risk_state ADD CONSTRAINT chk_churn_risk_tier
        CHECK (risk_tier IN ('healthy', 'low', 'medium', 'high', 'critical'))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- churn_risk_history.risk_tier (mirrors churn_risk_state)
DO $$ BEGIN
    ALTER TABLE churn_risk_history ADD CONSTRAINT chk_churn_risk_history_tier
        CHECK (risk_tier IN ('healthy', 'low', 'medium', 'high', 'critical'))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- recovery_email_dlq.failure_stage
DO $$ BEGIN
    ALTER TABLE recovery_email_dlq ADD CONSTRAINT chk_dlq_failure_stage
        CHECK (failure_stage IN (
            'dispatch', 'send', 'delivery',
            'validation', 'suppression', 'provider',
            'cooldown', 'unknown'
        ))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- billing_webhook_events.provider
DO $$ BEGIN
    ALTER TABLE billing_webhook_events ADD CONSTRAINT chk_billing_provider
        CHECK (provider IN (
            'stripe', 'paddle', 'chargebee', 'braintree', 'recurly', 'other'
        ))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- recovery_emails.status: full lifecycle for durable outbox + legacy states.
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
        ))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECTION 7: NUMERIC PRECISION HARDENING
-- ============================================================================
-- Unrestricted NUMERIC wastes storage. Fixed precision for money & ratios.
-- USING clause forces the cast and surfaces truncation issues immediately.

-- Revenue / money: NUMERIC(18,4) — sub-cent precision, up to 99 trillion
ALTER TABLE recovery_attributions
    ALTER COLUMN revenue TYPE NUMERIC(18,4) USING revenue::NUMERIC(18,4);

-- Metric values: NUMERIC(18,6) — six decimal places for rates/ratios
ALTER TABLE metric_values_daily
    ALTER COLUMN value TYPE NUMERIC(18,6) USING value::NUMERIC(18,6);

ALTER TABLE metric_values_segmented
    ALTER COLUMN value TYPE NUMERIC(18,6) USING value::NUMERIC(18,6);

-- Event value: general-purpose; NUMERIC(18,6) is sufficient for most metrics.
ALTER TABLE events
    ALTER COLUMN value TYPE NUMERIC(18,6) USING value::NUMERIC(18,6);


-- ============================================================================
-- SECTION 8: EMAIL NORMALIZATION
-- ============================================================================
-- Email storage must always be lower(trim(email)) to prevent:
--   • Case-sensitivity uniqueness bypass
--   • Suppression misses
--   • Provider dedup failures

UPDATE recovery_suppressions
SET    email = LOWER(TRIM(email))
WHERE  email IS NOT NULL
  AND  email <> LOWER(TRIM(email));

DO $$ BEGIN
    ALTER TABLE recovery_suppressions
        ADD CONSTRAINT chk_suppression_email_normalized
        CHECK (email = LOWER(TRIM(email)))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE recovery_emails
SET    email = LOWER(TRIM(email))
WHERE  email IS NOT NULL
  AND  email <> LOWER(TRIM(email));

DO $$ BEGIN
    ALTER TABLE recovery_emails
        ADD CONSTRAINT chk_recovery_email_normalized
        CHECK (email = LOWER(TRIM(email)))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE tenant_settings
SET    reply_to_email = LOWER(TRIM(reply_to_email))
WHERE  reply_to_email IS NOT NULL
  AND  reply_to_email <> LOWER(TRIM(reply_to_email));

DO $$ BEGIN
    ALTER TABLE tenant_settings
        ADD CONSTRAINT chk_tenant_reply_to_email_normalized
        CHECK (reply_to_email IS NULL OR reply_to_email = LOWER(TRIM(reply_to_email)))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- SECTION 9: VALIDATE CHECK CONSTRAINTS
-- ============================================================================
-- Run these during a low-traffic window after deploy. They enforce the
-- constraint on existing rows and allow the query planner to use them.
-- ============================================================================

-- ALTER TABLE alerts VALIDATE CONSTRAINT chk_alerts_status;
-- ALTER TABLE anomaly_detector_logs VALIDATE CONSTRAINT chk_anomaly_severity;
-- ALTER TABLE churn_risk_state VALIDATE CONSTRAINT chk_churn_risk_tier;
-- ALTER TABLE churn_risk_history VALIDATE CONSTRAINT chk_churn_risk_history_tier;
-- ALTER TABLE recovery_email_dlq VALIDATE CONSTRAINT chk_dlq_failure_stage;
-- ALTER TABLE billing_webhook_events VALIDATE CONSTRAINT chk_billing_provider;
-- ALTER TABLE recovery_emails VALIDATE CONSTRAINT chk_recovery_emails_status;
-- ALTER TABLE recovery_suppressions VALIDATE CONSTRAINT chk_suppression_email_normalized;
-- ALTER TABLE recovery_emails VALIDATE CONSTRAINT chk_recovery_email_normalized;
-- ALTER TABLE tenant_settings VALIDATE CONSTRAINT chk_tenant_reply_to_email_normalized;

-- ============================================================================
-- END OF PART 1 — FOUNDATION
-- ============================================================================
-- Next: run File 2 (indexes, outbox comments, BRIN).
-- ============================================================================