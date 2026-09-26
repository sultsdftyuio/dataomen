-- Opt-in monitoring for entity-first targets.
--
-- Apply after scripts/entity_first_prospecting_contract.sql. This contract
-- deliberately reuses retained-public evidence collection: it schedules no
-- profile fetches, target URL crawls, source API calls, history enumeration,
-- outreach, lead creation, or CRM export.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.targeting_profiles') IS NULL
       OR to_regclass('public.prospect_entities') IS NULL
       OR to_regclass('public.prospect_assessments') IS NULL
       OR to_regclass('public.prospect_research_runs') IS NULL
       OR to_regclass('public.prospect_research_run_entities') IS NULL
       OR to_regclass('public.tenant_users') IS NULL THEN
        RAISE EXCEPTION
            'prospect_target_monitoring_contract requires the entity-first prospecting contract';
    END IF;
END;
$$;

-- The initial retained-corpus executor supports only exact builder profile
-- locators. Keep this check in SQL as well as the worker so a browser or
-- service-side write cannot promise monitoring for an account, a project, a
-- repository, or a broad social/profile URL that the worker is not allowed to
-- inspect.
CREATE OR REPLACE FUNCTION public.prospecting_is_supported_retained_monitor_locator(
    entity_kind_input TEXT,
    canonical_url_input TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
    SELECT lower(btrim(COALESCE(entity_kind_input, ''))) = 'builder'
       AND (
            lower(btrim(COALESCE(canonical_url_input, ''))) ~
                '^https://github[.]com/[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?/?$'
            OR lower(btrim(COALESCE(canonical_url_input, ''))) ~
                '^https://bsky[.]app/profile/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?/?$'
            OR lower(btrim(COALESCE(canonical_url_input, ''))) ~
                '^https://news[.]ycombinator[.]com/user[?]id=[a-z0-9_-]{1,64}$'
       );
$$;

CREATE TABLE IF NOT EXISTS public.prospect_target_monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    targeting_profile_id UUID NOT NULL,
    prospect_entity_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    -- The original due time is intentionally retained while a dispatcher has
    -- a lease. It becomes the stable nonce for a broker-retry-safe run.
    next_refresh_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dispatch_lease_until TIMESTAMPTZ,
    last_dispatched_at TIMESTAMPTZ,
    last_research_run_id UUID,
    last_error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prospect_target_monitors_status_check
        CHECK (status IN ('active', 'paused')),
    CONSTRAINT prospect_target_monitors_error_code_check
        CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_:-]{1,120}$'),
    CONSTRAINT uq_prospect_target_monitors_target
        UNIQUE (tenant_id, targeting_profile_id, prospect_entity_id)
);

COMMENT ON TABLE public.prospect_target_monitors IS
    'Explicit opt-in schedule for an exact supported public builder locator. Stores target IDs and state only; never URLs, handles, queries, source text, contacts, or profile history.';

ALTER TABLE public.prospect_target_monitors
    DROP CONSTRAINT IF EXISTS fk_prospect_target_monitors_tenant_profile;
