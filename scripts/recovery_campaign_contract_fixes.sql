-- ============================================================================
-- ARCLI RECOVERY + CAMPAIGN CONTRACT FIXES
-- ============================================================================
-- Purpose:
--   Align campaign dispatch, recovery workers, attribution, and operator queue
--   RPCs to one deterministic contract.
--
-- Safe to run after functions0.sql, email_templates.sql, and some_fixing.sql.
-- All changes are idempotent or replace existing RPC definitions.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Schema compatibility columns used by the application and workers.
-- --------------------------------------------------------------------------
ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS properties JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.email_templates
    ADD COLUMN IF NOT EXISTS body_text TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS cooldown_days INT NOT NULL DEFAULT 14;

DO $$ BEGIN
    ALTER TABLE public.email_templates
        ADD CONSTRAINT chk_email_templates_cooldown_days
        CHECK (cooldown_days IN (7, 14, 30)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.recovery_emails
    ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
    ADD COLUMN IF NOT EXISTS last_error TEXT,
    ADD COLUMN IF NOT EXISTS attribution_window_days INT NOT NULL DEFAULT 14,
    ADD COLUMN IF NOT EXISTS claimed_by_operator UUID,
    ADD COLUMN IF NOT EXISTS operator_claimed_at TIMESTAMPTZ;

ALTER TABLE public.recovery_email_events
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.recovery_attributions
    ADD COLUMN IF NOT EXISTS send_id UUID,
    ADD COLUMN IF NOT EXISTS event_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS event_id TEXT;

ALTER TABLE public.manual_interventions
    ADD COLUMN IF NOT EXISTS user_id TEXT,
    ADD COLUMN IF NOT EXISTS queue_item_id UUID;

ALTER TABLE public.risk_score_explanations
    ADD COLUMN IF NOT EXISTS tenant_id TEXT;

ALTER TABLE public.campaign_events
    ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE public.risk_score_explanations r
   SET tenant_id = e.tenant_id
  FROM public.recovery_emails e
 WHERE r.tenant_id IS NULL
   AND r.queue_item_id = e.id;

UPDATE public.campaign_events c
   SET tenant_id = e.tenant_id
  FROM public.recovery_emails e
 WHERE c.tenant_id IS NULL
   AND c.queue_item_id = e.id;

ALTER TABLE public.billing_webhook_events
    ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
    ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::JSONB;

DO $$
DECLARE
    v_constraint_name TEXT;
BEGIN
    SELECT conname INTO v_constraint_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'manual_interventions'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%action%'
       AND pg_get_constraintdef(c.oid) ILIKE '%suppress%'
     LIMIT 1;

    IF v_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.manual_interventions DROP CONSTRAINT %I', v_constraint_name);
    END IF;
END $$;

DO $$ BEGIN
    ALTER TABLE public.manual_interventions
        ADD CONSTRAINT manual_interventions_action_check
        CHECK (action IN ('suppress', 'cooldown', 'claim', 'requeue', 'execute', 'skip')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_properties_gin
    ON public.events USING GIN (properties);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'uq_events_tenant_idempotency_key'
    ) AND NOT EXISTS (
        SELECT tenant_id, idempotency_key
          FROM public.events
         WHERE idempotency_key IS NOT NULL
         GROUP BY tenant_id, idempotency_key
        HAVING COUNT(*) > 1
         LIMIT 1
    ) THEN
        CREATE UNIQUE INDEX uq_events_tenant_idempotency_key
            ON public.events (tenant_id, idempotency_key)
            WHERE idempotency_key IS NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recovery_email_events_tenant_email
    ON public.recovery_email_events (tenant_id, email_id, occurred_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_emails_batch_user_campaign
    ON public.recovery_emails (tenant_id, idempotency_key, user_id, campaign_type)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_risk_score_explanations_tenant_queue_item
    ON public.risk_score_explanations (tenant_id, queue_item_id);

CREATE INDEX IF NOT EXISTS idx_campaign_events_tenant_queue_item
    ON public.campaign_events (tenant_id, queue_item_id);

CREATE INDEX IF NOT EXISTS idx_recovery_emails_provider_message_id
    ON public.recovery_emails (provider_message_id)
    WHERE provider_message_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'uq_recovery_emails_provider_message_id'
    ) AND NOT EXISTS (
        SELECT provider_message_id
          FROM public.recovery_emails
         WHERE provider_message_id IS NOT NULL
         GROUP BY provider_message_id
        HAVING COUNT(*) > 1
         LIMIT 1
    ) THEN
        CREATE UNIQUE INDEX uq_recovery_emails_provider_message_id
            ON public.recovery_emails (provider_message_id)
            WHERE provider_message_id IS NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'uq_recovery_attributions_tenant_event_id'
    ) AND NOT EXISTS (
        SELECT tenant_id, event_id
          FROM public.recovery_attributions
         WHERE event_id IS NOT NULL
         GROUP BY tenant_id, event_id
        HAVING COUNT(*) > 1
         LIMIT 1
    ) THEN
        CREATE UNIQUE INDEX uq_recovery_attributions_tenant_event_id
            ON public.recovery_attributions (tenant_id, event_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'uq_recovery_emails_dispatch_token'
    ) AND NOT EXISTS (
        SELECT dispatch_token
          FROM public.recovery_emails
         WHERE dispatch_token IS NOT NULL
         GROUP BY dispatch_token
        HAVING COUNT(*) > 1
         LIMIT 1
    ) THEN
        CREATE UNIQUE INDEX uq_recovery_emails_dispatch_token
            ON public.recovery_emails (dispatch_token)
            WHERE dispatch_token IS NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recovery_attributions_send_id
    ON public.recovery_attributions (send_id);

