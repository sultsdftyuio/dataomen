-- ============================================================================
-- ARCLI CORE SCHEMA — PART 2: OUTBOX & WORKER INFRASTRUCTURE (v3.1)
-- ============================================================================
-- Run AFTER Part 1 (Foundation).
-- Covers: Worker lease safety, outbox dispatch metadata comments,
--         dispatch token deduplication, quota usage tracking,
--         production indexes, events table scale strategy.
--
-- SAFE TO RUN MULTIPLE TIMES: all DDL uses IF NOT EXISTS / OR REPLACE /
-- DO...EXCEPTION blocks. No destructive rewrites.
-- ============================================================================

-- ============================================================================
-- SECTION 11: WORKER LEASE SAFETY
-- ============================================================================

COMMENT ON COLUMN recovery_emails.lease_expires_at IS
    'Explicit worker lease expiry. Replaces the implicit processing_started_at + 15m '
    'reclaim pattern. Workers renew before expiry for long-running dispatch. '
    'Rows where status=dispatch_claimed (or legacy processing) AND lease_expires_at < NOW() '
    'are reclaimable.';

-- Retroactively set lease_expires_at for any stuck processing rows
-- so they are eventually reclaimable by workers after this deploy.
UPDATE recovery_emails
SET    lease_expires_at = NOW() + INTERVAL '15 minutes'
WHERE  status IN ('processing', 'dispatch_claimed')
  AND  lease_expires_at IS NULL;


-- ============================================================================
-- SECTION 11B: OUTBOX DISPATCH METADATA (Comments & Constraints)
-- ============================================================================
-- Columns already exist in Part 0 (Canonical Base). We add comments,
-- the failure_stage CHECK, and indexes here.

COMMENT ON COLUMN recovery_emails.dispatch_token IS
    'Idempotency token for queue dispatch. Unique per claim; used to prevent double-send.';

COMMENT ON COLUMN recovery_emails.sent_at IS
    'Timestamp when the email was handed off to the provider (legacy). '
    'New code should prefer provider_accepted_at. Kept for backward-compatible '
    'cooldown queries via COALESCE(provider_accepted_at, sent_at, created_at).';

COMMENT ON COLUMN recovery_emails.retry_count IS
    'Total number of delivery retries attempted across all dispatch attempts. '
    'Distinct from dispatch_attempt, which counts outbox claim cycles.';

-- NOT VALID: safe deploy even if historical rows contain unexpected values.
DO $$ BEGIN
    ALTER TABLE recovery_emails ADD CONSTRAINT chk_recovery_emails_failure_stage
        CHECK (failure_stage IS NULL OR failure_stage IN (
            'dispatch', 'provider', 'cooldown',
            'validation', 'suppression', 'unknown',
            'send', 'delivery'
        ))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_recovery_emails_status_retry
    ON recovery_emails (status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_recovery_claim_batch
    ON recovery_emails (status, next_retry_at, created_at)
    WHERE status IN ('pending_dispatch', 'dispatch_failed');

-- Unique partial index: dispatch_token is only set on claimed rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_emails_dispatch_token
    ON recovery_emails (dispatch_token)
    WHERE dispatch_token IS NOT NULL;


-- ============================================================================
-- SECTION 11C: DISPATCH TOKEN DEDUP + QUOTA USAGE
-- ============================================================================
-- Tables already created in Part 0. We add CHECK constraints and indexes here.

-- NOT VALID: safe deploy even if historical rows contain unexpected states.
DO $$ BEGIN
    ALTER TABLE recovery_dispatch_dedup ADD CONSTRAINT chk_recovery_dispatch_state
        CHECK (state IN ('processing', 'completed', 'reclaimed'))
        NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_recovery_dispatch_dedup_tenant_send
    ON recovery_dispatch_dedup (tenant_id, send_id);


-- ============================================================================
-- SECTION 12: MISSING PRODUCTION INDEXES
-- ============================================================================

-- Idempotency replay protection (unique for ON CONFLICT target).
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_idempotency_replay
    ON api_idempotency_keys (tenant_id, idempotency_key)
    INCLUDE (request_hash, response_payload);

-- Outbox batch deduplication (partial unique index from Part 0 is sufficient
-- for dispatch_campaign_atomic; we verify it exists here).
-- NOTE: Part 0 created idx_recovery_emails_batch_user_campaign as partial
-- (WHERE idempotency_key IS NOT NULL). That is the canonical definition.

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

-- Suppression lookups: fast per-tenant email check.
CREATE INDEX IF NOT EXISTS idx_recovery_suppressions_tenant_email
    ON recovery_suppressions (tenant_id, email);

-- Modified to include expires_at so queries can efficiently filter by NOW().
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
-- SECTION 15: VALIDATE CHECK CONSTRAINTS FROM THIS FILE
-- ============================================================================
-- Run these during a low-traffic window after deploy.
-- ============================================================================

-- ALTER TABLE recovery_emails VALIDATE CONSTRAINT chk_recovery_emails_failure_stage;
-- ALTER TABLE recovery_dispatch_dedup VALIDATE CONSTRAINT chk_recovery_dispatch_state;

-- ============================================================================
-- END OF PART 2 — OUTBOX & WORKER INFRASTRUCTURE
-- ============================================================================
-- Next: run File 3 (RLS, API key hardening, pg_cron retention jobs).
-- ============================================================================