ALTER TABLE public.prospect_target_monitors
    ADD CONSTRAINT fk_prospect_target_monitors_tenant_profile
    FOREIGN KEY (tenant_id, targeting_profile_id)
    REFERENCES public.targeting_profiles (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_target_monitors
    DROP CONSTRAINT IF EXISTS fk_prospect_target_monitors_tenant_entity;
ALTER TABLE public.prospect_target_monitors
    ADD CONSTRAINT fk_prospect_target_monitors_tenant_entity
    FOREIGN KEY (tenant_id, prospect_entity_id)
    REFERENCES public.prospect_entities (tenant_id, id)
    ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.prospect_target_monitor_scheduler_state (
    scheduler_name TEXT PRIMARY KEY,
    next_tick_at TIMESTAMPTZ NOT NULL,
    last_tick_started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prospect_target_monitor_scheduler_name_check
        CHECK (scheduler_name = 'retained_public_evidence_monitoring')
);

COMMENT ON TABLE public.prospect_target_monitor_scheduler_state IS
    'Singleton durable tick for bounded opt-in retained-public target monitoring.';

CREATE INDEX IF NOT EXISTS idx_prospect_target_monitors_due
    ON public.prospect_target_monitors(next_refresh_at ASC, id ASC)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_prospect_target_monitors_tenant_profile
    ON public.prospect_target_monitors(tenant_id, targeting_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_prospect_target_monitor_scheduler_due
    ON public.prospect_target_monitor_scheduler_state(next_tick_at ASC);

CREATE OR REPLACE FUNCTION public.guard_prospect_target_monitor_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_assessment_state TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.targeting_profile_id IS DISTINCT FROM OLD.targeting_profile_id
           OR NEW.prospect_entity_id IS DISTINCT FROM OLD.prospect_entity_id
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       ) THEN
        RAISE EXCEPTION 'target monitor tenant and target identity are immutable'
            USING ERRCODE = '23514';
    END IF;

    SELECT assessment.assessment_state
      INTO current_assessment_state
      FROM public.prospect_assessments AS assessment
     WHERE assessment.tenant_id = NEW.tenant_id
       AND assessment.targeting_profile_id = NEW.targeting_profile_id
       AND assessment.prospect_entity_id = NEW.prospect_entity_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'target monitor assessment does not belong to tenant'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.status = 'active' THEN
        IF current_assessment_state = 'rejected' THEN
            RAISE EXCEPTION 'rejected targets cannot be monitored'
                USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM public.prospect_entities AS entity
             WHERE entity.tenant_id = NEW.tenant_id
               AND entity.id = NEW.prospect_entity_id
               AND public.prospecting_is_supported_retained_monitor_locator(
                    entity.entity_kind,
                    entity.canonical_url
               )
        ) THEN
            RAISE EXCEPTION 'target does not support retained-public monitoring'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- A monitor may point only at the run that selected this exact target.
    -- This prevents a service-side bookkeeping error from showing another
    -- target's evidence activity as this monitor's dispatch result.
    IF NEW.last_research_run_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM public.prospect_research_runs AS run
              INNER JOIN public.prospect_research_run_entities AS selected
                      ON selected.research_run_id = run.id
                     AND selected.tenant_id = run.tenant_id
             WHERE run.id = NEW.last_research_run_id
               AND run.tenant_id = NEW.tenant_id
               AND run.targeting_profile_id = NEW.targeting_profile_id
               AND selected.prospect_entity_id = NEW.prospect_entity_id
       ) THEN
        RAISE EXCEPTION 'target monitor research run does not belong to this target'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

-- Rejected is terminal for a target in the entity-first model. Pausing an
-- existing monitor is safer than allowing a scheduled retry to keep probing a
-- record a reviewer has ruled out.
CREATE OR REPLACE FUNCTION public.pause_prospect_target_monitor_after_rejection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.assessment_state = 'rejected'
       AND OLD.assessment_state IS DISTINCT FROM NEW.assessment_state THEN
        UPDATE public.prospect_target_monitors AS monitor
           SET status = 'paused',
               dispatch_lease_until = NULL,
               last_error_code = 'target_rejected',
               updated_at = NOW()
         WHERE monitor.tenant_id = NEW.tenant_id
           AND monitor.targeting_profile_id = NEW.targeting_profile_id
           AND monitor.prospect_entity_id = NEW.prospect_entity_id
           AND monitor.status = 'active';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prospect_target_monitors_scope_guard ON public.prospect_target_monitors;
CREATE TRIGGER prospect_target_monitors_scope_guard
    BEFORE INSERT OR UPDATE ON public.prospect_target_monitors
    FOR EACH ROW EXECUTE FUNCTION public.guard_prospect_target_monitor_tenant_scope();

DROP TRIGGER IF EXISTS prospect_target_monitors_updated_at ON public.prospect_target_monitors;
CREATE TRIGGER prospect_target_monitors_updated_at
    BEFORE UPDATE ON public.prospect_target_monitors
    FOR EACH ROW EXECUTE FUNCTION public.set_entity_first_prospecting_updated_at();

DROP TRIGGER IF EXISTS prospect_assessments_pause_target_monitor_after_rejection
    ON public.prospect_assessments;
CREATE TRIGGER prospect_assessments_pause_target_monitor_after_rejection
    AFTER UPDATE OF assessment_state ON public.prospect_assessments
    FOR EACH ROW EXECUTE FUNCTION public.pause_prospect_target_monitor_after_rejection();