CREATE INDEX IF NOT EXISTS idx_recovery_suppressions_active
    ON public.recovery_suppressions (tenant_id, email, expires_at);

CREATE INDEX IF NOT EXISTS idx_manual_interventions_user
    ON public.manual_interventions (tenant_id, user_id, date DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'uq_billing_webhook_provider_event'
    ) AND NOT EXISTS (
        SELECT provider, provider_event_id
          FROM public.billing_webhook_events
         WHERE provider_event_id IS NOT NULL
         GROUP BY provider, provider_event_id
        HAVING COUNT(*) > 1
         LIMIT 1
    ) THEN
        CREATE UNIQUE INDEX uq_billing_webhook_provider_event
            ON public.billing_webhook_events (provider, provider_event_id);
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- Attempt reservation: always tenant-scoped.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_recovery_attempt(
    p_tenant_id TEXT,
    p_send_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_attempt_count INT;
BEGIN
    UPDATE public.recovery_emails
       SET attempt_count = COALESCE(attempt_count, 0) + 1,
           updated_at = NOW()
     WHERE tenant_id = p_tenant_id
       AND id = p_send_id
       AND status NOT IN ('provider_accepted', 'delivered', 'sent', 'dead_lettered', 'suppressed')
     RETURNING attempt_count INTO v_attempt_count;

    IF v_attempt_count IS NULL THEN
        RETURN jsonb_build_object('error', 'missing_or_terminal');
    END IF;

    RETURN jsonb_build_object('attempt_count', v_attempt_count);
END;
$$;

-- --------------------------------------------------------------------------
-- Provider-boundary token claim. Rejects token reuse across tenant/send scope.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_dispatch_token(
    p_dispatch_token TEXT,
    p_tenant_id TEXT,
    p_send_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_state TEXT;
    v_lease TIMESTAMPTZ;
    v_tenant_id TEXT;
    v_send_id UUID;
BEGIN
    IF p_dispatch_token IS NULL OR trim(p_dispatch_token) = '' THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'invalid');
    END IF;

    INSERT INTO public.recovery_dispatch_dedup (
        dispatch_token, tenant_id, send_id, state, lease_expires_at,
        attempts, created_at, updated_at
    )
    VALUES (
        p_dispatch_token, p_tenant_id, p_send_id, 'processing',
        v_now + INTERVAL '15 minutes', 1, v_now, v_now
    )
    ON CONFLICT (dispatch_token) DO NOTHING;

    IF FOUND THEN
        RETURN jsonb_build_object('claimed', true, 'state', 'claimed');
    END IF;

    SELECT state, lease_expires_at, tenant_id, send_id
      INTO v_state, v_lease, v_tenant_id, v_send_id
      FROM public.recovery_dispatch_dedup
     WHERE dispatch_token = p_dispatch_token
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'missing');
    END IF;

    IF v_tenant_id IS DISTINCT FROM p_tenant_id OR v_send_id IS DISTINCT FROM p_send_id THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'scope_mismatch');
    END IF;

    IF v_state = 'completed' THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'completed');
    END IF;

    IF v_lease IS NOT NULL AND v_lease >= v_now THEN
        RETURN jsonb_build_object('claimed', false, 'state', 'in_flight');
    END IF;

    UPDATE public.recovery_dispatch_dedup
       SET state = 'reclaimed',
           lease_expires_at = v_now + INTERVAL '15 minutes',
           attempts = COALESCE(attempts, 0) + 1,
           updated_at = v_now
     WHERE dispatch_token = p_dispatch_token
       AND tenant_id = p_tenant_id
       AND send_id = p_send_id;

    RETURN jsonb_build_object('claimed', true, 'state', 'reclaimed');
