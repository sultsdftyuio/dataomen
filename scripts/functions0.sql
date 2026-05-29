-- ============================================================================
-- ARCLI CORE SCHEMA — PART 0: CANONICAL BASE (v3.1)
-- ============================================================================
-- Creates every table, type, function, and core FK required by the platform.
-- Run BEFORE Files 1–3. All DDL is idempotent (IF NOT EXISTS / OR REPLACE).
--
-- DESIGN DECISIONS:
--   • NO inline REFERENCES in CREATE TABLE. All FKs live in Section 15 so they
--     can be deployed with NOT VALID + DEFERRABLE INITIALLY DEFERRED.
--   • Child FKs (email_id, send_id) use ON DELETE SET NULL to preserve audit
--     rows and DLQ history if a parent recovery_email is hard-deleted.
--   • tenant_users FKs use ON DELETE CASCADE to match application semantics.
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

-- ============================================================================
-- CORE TENANT & USER TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name         TEXT        NOT NULL,
    display_name TEXT,
    plan         TEXT,
    status       provisioning_state DEFAULT 'PROVISIONING',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_users (
    tenant_id  TEXT,
    user_id    UUID,
    role       TEXT DEFAULT 'owner',
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
    tenant_id            TEXT PRIMARY KEY,
    stripe_customer_id   TEXT UNIQUE,
    subscription_status  TEXT DEFAULT 'incomplete',
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- API KEYS & IDEMPOTENCY
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    TEXT NOT NULL,
    key_id       TEXT NOT NULL,
    key_hash     TEXT NOT NULL,
    key_last4    TEXT NOT NULL,
    created_by   TEXT,
    last_used_at TIMESTAMPTZ,
    label        TEXT,
    revoked_at   TIMESTAMPTZ,
    hash_version TEXT NOT NULL DEFAULT 'sha256',
    scopes       TEXT[] NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, key_id)
);

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash    TEXT NOT NULL,
    response_payload JSONB,
    expires_at      TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, idempotency_key)
);

-- ============================================================================
-- EVENTS & ANALYTICS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT NOT NULL,
    idempotency_key TEXT,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    value           NUMERIC,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active',
    last_seen  TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
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
    tenant_id  TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    risk_tier  TEXT,
    risk_score NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS churn_risk_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT NOT NULL,
    risk_run_id         UUID,
    user_id             TEXT NOT NULL,
    churn_risk_score    NUMERIC,
    risk_tier           TEXT,
    primary_risk_signal TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN churn_risk_history.risk_tier IS
    'Mirrors churn_risk_state.risk_tier for historical trend analysis.';
