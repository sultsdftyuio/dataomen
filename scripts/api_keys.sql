-- ============================================================================
-- ARCLI CORE SCHEMA V2 — PRODUCTION-GRADE, IDEMPOTENT, QUEUE-SAFE
-- Execute directly in Supabase SQL Editor.
-- Safe to run multiple times: all DDL uses IF NOT EXISTS / OR REPLACE.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- SHARED UTILITY: updated_at AUTO-TOUCH
-- Attached below to every mutable table.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Helper macro: attach trigger only if absent
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
-- 1. TENANCY & SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenant_users (
    user_id    TEXT        PRIMARY KEY,
    tenant_id  TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant
    ON tenant_users (tenant_id);

-- ----------------------------------------

CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id        TEXT        PRIMARY KEY,
    notify_anomalies BOOLEAN     NOT NULL DEFAULT TRUE,
    notify_weekly    BOOLEAN     NOT NULL DEFAULT TRUE,
    -- NOTE: rotate api_key via application logic; never log this column.
    -- DEPRECATED: migrate application to use public.api_keys table
    api_key          TEXT,
    key_last_updated TIMESTAMPTZ,
    company_name     TEXT,
    reply_to_email   TEXT,
    timezone         TEXT        DEFAULT 'UTC',
    stripe_account_id TEXT,
    email_provider_status BOOLEAN DEFAULT FALSE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN PERFORM _attach_updated_at('tenant_settings'); END $$;


-- API key storage (hashed) and tenant-scoped access
-- Run this in Supabase SQL editor or migrations pipeline.

create extension if not exists pgcrypto;

create table if not exists public.api_keys (
    id uuid primary key default gen_random_uuid(),
    tenant_id text not null,
    key_id text not null unique,
    key_hash text not null,
    key_last4 text not null,
    created_at timestamptz not null default now(),
    created_by text null,
    revoked_at timestamptz null,
    last_used_at timestamptz null,
    label text null
);

create index if not exists api_keys_tenant_id_idx on public.api_keys (tenant_id);
create index if not exists api_keys_active_idx on public.api_keys (tenant_id, revoked_at);

alter table public.api_keys enable row level security;

create policy "api_keys_select_tenant" on public.api_keys
    for select
    using (
        exists (
            select 1
            from public.tenant_users tu
            where tu.tenant_id = api_keys.tenant_id
                and tu.user_id = auth.uid()::text
        )
    );

create policy "api_keys_insert_tenant" on public.api_keys
    for insert
    with check (
        exists (
            select 1
            from public.tenant_users tu
            where tu.tenant_id = api_keys.tenant_id
                and tu.user_id = auth.uid()::text
        )
    );

create policy "api_keys_update_tenant" on public.api_keys
    for update
    using (
        exists (
            select 1
            from public.tenant_users tu
            where tu.tenant_id = api_keys.tenant_id
                and tu.user_id = auth.uid()::text
        )
    )
    with check (
        exists (
            select 1
            from public.tenant_users tu
            where tu.tenant_id = api_keys.tenant_id
                and tu.user_id = auth.uid()::text
        )
    );


-- ============================================================================
-- 2. EVENT INGESTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT        NOT NULL,
    user_id         TEXT        NOT NULL,
    event_name      TEXT        NOT NULL,
    value           NUMERIC,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    properties      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    -- Caller-supplied dedupe token; NULL = no dedupe requested.
    idempotency_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_tenant_time
    ON events (tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_name
    ON events (event_name);

CREATE INDEX IF NOT EXISTS idx_events_tenant_event_ts
    ON events (tenant_id, event_name, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_tenant_user_ts
    ON events (tenant_id, user_id, timestamp DESC);

-- Per-tenant idempotency: same key → same row, silently ignored on replay.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_tenant_idempotency
    ON events (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------

CREATE TABLE IF NOT EXISTS user_activity_daily (
    tenant_id   TEXT        NOT NULL,
    user_id     TEXT        NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    event_count INT         NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_activity_daily_seen
    ON user_activity_daily (tenant_id, last_seen_at DESC);

DO $$ BEGIN PERFORM _attach_updated_at('user_activity_daily'); END $$;


-- ============================================================================
-- 3. BILLING
-- ============================================================================

CREATE TABLE IF NOT EXISTS billing_webhook_events (
    id               BIGSERIAL   PRIMARY KEY,
    tenant_id        TEXT        NOT NULL,
    provider         TEXT        NOT NULL,
    provider_event_id TEXT       NOT NULL,
    event_type       TEXT,
    payload_json     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Provider-level dedupe: one row per external event.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_webhook_events_provider_event
    ON billing_webhook_events (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_tenant
    ON billing_webhook_events (tenant_id);


-- ============================================================================
-- 4. METRICS & ANOMALY DETECTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS metric_configs (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT    NOT NULL,
    metric_name TEXT    NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, metric_name)
);

-- ----------------------------------------

CREATE TABLE IF NOT EXISTS metric_values_daily (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT        NOT NULL,
    metric_name TEXT        NOT NULL,
    date        DATE        NOT NULL,
    value       NUMERIC     NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, date, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_metrics_daily_lookup
    ON metric_values_daily (tenant_id, metric_name, date DESC);

DO $$ BEGIN PERFORM _attach_updated_at('metric_values_daily'); END $$;

-- ----------------------------------------

CREATE TABLE IF NOT EXISTS metric_values_segmented (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT        NOT NULL,
    metric_name     TEXT        NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    value           NUMERIC     NOT NULL,
    dimension       TEXT        NOT NULL,
    dimension_value TEXT        NOT NULL,
    UNIQUE (tenant_id, metric_name, timestamp, dimension, dimension_value)
);

CREATE INDEX IF NOT EXISTS idx_metrics_segmented_lookup
    ON metric_values_segmented (tenant_id, metric_name, dimension, timestamp DESC);


-- ============================================================================
-- ARCLI SCHEMA UPDATE: PHASE 4 (Workspace & Integration Settings)
-- ============================================================================

-- ----------------------------------------

CREATE TABLE IF NOT EXISTS alerts (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    metric_name      TEXT        NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'active',
    first_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_notified    TIMESTAMPTZ,
    occurrence_count INT         NOT NULL DEFAULT 1,
    anomaly_details  JSONB       NOT NULL DEFAULT '{}'::jsonb
);

-- Only one active alert per metric per tenant at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_active_dedup
    ON alerts (tenant_id, metric_name)
    WHERE status = 'active';

-- ----------------------------------------

CREATE TABLE IF NOT EXISTS anomaly_detector_logs (
    id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  TEXT        NOT NULL,
    date                       DATE        NOT NULL,
    metric_name                TEXT,
    severity                   VARCHAR(20) NOT NULL DEFAULT 'low',
    explanation                TEXT,
    primary_correlation_metric VARCHAR(50),
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_logs_tenant_date
    ON anomaly_detector_logs (tenant_id, date DESC);

-- ----------------------------------------

CREATE TABLE IF NOT EXISTS alert_dispatch_logs (
    tenant_id     TEXT         NOT NULL,
    metric_name   TEXT         NOT NULL,
    last_alerted_at TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, metric_name)
);


-- ============================================================================
-- 5. CHURN RISK
-- ============================================================================

CREATE TABLE IF NOT EXISTS churn_risk_state (
    tenant_id           TEXT        NOT NULL,
    user_id             TEXT        NOT NULL,
    risk_score          INT         NOT NULL,
    risk_tier           VARCHAR(20) NOT NULL,
    primary_risk_signal VARCHAR(100),
    signals             JSONB       NOT NULL DEFAULT '{}'::jsonb,
    scored_at           TIMESTAMPTZ NOT NULL,
    score_version       VARCHAR(20) NOT NULL DEFAULT 'v1',
    risk_run_id         VARCHAR(64),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_churn_risk_state_tier
    ON churn_risk_state (tenant_id, risk_tier);

DO $$ BEGIN PERFORM _attach_updated_at('churn_risk_state'); END $$;

-- ----------------------------------------

CREATE TABLE IF NOT EXISTS churn_risk_history (
    id                  BIGSERIAL   PRIMARY KEY,
    tenant_id           TEXT        NOT NULL,
    user_id             TEXT        NOT NULL,
    risk_score          INT         NOT NULL,
    risk_tier           VARCHAR(20) NOT NULL,
    primary_risk_signal VARCHAR(100),
    signals             JSONB       NOT NULL DEFAULT '{}'::jsonb,
    scored_at           TIMESTAMPTZ NOT NULL,
    score_version       VARCHAR(20) NOT NULL DEFAULT 'v1',
    risk_run_id         VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_churn_risk_history_lookup
    ON churn_risk_history (tenant_id, user_id, scored_at DESC);

-- ----------------------------------------

CREATE TABLE IF NOT EXISTS churn_scoring_runs (
    id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT      NOT NULL,
    target_date     DATE      NOT NULL,
    users_scanned   INT       NOT NULL,
    at_risk         INT       NOT NULL,
    duration_ms     INT       NOT NULL,
    signals_missing TEXT[],
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_churn_scoring_runs_tenant_date
    ON churn_scoring_runs (tenant_id, target_date DESC);


-- ============================================================================
-- 6. API IDEMPOTENCY
-- Single authoritative definition; used by the dispatch RPC and any future
-- API endpoints that require exactly-once semantics.
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        TEXT        NOT NULL,
    idempotency_key  TEXT        NOT NULL,
    -- SHA-256 (or similar) of the canonical request body.
    -- Mismatch = client bug / replay attack → rejected.
    request_hash     TEXT        NOT NULL,
    -- Cached response returned verbatim on safe replay.
    response_payload JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    CONSTRAINT api_idempotency_unique UNIQUE (tenant_id, idempotency_key)
);

-- TTL cleanup index.
CREATE INDEX IF NOT EXISTS idx_api_idempotency_expires
    ON api_idempotency_keys (expires_at);


-- ============================================================================
-- 7. RECOVERY EMAILS — DURABLE OUTBOX
-- ============================================================================

CREATE TABLE IF NOT EXISTS recovery_emails (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             TEXT        NOT NULL,
    user_id               TEXT        NOT NULL,
    email                 TEXT        NOT NULL,
    campaign_type         VARCHAR(100) NOT NULL,

    -- ---- Queue lifecycle ----
    status                VARCHAR(30) NOT NULL DEFAULT 'queued',

    -- Batch-level request dedupe (non-unique; one batch → many rows).
    idempotency_key       TEXT        NOT NULL,

    -- Worker-assigned per-message dedupe (unique when set).
    message_key           TEXT,

    -- ---- Risk metadata ----
    primary_risk_signal   VARCHAR(100),
    churn_risk_score      INT,
    risk_run_id           VARCHAR(64),
    attribution_window_days INT        NOT NULL DEFAULT 14,

    -- ---- Retry state ----
    attempt_count         INT         NOT NULL DEFAULT 0,
    max_attempts          INT         NOT NULL DEFAULT 5,
    next_retry_at         TIMESTAMPTZ,

    -- ---- Worker ownership ----
    claimed_at            TIMESTAMPTZ,
    claimed_by            TEXT,
    processing_started_at TIMESTAMPTZ,

    -- ---- Timestamps ----
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    queued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at               TIMESTAMPTZ,
    delivered_at          TIMESTAMPTZ,
    cooldown_until        TIMESTAMPTZ,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ---- Provider metadata ----
    provider_name         TEXT,
    provider_message_id   TEXT,

    -- ---- Failure tracking ----
    last_error            TEXT,
    last_error_code       TEXT,

    -- ---- Constraints ----
    CONSTRAINT chk_recovery_email_status CHECK (
        status IN (
            'queued', 'processing', 'sent',
            'delivered', 'failed', 'suppressed', 'dead_lettered'
        )
    ),
    CONSTRAINT chk_attempt_count  CHECK (attempt_count >= 0),
    CONSTRAINT chk_max_attempts   CHECK (max_attempts  >= 1),
    CONSTRAINT chk_risk_score     CHECK (
        churn_risk_score IS NULL
        OR churn_risk_score BETWEEN 0 AND 100
    ),
    -- Sanity guard: not full RFC validation, but prevents blank/garbage storage.
    -- The RPC filters these at query time too; this is the hard DB backstop.
    CONSTRAINT chk_email_nonempty CHECK (length(trim(email)) > 3),
    -- Prevents impossible retry state: next_retry_at is only meaningful while
    -- a row is still in-flight or eligible for retry.
    CONSTRAINT chk_retry_requires_active_status CHECK (
        next_retry_at IS NULL
        OR status IN ('queued', 'failed', 'processing')
    )
);

-- Per-message dedupe (worker-set).
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_emails_message_key
    ON recovery_emails (tenant_id, message_key)
    WHERE message_key IS NOT NULL;

-- ============================================================================
-- EXACTLY-ONCE BATCH ENQUEUE GUARANTEE
-- Without this, two concurrent calls that both pass the idempotency-key check
-- (one inserts the key, the other sees it and falls through) would both reach
-- the outbox INSERT and produce duplicate rows.
-- This unique index is the hard DB-level backstop that closes that race:
-- the second INSERT hits a conflict and its rows are silently dropped via
-- ON CONFLICT DO NOTHING in the RPC (see Section 8).
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_emails_batch_user_campaign
    ON recovery_emails (tenant_id, idempotency_key, user_id, campaign_type);

-- Batch idempotency lookup (non-unique, fast key → rows scan).
CREATE INDEX IF NOT EXISTS idx_recovery_emails_idempotency
    ON recovery_emails (tenant_id, idempotency_key);

-- ============================================================================
-- QUEUE POLLING INDEXES
--
-- Two complementary strategies:
--
-- 1. Partial index on queued_at (for hot 'queued' rows only).
--    Stays tiny; blazing fast for SKIP LOCKED workers claiming new work.
--
-- 2. Composite index covering status + retry time (for failed/retry rows).
--    Required for the claim-timeout recovery pattern (see Section 8 comment).
-- ============================================================================

-- Hot path: new work claiming.
CREATE INDEX IF NOT EXISTS idx_recovery_emails_ready_queue
    ON recovery_emails (queued_at)
    WHERE status = 'queued';

-- Retry + stale-processing reclaim path.
CREATE INDEX IF NOT EXISTS idx_recovery_emails_retry_reclaim
    ON recovery_emails (status, next_retry_at, queued_at)
    WHERE status IN ('queued', 'failed', 'processing');

-- Tenant history & per-user lookups.
CREATE INDEX IF NOT EXISTS idx_recovery_emails_history
    ON recovery_emails (tenant_id, user_id, created_at DESC);

-- Provider webhook correlation.
CREATE INDEX IF NOT EXISTS idx_recovery_emails_provider
    ON recovery_emails (provider_message_id)
    WHERE provider_message_id IS NOT NULL;

DO $$ BEGIN PERFORM _attach_updated_at('recovery_emails'); END $$;

-- ----------------------------------------
-- 7a. Per-send event log
-- ----------------------------------------

CREATE TABLE IF NOT EXISTS recovery_email_events (
    id          BIGSERIAL   PRIMARY KEY,
    send_id     UUID        NOT NULL REFERENCES recovery_emails(id) ON DELETE CASCADE,
    event_type  VARCHAR(50) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recovery_email_events_lookup
    ON recovery_email_events (send_id, occurred_at DESC);

-- ----------------------------------------
-- 7b. Suppressions (unsubscribe / bounce / complaint)
-- ----------------------------------------

CREATE TABLE IF NOT EXISTS recovery_suppressions (
    id         BIGSERIAL   PRIMARY KEY,
    tenant_id  TEXT        NOT NULL,
    email      TEXT        NOT NULL,
    user_id    TEXT,
    reason     VARCHAR(120) NOT NULL,
    source     VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- One active suppression per tenant+email.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_suppressions_unique
    ON recovery_suppressions (tenant_id, email);

-- ----------------------------------------
-- 7c. Revenue attribution
-- ----------------------------------------

CREATE TABLE IF NOT EXISTS recovery_attributions (
    id         BIGSERIAL   PRIMARY KEY,
    send_id    UUID        NOT NULL REFERENCES recovery_emails(id) ON DELETE CASCADE,
    tenant_id  TEXT        NOT NULL,
    user_id    TEXT        NOT NULL,
    event_name TEXT        NOT NULL,
    event_at   TIMESTAMPTZ NOT NULL,
    revenue    NUMERIC,
    metadata   JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recovery_attributions_send
    ON recovery_attributions (send_id);

CREATE INDEX IF NOT EXISTS idx_recovery_attributions_tenant_user
    ON recovery_attributions (tenant_id, user_id, event_at DESC);

-- ----------------------------------------
-- 7d. Dead-letter queue
-- ----------------------------------------

CREATE TABLE IF NOT EXISTS recovery_email_dlq (
    id            BIGSERIAL    PRIMARY KEY,
    send_id       UUID,                       -- NULL if row never reached outbox
    tenant_id     TEXT         NOT NULL,
    user_id       TEXT,
    campaign_type VARCHAR(100),
    failure_stage TEXT,                       -- 'dispatch' | 'send' | 'delivery' | ...
    last_error    TEXT,
    last_error_code TEXT,
    failed_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    payload       JSONB        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recovery_email_dlq_tenant
    ON recovery_email_dlq (tenant_id, failed_at DESC);


-- ============================================================================
-- 8. ATOMIC CAMPAIGN DISPATCH RPC
--
-- Called from the API as:
--   supabase.rpc('dispatch_campaign_atomic', {
--     p_tenant_id, p_template_id, p_idempotency_key,
--     p_request_hash, p_targets
--   })
--
-- Guarantees:
--   • Exactly-once queueing across retried HTTP calls.
--   • Payload-mismatch guard (different body, same key → error).
--   • Safe replay: returns cached response without re-inserting rows.
--   • Concurrency-safe: two simultaneous calls for the same key cannot
--     produce duplicate outbox rows — enforced by the DB unique index
--     idx_recovery_emails_batch_user_campaign + ON CONFLICT DO NOTHING.
--   • All writes occur in a single transaction.
--
-- CLAIM TIMEOUT RECOVERY (application worker — not a schema concern):
--   Rows with status = 'processing' can be stranded permanently if a worker
--   crashes mid-flight. Workers must include a reclaim clause:
--
--     WHERE status = 'queued'
--        OR (
--             status = 'processing'
--             AND processing_started_at < NOW() - INTERVAL '15 minutes'
--           )
--     ORDER BY queued_at
--     FOR UPDATE SKIP LOCKED
--     LIMIT <batch_size>
--
--   On reclaim, reset: status = 'queued', claimed_at = NULL,
--   claimed_by = NULL, processing_started_at = NULL.
--   This ensures no row is permanently abandoned.
-- ============================================================================

CREATE OR REPLACE FUNCTION dispatch_campaign_atomic(
    p_tenant_id        TEXT,
    p_template_id      TEXT,
    p_idempotency_key  TEXT,
    p_request_hash     TEXT,   -- caller hashes the canonical request body
    p_targets          JSONB   -- [{id, email, signal, riskScore}, ...]
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing_hash     TEXT;
    v_existing_response JSONB;
    v_inserted_count    INT;
    v_result            JSONB;
BEGIN

    -- -------------------------------------------------------------------------
    -- INPUT VALIDATION
    -- -------------------------------------------------------------------------

    IF p_tenant_id IS NULL OR p_tenant_id = '' THEN
        RAISE EXCEPTION 'p_tenant_id must not be empty';
    END IF;

    IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
        RAISE EXCEPTION 'p_idempotency_key must not be empty';
    END IF;

    IF p_request_hash IS NULL OR p_request_hash = '' THEN
        RAISE EXCEPTION 'p_request_hash must not be empty';
    END IF;

    IF p_targets IS NULL
        OR jsonb_typeof(p_targets) <> 'array'
        OR jsonb_array_length(p_targets) = 0
    THEN
        RAISE EXCEPTION 'p_targets must be a non-empty JSON array';
    END IF;

    -- -------------------------------------------------------------------------
    -- REPLAY DETECTION
    -- -------------------------------------------------------------------------

    SELECT request_hash, response_payload
      INTO v_existing_hash, v_existing_response
      FROM api_idempotency_keys
     WHERE tenant_id       = p_tenant_id
       AND idempotency_key = p_idempotency_key
     LIMIT 1;

    IF FOUND THEN
        -- Same key, different body → reject (client bug or replay attack).
        IF v_existing_hash <> p_request_hash THEN
            RAISE EXCEPTION
                'idempotency_key reused with a different request payload';
        END IF;

        -- Safe replay: cached response is available, return it immediately.
        IF v_existing_response IS NOT NULL THEN
            RETURN v_existing_response;
        END IF;

        -- Edge case: key exists but response not yet stored (concurrent race).
        -- Fall through; the INSERT below will be a no-op via ON CONFLICT.
    END IF;

    -- -------------------------------------------------------------------------
    -- CLAIM IDEMPOTENCY SLOT
    -- Uses ON CONFLICT DO NOTHING so concurrent calls for the same key don't
    -- error out — they simply proceed. The outbox INSERT below is also guarded
    -- by ON CONFLICT DO NOTHING backed by idx_recovery_emails_batch_user_campaign,
    -- so whichever concurrent call reaches the outbox second produces zero rows.
    -- This combination is the two-layer guarantee for exactly-once enqueue.
    -- -------------------------------------------------------------------------

    INSERT INTO api_idempotency_keys (tenant_id, idempotency_key, request_hash)
    VALUES (p_tenant_id, p_idempotency_key, p_request_hash)
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

    -- -------------------------------------------------------------------------
    -- OUTBOX INSERT
    -- ON CONFLICT DO NOTHING here is load-bearing for concurrency safety.
    -- If two calls race past the idempotency check above, the unique index
    -- idx_recovery_emails_batch_user_campaign ensures the second call's rows
    -- are silently dropped rather than duplicated.
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
        LOWER(TRIM(t.email)),
        p_template_id,
        'queued',
        p_idempotency_key,
        t.signal,
        t.riskScore,
        NOW(),
        NOW()
    FROM jsonb_to_recordset(p_targets) AS t(
        id        TEXT,
        email     TEXT,
        signal    TEXT,
        riskScore INT
    )
    WHERE TRIM(COALESCE(t.email, '')) <> ''   -- pre-filter; CHECK constraint is the hard backstop
    ON CONFLICT (tenant_id, idempotency_key, user_id, campaign_type) DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    v_result := jsonb_build_object(
        'status', 'queued',
        'queued', v_inserted_count
    );

    -- -------------------------------------------------------------------------
    -- STORE REPLAY RESPONSE
    -- -------------------------------------------------------------------------

    UPDATE api_idempotency_keys
SET response_payload = v_result
WHERE tenant_id = p_tenant_id
  AND idempotency_key = p_idempotency_key
  AND response_payload IS NULL;

    SELECT response_payload
INTO v_result
FROM api_idempotency_keys
WHERE tenant_id = p_tenant_id
  AND idempotency_key = p_idempotency_key;

RETURN v_result;

END;
$$;