END;
$$;

-- --------------------------------------------------------------------------
-- Unified worker reservation: token claim + suppression + cooldown + attempt.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_email_dispatch(
    p_dispatch_token TEXT,
    p_tenant_id TEXT,
    p_send_id UUID,
    p_max_attempts INT
)
RETURNS TABLE (
    record JSONB,
    claim_status TEXT,
    cooldown_status TEXT,
    attempt_count INT,
    error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_claim JSONB;
    v_record public.recovery_emails%ROWTYPE;
    v_record_json JSONB;
    v_attempt_count INT;
    v_cooldown_days INT := 14;
BEGIN
    v_claim := public.claim_dispatch_token(p_dispatch_token, p_tenant_id, p_send_id);

    IF COALESCE((v_claim->>'claimed')::BOOLEAN, FALSE) IS FALSE THEN
        RETURN QUERY SELECT
            NULL::JSONB,
            COALESCE(v_claim->>'state', 'duplicate')::TEXT,
            NULL::TEXT,
            NULL::INT,
            NULL::TEXT;
        RETURN;
    END IF;

    SELECT *
      INTO v_record
      FROM public.recovery_emails
     WHERE tenant_id = p_tenant_id
       AND id = p_send_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::JSONB, 'claimed'::TEXT, 'missing_record'::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;

    v_record_json := to_jsonb(v_record);

    IF EXISTS (
        SELECT 1
          FROM public.recovery_suppressions s
         WHERE s.tenant_id = p_tenant_id
           AND s.email = LOWER(TRIM(v_record.email))
           AND (s.expires_at IS NULL OR s.expires_at > v_now)
         LIMIT 1
    ) THEN
        UPDATE public.recovery_emails
           SET status = 'suppressed',
               failure_stage = 'validation',
               last_error = 'recipient_suppressed',
               updated_at = v_now
         WHERE tenant_id = p_tenant_id
           AND id = p_send_id;

        RETURN QUERY SELECT v_record_json, 'claimed'::TEXT, 'suppressed'::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;

    IF v_record.status IN ('provider_accepted', 'delivered', 'sent', 'dead_lettered') THEN
        RETURN QUERY SELECT v_record_json, 'claimed'::TEXT, 'terminal'::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;

    IF COALESCE(v_record.attempt_count, 0) >= GREATEST(p_max_attempts, 1) THEN
        RETURN QUERY SELECT v_record_json, 'claimed'::TEXT, 'max_attempts'::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.recovery_emails e
         WHERE e.tenant_id = p_tenant_id
           AND e.user_id = v_record.user_id
           AND e.id <> p_send_id
           AND e.status IN ('provider_accepted', 'delivered', 'sent')
           AND COALESCE(e.provider_accepted_at, e.sent_at, e.created_at) >= v_now - INTERVAL '24 hours'
         LIMIT 1
    ) THEN
        RETURN QUERY SELECT v_record_json, 'claimed'::TEXT, 'global_cap'::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;

    SELECT COALESCE(t.cooldown_days, 14)
      INTO v_cooldown_days
      FROM public.email_templates t
     WHERE t.tenant_id = p_tenant_id
       AND t.id::TEXT = v_record.campaign_type
     LIMIT 1;

    IF v_cooldown_days NOT IN (7, 14, 30) THEN
        v_cooldown_days := CASE
            WHEN v_record.campaign_type = 'billing_failed' THEN 7
            WHEN v_record.campaign_type = 'cancellation_followup' THEN 30
            ELSE 14
        END;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.recovery_emails e
         WHERE e.tenant_id = p_tenant_id
           AND e.user_id = v_record.user_id
           AND e.campaign_type = v_record.campaign_type
           AND e.id <> p_send_id
           AND e.status IN ('provider_accepted', 'delivered', 'sent')
           AND COALESCE(e.provider_accepted_at, e.sent_at, e.created_at) >= v_now - make_interval(days => v_cooldown_days)
         LIMIT 1
    ) THEN
        RETURN QUERY SELECT v_record_json, 'claimed'::TEXT, 'template_cooldown'::TEXT, NULL::INT, NULL::TEXT;
        RETURN;
    END IF;

    UPDATE public.recovery_emails
       SET status = 'dispatching',
           attempt_count = COALESCE(attempt_count, 0) + 1,
           attribution_window_days = COALESCE(attribution_window_days, v_cooldown_days),
           updated_at = v_now
     WHERE tenant_id = p_tenant_id
       AND id = p_send_id
     RETURNING attempt_count INTO v_attempt_count;

    SELECT to_jsonb(r.*)
      INTO v_record_json
      FROM public.recovery_emails r
     WHERE r.tenant_id = p_tenant_id
       AND r.id = p_send_id;

    RETURN QUERY SELECT v_record_json, 'claimed'::TEXT, 'ok'::TEXT, v_attempt_count, NULL::TEXT;