COMMENT ON COLUMN churn_risk_history.risk_run_id IS
    'Links back to churn_scoring_runs.id. Used to group history rows per run.';

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'api_keys'
          AND column_name = 'key_hash'
    ) THEN
        ALTER TABLE api_keys ADD COLUMN key_hash TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'api_keys'
          AND column_name = 'key_last4'
    ) THEN
        ALTER TABLE api_keys ADD COLUMN key_last4 TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'api_keys'
          AND column_name = 'created_by'
    ) THEN
        ALTER TABLE api_keys ADD COLUMN created_by TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'api_keys'
          AND column_name = 'last_used_at'
    ) THEN
        ALTER TABLE api_keys ADD COLUMN last_used_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'api_keys'
          AND column_name = 'label'
    ) THEN
        ALTER TABLE api_keys ADD COLUMN label TEXT;
    END IF;

    UPDATE api_keys
       SET key_last4 = RIGHT(key_id, 4)
     WHERE key_last4 IS NULL
       AND key_id IS NOT NULL;

    IF EXISTS (
        SELECT 1
        FROM api_keys
        WHERE key_hash IS NULL
           OR key_last4 IS NULL
    ) THEN
        UPDATE api_keys
           SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE key_hash IS NULL
            OR key_last4 IS NULL;

        RAISE NOTICE 'Legacy api_keys rows missing key_hash or key_last4 were revoked; reissue keys for affected tenants.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'churn_risk_history'
          AND column_name = 'risk_run_id'
          AND udt_name <> 'uuid'
    ) THEN
                UPDATE churn_risk_history
                     SET risk_run_id = NULL
                 WHERE risk_run_id IS NOT NULL
                     AND trim(risk_run_id::TEXT) <> ''
                     AND trim(risk_run_id::TEXT) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

        ALTER TABLE churn_risk_history
            ALTER COLUMN risk_run_id TYPE UUID USING NULLIF(risk_run_id::TEXT, '')::UUID;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS churn_scoring_runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    TEXT NOT NULL,
    status       TEXT DEFAULT 'running',
    started_at   TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metric_configs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    config      JSONB DEFAULT '{}',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metric_values_daily (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    metric_config_id UUID,
    date           DATE NOT NULL,
    value          NUMERIC,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metric_values_segmented (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    metric_config_id UUID,
    segment        TEXT,
    date           DATE NOT NULL,
    value          NUMERIC,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anomaly_detector_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    TEXT NOT NULL,
    detector_type TEXT,
    severity     TEXT,
    metric_name  TEXT,
    date         DATE,
    log_data     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_activity_daily (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      TEXT NOT NULL,
    user_id        TEXT,
    date           DATE NOT NULL,
    activity_count INT DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RECOVERY / OUTBOX TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS recovery_emails (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           TEXT NOT NULL,
    user_id             TEXT NOT NULL,
    email               TEXT NOT NULL CHECK (email <> ''),
    campaign_type       TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending_dispatch',
    idempotency_key     TEXT,
    primary_risk_signal TEXT,
    churn_risk_score    INT,
    dispatch_token      TEXT,
    dispatch_attempt    INT DEFAULT 0,
    dispatch_claimed_at TIMESTAMPTZ,
    dispatched_at       TIMESTAMPTZ,
    provider_accepted_at TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    sent_at             TIMESTAMPTZ,
    lease_expires_at    TIMESTAMPTZ,
    next_retry_at       TIMESTAMPTZ,
    failure_stage       TEXT,
    retry_count         INT DEFAULT 0,
    queued_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index: only enforces when idempotency_key is supplied.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_emails_batch_user_campaign
    ON recovery_emails(tenant_id, idempotency_key, user_id, campaign_type)
    WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS recovery_suppressions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT NOT NULL,
    email      TEXT NOT NULL,
    reason     TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS recovery_quota_usage (
    tenant_id    TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    used         INT NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, window_start)
);

CREATE TABLE IF NOT EXISTS recovery_dispatch_dedup (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_token   TEXT UNIQUE NOT NULL,
    tenant_id        TEXT NOT NULL,
    send_id          UUID,
    state            TEXT NOT NULL DEFAULT 'processing',
    lease_expires_at TIMESTAMPTZ,
    attempts         INT DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_email_dlq (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     TEXT NOT NULL,
    email_id      UUID,
    error_message TEXT,
    failure_stage TEXT NOT NULL DEFAULT 'unknown',
    retry_count   INT DEFAULT 0,
    failed_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_email_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    email_id    UUID,
    event_type  TEXT,
    occurred_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_attributions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  TEXT NOT NULL,
    revenue    NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   TEXT NOT NULL,
    provider    TEXT,
    event_type  TEXT,
    received_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

-- -------------------------------------------------------------------------
-- provision_initial_workspace: Race-safe singleton workspace creation
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
            INSERT INTO tenants (name, status)
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
    ON CONFLICT (tenant_id, idempotency_key, user_id, campaign_type) DO NOTHING;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    v_result := jsonb_build_object('status', 'queued', 'queued', v_inserted_count);

    UPDATE api_idempotency_keys
       SET response_payload = v_result
     WHERE tenant_id = p_tenant_id
       AND idempotency_key = p_idempotency_key
       AND id = v_claimed_id
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
    WHERE TRIM(COALESCE(t.id, '')) <> ''
      AND TRIM(COALESCE(t.email, '')) <> ''
      AND TRIM(COALESCE(t.campaign_type, '')) <> '';

    UPDATE tmp_recovery_candidates c
       SET outcome = 'suppressed', reason = 'suppressed'
     WHERE EXISTS (
        SELECT 1 FROM recovery_suppressions s
         WHERE s.tenant_id = p_tenant_id
           AND s.email = c.email
           AND (s.expires_at IS NULL OR s.expires_at > v_now)
     );

    UPDATE tmp_recovery_candidates c
       SET outcome = 'cooldown', reason = 'cooldown_active'
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

    UPDATE tmp_recovery_candidates c
       SET outcome = 'duplicate', reason = 'already_queued'
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

        SELECT used INTO v_used FROM recovery_quota_usage
         WHERE tenant_id = p_tenant_id AND window_start = v_window_start
         FOR UPDATE;

        v_remaining := GREATEST(p_quota_limit - v_used, 0);
        v_allowed_count := LEAST(v_desired_count, v_remaining);

        UPDATE recovery_quota_usage
           SET used = used + v_allowed_count, updated_at = v_now
         WHERE tenant_id = p_tenant_id AND window_start = v_window_start;
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
      FROM ins WHERE c.user_id = ins.user_id AND c.campaign_type = ins.campaign_type;

    UPDATE tmp_recovery_candidates
       SET outcome = 'duplicate', reason = 'already_queued' WHERE outcome = 'pending';

    UPDATE tmp_recovery_candidates c
       SET send_id = e.id
      FROM recovery_emails e
     WHERE e.tenant_id = p_tenant_id
       AND e.user_id = c.user_id
       AND e.campaign_type = c.campaign_type
       AND c.outcome IN ('claimed', 'duplicate');

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'outcome', outcome, 'send_id', send_id, 'message', reason,
        'user_id', user_id, 'campaign_type', campaign_type
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

-- -------------------------------------------------------------------------
-- claim_outbox_batch: Worker claims batch of emails for dispatch
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_outbox_batch(p_limit INT)
RETURNS TABLE (
    id             UUID,
    tenant_id      TEXT,
    dispatch_token TEXT,
    dispatch_attempt INT,
    retry_count    INT
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
           SET status = 'dispatch_claimed',
               dispatch_attempt = COALESCE(dispatch_attempt, 0) + 1,
               dispatch_token = encode(digest(gen_random_uuid()::TEXT, 'sha256'), 'hex'),
               dispatch_claimed_at = NOW(),
               lease_expires_at = NOW() + INTERVAL '15 minutes',
               updated_at = NOW()
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
       SET tenant_id = p_tenant_id, send_id = p_send_id, state = 'reclaimed',
           lease_expires_at = v_now + INTERVAL '15 minutes',
           attempts = attempts + 1, updated_at = v_now
     WHERE dispatch_token = p_dispatch_token;

    RETURN jsonb_build_object('claimed', true, 'state', 'reclaimed');
END;
$$;

-- ============================================================================
-- SECTION 15: CORE FOREIGN KEYS
-- ============================================================================
-- All FKs live here so they can be deployed with:
--   NOT VALID            → skips full-table scan during deploy
--   DEFERRABLE INITIALLY DEFERRED → allows complex transactions
--
-- Child FKs (email_id, send_id) use ON DELETE SET NULL so audit/DLQ rows
-- survive parent deletion and can be cleaned by retention jobs independently.
-- ============================================================================

DO $$ BEGIN ALTER TABLE tenant_users
    ADD CONSTRAINT fk_tenant_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
    ON DELETE CASCADE NOT VALID DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE tenant_users
    ADD CONSTRAINT fk_tenant_users_user FOREIGN KEY (user_id) REFERENCES auth.users(id)
    ON DELETE CASCADE NOT VALID DEFERRABLE INITIALLY DEFERRED;
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

DO $$ BEGIN ALTER TABLE churn_risk_history
    ADD CONSTRAINT fk_churn_risk_history_run FOREIGN KEY (risk_run_id) REFERENCES churn_scoring_runs(id)
    ON DELETE SET NULL NOT VALID DEFERRABLE INITIALLY DEFERRED;
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

-- ============================================================================
-- END OF PART 0 — CANONICAL BASE v3.1
-- ============================================================================
-- Next: run File 1 (triggers, CHECKs, normalization, numeric precision).
-- ============================================================================