ALTER TABLE public.prospect_target_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_target_monitor_scheduler_state ENABLE ROW LEVEL SECURITY;

-- Browser reads use the display-safe RPC below. Direct table access would
-- expose scheduler leases and run identifiers that the target desk does not
-- need, so authenticated users receive no table grants.
REVOKE ALL ON TABLE public.prospect_target_monitors FROM authenticated;
REVOKE ALL ON TABLE public.prospect_target_monitor_scheduler_state FROM authenticated;
REVOKE ALL ON TABLE public.prospect_target_monitors FROM PUBLIC;
REVOKE ALL ON TABLE public.prospect_target_monitor_scheduler_state FROM PUBLIC;

-- A tenant member can read only the monitor state for a targeting profile they
-- own. This projection intentionally omits URLs, source locators, errors,
-- scheduler leases, run IDs, and reviewer/user data.
CREATE OR REPLACE FUNCTION public.list_prospect_target_monitor_status_for_profile(
    target_profile_id UUID
)
RETURNS TABLE (
    prospect_entity_id UUID,
    monitor_status TEXT,
    next_refresh_at TIMESTAMPTZ,
    last_dispatched_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    resolved_tenant_id TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication is required to list target monitoring'
            USING ERRCODE = '42501';
    END IF;

    SELECT profile.tenant_id
      INTO resolved_tenant_id
      FROM public.targeting_profiles AS profile
     WHERE profile.id = target_profile_id
       AND EXISTS (
            SELECT 1
              FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = profile.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
       )
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'targeting profile is not available in this workspace'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT monitor.prospect_entity_id,
           monitor.status,
           CASE
             -- A failed broker publish retains the original due timestamp to
             -- preserve its idempotency nonce. Surface the bounded retry time
             -- instead, without exposing the scheduler lease itself.
             WHEN monitor.status = 'active' THEN GREATEST(
                 monitor.next_refresh_at,
                 COALESCE(monitor.dispatch_lease_until, monitor.next_refresh_at)
             )
             ELSE NULL
           END AS next_refresh_at,
           monitor.last_dispatched_at
      FROM public.prospect_target_monitors AS monitor
     WHERE monitor.tenant_id = resolved_tenant_id
       AND monitor.targeting_profile_id = target_profile_id
     ORDER BY monitor.status ASC, monitor.updated_at DESC, monitor.id ASC
     LIMIT 100;
END;
$$;

-- The browser supplies just the assessment ID and an enable/disable boolean.
-- The function derives tenant, profile, and entity under a membership check;
-- it never accepts a URL, handle, query, cadence, source text, contact, or
-- research-run ID from the caller.
CREATE OR REPLACE FUNCTION public.set_prospect_target_monitoring(
    target_assessment_id UUID,
    enabled_input BOOLEAN
)
RETURNS TABLE (
    prospect_entity_id UUID,
    monitor_status TEXT,
    next_refresh_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    resolved_tenant_id TEXT;
    resolved_profile_id UUID;
    resolved_entity_id UUID;
    resolved_entity_kind TEXT;
    resolved_canonical_url TEXT;
    resolved_assessment_state TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication is required to change target monitoring'
            USING ERRCODE = '42501';
    END IF;
    IF enabled_input IS NULL THEN
        RAISE EXCEPTION 'target monitoring input is invalid'
            USING ERRCODE = '22023';
    END IF;

    SELECT assessment.tenant_id,
           assessment.targeting_profile_id,
           assessment.prospect_entity_id,
           assessment.assessment_state,
           entity.entity_kind,
           entity.canonical_url
      INTO resolved_tenant_id,
           resolved_profile_id,
           resolved_entity_id,
           resolved_assessment_state,
           resolved_entity_kind,
           resolved_canonical_url
      FROM public.prospect_assessments AS assessment
      INNER JOIN public.prospect_entities AS entity
              ON entity.id = assessment.prospect_entity_id
             AND entity.tenant_id = assessment.tenant_id
      INNER JOIN public.tenant_users AS tenant_user
              ON tenant_user.tenant_id::TEXT = assessment.tenant_id::TEXT
             AND tenant_user.user_id::TEXT = auth.uid()::TEXT
     WHERE assessment.id = target_assessment_id
     FOR UPDATE OF assessment;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'prospect assessment is not available in this workspace'
            USING ERRCODE = '42501';
    END IF;

    IF resolved_assessment_state = 'rejected' THEN
        RAISE EXCEPTION 'rejected targets cannot be monitored'
            USING ERRCODE = '23514';
    END IF;
    IF NOT public.prospecting_is_supported_retained_monitor_locator(
        resolved_entity_kind,
        resolved_canonical_url
    ) THEN
        RAISE EXCEPTION 'this target does not support retained-public monitoring yet'
            USING ERRCODE = '22023';
    END IF;

    IF enabled_input THEN
        -- A small per-profile cap keeps the separate monitoring quota useful
        -- and prevents background watches from crowding out a customer's
        -- explicit research requests. The advisory lock makes the count and
        -- following upsert safe when two browser tabs enable watches together.
        PERFORM pg_advisory_xact_lock(
            hashtext(
                'prospect-target-monitor:'
                || resolved_tenant_id
                || ':'
                || resolved_profile_id::TEXT
            )
        );
        IF NOT EXISTS (
            SELECT 1
              FROM public.prospect_target_monitors AS existing_monitor
             WHERE existing_monitor.tenant_id = resolved_tenant_id
               AND existing_monitor.targeting_profile_id = resolved_profile_id
               AND existing_monitor.prospect_entity_id = resolved_entity_id
               AND existing_monitor.status = 'active'
        ) AND (
            SELECT count(*) >= 5
              FROM public.prospect_target_monitors AS active_monitor
             WHERE active_monitor.tenant_id = resolved_tenant_id
               AND active_monitor.targeting_profile_id = resolved_profile_id
               AND active_monitor.status = 'active'
        ) THEN
            RAISE EXCEPTION 'a targeting profile may monitor at most five targets'
                USING ERRCODE = '22023';
        END IF;

        RETURN QUERY
        INSERT INTO public.prospect_target_monitors AS monitor (
            tenant_id,
            targeting_profile_id,
            prospect_entity_id,
            status,
            next_refresh_at,
            dispatch_lease_until,
            last_error_code
        )
        VALUES (
            resolved_tenant_id,
            resolved_profile_id,
            resolved_entity_id,
            'active',
            NOW(),
            NULL,
            NULL
        )
        ON CONFLICT (tenant_id, targeting_profile_id, prospect_entity_id)
        DO UPDATE
           SET status = 'active',
               next_refresh_at = CASE
                   WHEN monitor.status = 'paused' THEN NOW()
                   ELSE monitor.next_refresh_at
               END,
               dispatch_lease_until = CASE
                   WHEN monitor.status = 'paused' THEN NULL
                   ELSE monitor.dispatch_lease_until
               END,
               last_error_code = CASE
                   WHEN monitor.status = 'paused' THEN NULL
                   ELSE monitor.last_error_code
               END,
               updated_at = NOW()
        RETURNING monitor.prospect_entity_id, monitor.status, monitor.next_refresh_at;
        RETURN;
    END IF;

    UPDATE public.prospect_target_monitors AS monitor
       SET status = 'paused',
           dispatch_lease_until = NULL,
           last_error_code = NULL,
           updated_at = NOW()
     WHERE monitor.tenant_id = resolved_tenant_id
       AND monitor.targeting_profile_id = resolved_profile_id
       AND monitor.prospect_entity_id = resolved_entity_id
    RETURNING monitor.prospect_entity_id, monitor.status, NULL::TIMESTAMPTZ
      INTO prospect_entity_id, monitor_status, next_refresh_at;

    IF FOUND THEN
        RETURN NEXT;
        RETURN;
    END IF;

    prospect_entity_id = resolved_entity_id;
    monitor_status = 'paused';
    next_refresh_at = NULL;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.prospecting_is_supported_retained_monitor_locator(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_prospect_target_monitor_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pause_prospect_target_monitor_after_rejection() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_prospect_target_monitor_status_for_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_prospect_target_monitoring(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_prospect_target_monitor_status_for_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_prospect_target_monitoring(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