END;
$$;

-- --------------------------------------------------------------------------
-- Campaign dispatch: exactly-once insert, tenant-owned template, no annoyance.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_campaign_atomic(
    p_tenant_id TEXT,
    p_template_id TEXT,
    p_idempotency_key TEXT,
    p_request_hash TEXT,
    p_targets JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_claimed_id UUID;
    v_existing_hash TEXT;
    v_existing_response JSONB;
    v_inserted_count INT := 0;
    v_skipped_suppressed INT := 0;
    v_skipped_cooldown INT := 0;
    v_skipped_inflight INT := 0;
    v_result JSONB;
    v_cooldown_days INT;
BEGIN
    IF p_tenant_id IS NULL OR trim(p_tenant_id) = '' THEN
        RAISE EXCEPTION 'p_tenant_id must not be empty';
    END IF;
    IF p_template_id IS NULL OR trim(p_template_id) = '' THEN
        RAISE EXCEPTION 'p_template_id must not be empty';
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

    SELECT COALESCE(t.cooldown_days, 14)
      INTO v_cooldown_days
      FROM public.email_templates t
     WHERE t.tenant_id = p_tenant_id
       AND t.id::TEXT = p_template_id
       AND COALESCE(t.is_active, TRUE)
     LIMIT 1;

    IF v_cooldown_days IS NULL THEN
        RAISE EXCEPTION 'template not found for tenant';
    END IF;

    IF v_cooldown_days NOT IN (7, 14, 30) THEN
        v_cooldown_days := 14;
    END IF;

    INSERT INTO public.api_idempotency_keys (tenant_id, idempotency_key, request_hash)
    VALUES (p_tenant_id, p_idempotency_key, p_request_hash)
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_claimed_id;

    IF v_claimed_id IS NULL THEN
        SELECT request_hash, response_payload
          INTO v_existing_hash, v_existing_response
          FROM public.api_idempotency_keys
         WHERE tenant_id = p_tenant_id
           AND idempotency_key = p_idempotency_key;

        IF v_existing_hash IS DISTINCT FROM p_request_hash THEN
            RAISE EXCEPTION 'idempotency_key reused with a different request payload';
        END IF;

        IF v_existing_response IS NOT NULL THEN
            RETURN v_existing_response;
        END IF;

        RETURN jsonb_build_object('status', 'pending', 'queued', 0);
    END IF;

    WITH raw_targets AS (
        SELECT DISTINCT ON (LOWER(TRIM(t.id)))
            TRIM(t.id) AS user_id,
            LOWER(TRIM(t.email)) AS email,
            NULLIF(TRIM(COALESCE(t.signal, 'unknown')), '') AS signal,
            COALESCE(t."riskScore", 0) AS risk_score
        FROM jsonb_to_recordset(p_targets) AS t(
            id TEXT,
            email TEXT,
            signal TEXT,
            "riskScore" INT
        )
        WHERE TRIM(COALESCE(t.id, '')) <> ''
          AND TRIM(COALESCE(t.email, '')) <> ''
        ORDER BY LOWER(TRIM(t.id)), LOWER(TRIM(t.email))
    ),
    classified AS (
        SELECT
            rt.*,
            EXISTS (
                SELECT 1
                  FROM public.recovery_suppressions s
                 WHERE s.tenant_id = p_tenant_id
                   AND s.email = rt.email
                   AND (s.expires_at IS NULL OR s.expires_at > NOW())
                 LIMIT 1
            ) AS is_suppressed,
            EXISTS (
                SELECT 1
                  FROM public.recovery_emails e
                 WHERE e.tenant_id = p_tenant_id
                   AND e.user_id = rt.user_id
                   AND e.campaign_type = p_template_id
                   AND e.status IN ('provider_accepted', 'delivered', 'sent')
                   AND COALESCE(e.provider_accepted_at, e.sent_at, e.created_at) >= NOW() - make_interval(days => v_cooldown_days)
                 LIMIT 1
            ) AS on_cooldown,
            EXISTS (
                SELECT 1
                  FROM public.recovery_emails e
                 WHERE e.tenant_id = p_tenant_id
                   AND e.user_id = rt.user_id
                   AND e.campaign_type = p_template_id
                   AND e.status IN ('pending_dispatch', 'dispatch_claimed', 'dispatching', 'dispatched_to_queue', 'dispatch_failed')
                 LIMIT 1
            ) AS has_inflight
        FROM raw_targets rt
    ),
    inserted AS (
        INSERT INTO public.recovery_emails (
            tenant_id,
            user_id,
            email,
            campaign_type,
            status,
            idempotency_key,
            primary_risk_signal,
            churn_risk_score,
            attribution_window_days,
            queued_at,
            created_at,
            updated_at
        )
        SELECT
            p_tenant_id,
            user_id,
            email,
            p_template_id,
            'pending_dispatch',
            p_idempotency_key,
            signal,
            risk_score,
            v_cooldown_days,
            NOW(),
            NOW(),
            NOW()
        FROM classified
        WHERE is_suppressed IS FALSE
          AND on_cooldown IS FALSE
          AND has_inflight IS FALSE
        ON CONFLICT (tenant_id, idempotency_key, user_id, campaign_type)
        WHERE idempotency_key IS NOT NULL
        DO NOTHING
        RETURNING id
    )
    SELECT
        (SELECT COUNT(*) FROM inserted),
        (SELECT COUNT(*) FROM classified WHERE is_suppressed),
        (SELECT COUNT(*) FROM classified WHERE on_cooldown),
        (SELECT COUNT(*) FROM classified WHERE has_inflight)
      INTO v_inserted_count, v_skipped_suppressed, v_skipped_cooldown, v_skipped_inflight;

    v_result := jsonb_build_object(
        'status', 'success',
        'queued', v_inserted_count,
        'skipped', jsonb_build_object(
            'suppressed', v_skipped_suppressed,
            'cooldown', v_skipped_cooldown,
            'inflight', v_skipped_inflight
        )
    );

    UPDATE public.api_idempotency_keys
       SET response_payload = v_result
     WHERE tenant_id = p_tenant_id
       AND idempotency_key = p_idempotency_key
       AND id = v_claimed_id
       AND response_payload IS NULL;

    RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- Queue/operator views and interventions.
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_queue_intervention(UUID, TEXT, TEXT, INT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.claim_account_intervention(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.requeue_dead_letter_intervention(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.execute_queue_item_intervention(TEXT, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.skip_queue_item_intervention(TEXT, UUID, UUID, TEXT);

CREATE OR REPLACE VIEW public.vw_customer_operations AS
WITH latest_recovery AS (
    SELECT DISTINCT ON (tenant_id, user_id) *
      FROM public.recovery_emails
     ORDER BY tenant_id, user_id, created_at DESC
),
latest_claim AS (
    SELECT DISTINCT ON (tenant_id, user_id)
        tenant_id,
        user_id,
        operator_name
      FROM public.manual_interventions
     WHERE action = 'claim'
     ORDER BY tenant_id, user_id, date DESC
)
SELECT
    COALESCE(re.id::TEXT, crs.tenant_id || ':' || crs.user_id) AS id,
    crs.tenant_id,
    crs.user_id AS customer_id,
    COALESCE(crs.customer_name, SPLIT_PART(re.email, '@', 1), crs.user_id) AS name,
    re.email AS email,
    COALESCE(crs.risk_score, re.churn_risk_score, 0) AS risk_score,
    COALESCE(crs.mrr_at_risk, 0) AS mrr_at_risk,
    COALESCE(re.primary_risk_signal, crs.risk_tier, 'No active signals') AS signal,
    CASE
        WHEN COALESCE(re.primary_risk_signal, crs.risk_tier, '') ILIKE '%payment%'
          OR COALESCE(re.primary_risk_signal, crs.risk_tier, '') ILIKE '%invoice%' THEN 'billing'
        WHEN COALESCE(re.primary_risk_signal, crs.risk_tier, '') ILIKE '%cancel%' THEN 'cancellation'
        ELSE 'activity'
    END AS signal_type,
    COALESCE(
        CASE
            WHEN re.status = 'dead_lettered' THEN 'dead_lettered'
            WHEN re.status IN ('dispatch_failed', 'failed') THEN 'failed'
            WHEN re.status IN ('pending_dispatch', 'queued') THEN 'pending'
            WHEN re.status IN ('dispatch_claimed', 'dispatching', 'processing', 'dispatched_to_queue') THEN 'processing'
            WHEN re.status IN ('provider_accepted', 'delivered', 'sent') THEN 'cooldown'
            WHEN re.status = 'suppressed' THEN 'suppressed'
            WHEN re.status = 'completed' THEN 'completed'
            ELSE NULL
        END,
        'healthy'
    ) AS state,
    COALESCE(re.next_retry_at, re.lease_expires_at) AS next_action_time,
    COALESCE(lc.operator_name, re.claimed_by_operator::TEXT) AS assigned_to_name
FROM public.churn_risk_state crs
LEFT JOIN latest_recovery re
    ON crs.tenant_id = re.tenant_id
   AND crs.user_id = re.user_id
LEFT JOIN latest_claim lc
    ON crs.tenant_id = lc.tenant_id
   AND crs.user_id = lc.user_id;

CREATE OR REPLACE VIEW public.vw_customer_operations_metrics AS
SELECT
    tenant_id,
    COUNT(customer_id) AS total_customers,
    COUNT(customer_id) FILTER (WHERE risk_score >= 50 AND risk_score < 70) AS at_risk_count,
    COUNT(customer_id) FILTER (WHERE risk_score >= 70) AS critical_count,
    COUNT(customer_id) FILTER (WHERE state = 'pending') AS pending_count,
    COUNT(customer_id) FILTER (WHERE state = 'dead_lettered') AS dead_letter_count,
    COALESCE(SUM(mrr_at_risk) FILTER (WHERE risk_score >= 50), 0) AS total_mrr_at_risk
FROM public.vw_customer_operations
GROUP BY tenant_id;

CREATE OR REPLACE FUNCTION public.apply_queue_intervention(
    p_tenant_id TEXT,
    p_user_id TEXT,
    p_action TEXT,
    p_duration_days INT,
    p_operator_name TEXT,
    p_reason TEXT,
    p_idempotency_key UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_cooldown_until TIMESTAMPTZ;
    v_email TEXT;
    v_operator_id UUID := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID);
BEGIN
    IF EXISTS (
        SELECT 1
          FROM public.manual_interventions
         WHERE tenant_id = p_tenant_id
           AND idempotency_key = p_idempotency_key::TEXT
    ) THEN
        RETURN;
    END IF;

    SELECT email
      INTO v_email
      FROM public.recovery_emails
     WHERE tenant_id = p_tenant_id
       AND user_id = p_user_id
     ORDER BY created_at DESC
     LIMIT 1;

    IF p_action = 'suppress' THEN
        IF v_email IS NOT NULL THEN
            INSERT INTO public.recovery_suppressions (tenant_id, email, reason, created_at)
            VALUES (p_tenant_id, LOWER(TRIM(v_email)), COALESCE(p_reason, 'operator_suppression'), v_now)
            ON CONFLICT (tenant_id, email) DO UPDATE
                SET reason = EXCLUDED.reason,
                    expires_at = NULL,
                    created_at = EXCLUDED.created_at;
        END IF;

        UPDATE public.recovery_emails
           SET status = 'suppressed',
               failure_stage = 'validation',
               last_error = 'operator_suppressed',
               updated_at = v_now
         WHERE tenant_id = p_tenant_id
           AND user_id = p_user_id
           AND status IN ('pending_dispatch', 'queued', 'dispatch_claimed', 'dispatching', 'dispatch_failed');

    ELSIF p_action = 'cooldown' THEN
        v_cooldown_until := v_now + make_interval(days => COALESCE(p_duration_days, 14));

        UPDATE public.recovery_emails
           SET status = 'cooldown',
               lease_expires_at = v_cooldown_until,
               next_retry_at = v_cooldown_until,
               failure_stage = 'cooldown',
               last_error = 'operator_cooldown',
               updated_at = v_now
         WHERE tenant_id = p_tenant_id
           AND user_id = p_user_id
           AND status IN ('pending_dispatch', 'queued', 'dispatch_claimed', 'dispatching', 'dispatch_failed', 'failed');
    ELSE
        RAISE EXCEPTION 'Unsupported action: %', p_action;
    END IF;

    INSERT INTO public.manual_interventions (
        tenant_id,
        customer_id,
        user_id,
        operator_id,
        operator_name,
        action,
        duration_days,
        notes,
        idempotency_key,
        date
    )
    VALUES (
        p_tenant_id,
        p_user_id,
        p_user_id,
        v_operator_id,
        COALESCE(NULLIF(p_operator_name, ''), 'Unknown Operator'),
        p_action,
        p_duration_days,
        p_reason,
        p_idempotency_key::TEXT,
        v_now
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_account_intervention(
    p_tenant_id TEXT,
    p_item_id UUID,
    p_operator_id UUID,
    p_operator_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id TEXT;
BEGIN
    UPDATE public.recovery_emails
       SET claimed_by_operator = p_operator_id,
           operator_claimed_at = NOW(),
           updated_at = NOW()
     WHERE tenant_id = p_tenant_id
       AND id = p_item_id
       AND claimed_by_operator IS NULL
     RETURNING user_id INTO v_user_id;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Account could not be claimed. It may not exist or is already assigned.';
    END IF;

    INSERT INTO public.manual_interventions (
        tenant_id, customer_id, user_id, queue_item_id, operator_id,
        operator_name, action, idempotency_key
    )
    VALUES (
        p_tenant_id, v_user_id, v_user_id, p_item_id, p_operator_id,
        COALESCE(NULLIF(p_operator_name, ''), 'Unknown Operator'), 'claim',
        'claim:' || p_item_id::TEXT || ':' || p_operator_id::TEXT
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.requeue_dead_letter_intervention(
    p_tenant_id TEXT,
    p_item_id UUID,
    p_operator_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id TEXT;
    v_operator_id UUID := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID);
BEGIN
    UPDATE public.recovery_emails
       SET status = 'pending_dispatch',
           failure_stage = NULL,
           last_error = NULL,
           next_retry_at = NOW(),
           lease_expires_at = NULL,
           updated_at = NOW()
     WHERE tenant_id = p_tenant_id
       AND id = p_item_id
       AND status = 'dead_lettered'
     RETURNING user_id INTO v_user_id;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Could not requeue. Account may not exist or is not dead-lettered.';
    END IF;

    INSERT INTO public.manual_interventions (
        tenant_id, customer_id, user_id, queue_item_id, operator_id,
        operator_name, action, idempotency_key
    )
    VALUES (
        p_tenant_id, v_user_id, v_user_id, p_item_id, v_operator_id,
        COALESCE(NULLIF(p_operator_name, ''), 'Unknown Operator'), 'requeue',
        'requeue:' || p_item_id::TEXT || ':' || v_operator_id::TEXT
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_queue_item_intervention(
    p_tenant_id TEXT,
    p_item_id UUID,
    p_operator_id UUID,
    p_operator_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id TEXT;
BEGIN
    UPDATE public.recovery_emails
       SET status = 'pending_dispatch',
           next_retry_at = NOW(),
           lease_expires_at = NULL,
           failure_stage = NULL,
           last_error = NULL,
           updated_at = NOW()
     WHERE tenant_id = p_tenant_id
       AND id = p_item_id
       AND status IN ('pending_dispatch', 'queued', 'dispatch_failed', 'failed', 'cooldown', 'dead_lettered')
     RETURNING user_id INTO v_user_id;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Queue item could not be executed. It may be processing or missing.';
    END IF;

    INSERT INTO public.manual_interventions (
        tenant_id, customer_id, user_id, queue_item_id, operator_id,
        operator_name, action, idempotency_key
    )
    VALUES (
        p_tenant_id, v_user_id, v_user_id, p_item_id, p_operator_id,
        COALESCE(NULLIF(p_operator_name, ''), 'Unknown Operator'), 'execute',
        'execute:' || p_item_id::TEXT || ':' || p_operator_id::TEXT
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.skip_queue_item_intervention(
    p_tenant_id TEXT,
    p_item_id UUID,
    p_operator_id UUID,
    p_operator_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id TEXT;
    v_email TEXT;
BEGIN
    SELECT user_id, email
      INTO v_user_id, v_email
      FROM public.recovery_emails
     WHERE tenant_id = p_tenant_id
       AND id = p_item_id
     FOR UPDATE;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Queue item could not be skipped. It may be missing.';
    END IF;

    IF v_email IS NOT NULL THEN
        INSERT INTO public.recovery_suppressions (tenant_id, email, reason, created_at)
        VALUES (p_tenant_id, LOWER(TRIM(v_email)), 'operator_skip', NOW())
        ON CONFLICT (tenant_id, email) DO UPDATE
            SET reason = EXCLUDED.reason,
                expires_at = NULL,
                created_at = EXCLUDED.created_at;
    END IF;

    UPDATE public.recovery_emails
       SET status = 'suppressed',
           failure_stage = 'validation',
           last_error = 'operator_skipped',
           updated_at = NOW()
     WHERE tenant_id = p_tenant_id
       AND id = p_item_id;

    INSERT INTO public.manual_interventions (
        tenant_id, customer_id, user_id, queue_item_id, operator_id,
        operator_name, action, idempotency_key
    )
    VALUES (
        p_tenant_id, v_user_id, v_user_id, p_item_id, p_operator_id,
        COALESCE(NULLIF(p_operator_name, ''), 'Unknown Operator'), 'skip',
        'skip:' || p_item_id::TEXT || ':' || p_operator_id::TEXT
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
END;
$$;

COMMIT;
