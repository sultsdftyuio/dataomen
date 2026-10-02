-- Apply after assisted_prospect_delivery_contract.sql. This is a private
-- research queue. Imported accounts are never customer-facing deliveries.
CREATE TABLE IF NOT EXISTS public.assisted_account_suppressions (
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    source_key TEXT NOT NULL,
    suppressed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cleared_at TIMESTAMPTZ,
    PRIMARY KEY (tenant_id, domain),
    CONSTRAINT assisted_suppression_domain_check CHECK (
        char_length(domain) BETWEEN 4 AND 253
        AND domain ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
        AND position('.' IN domain) > 0
        AND domain !~ '^[0-9.]+$'
    ),
    CONSTRAINT assisted_suppression_reason_check CHECK (reason_code IN
        ('existing_customer', 'active_opportunity', 'do_not_contact',
         'competitor', 'already_contacted', 'customer_excluded')),
    CONSTRAINT assisted_suppression_source_check CHECK
        (char_length(btrim(source_key)) BETWEEN 1 AND 120),
    CONSTRAINT assisted_suppression_clear_check CHECK
        (cleared_at IS NULL OR cleared_at >= suppressed_at)
);

CREATE OR REPLACE FUNCTION public.lock_assisted_account_suppression()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.domain IS DISTINCT FROM OLD.domain
    ) THEN
        RAISE EXCEPTION 'suppression account identity is immutable'
            USING ERRCODE = '23514';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id), hashtext(NEW.domain));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_assisted_account_suppression ON public.assisted_account_suppressions;
CREATE TRIGGER lock_assisted_account_suppression
    BEFORE INSERT OR UPDATE ON public.assisted_account_suppressions
    FOR EACH ROW EXECUTE FUNCTION public.lock_assisted_account_suppression();

-- Source approval is a staff decision backed by an external rights record.
-- The import cannot self-approve by supplying a free-form reference.
CREATE TABLE IF NOT EXISTS public.assisted_source_approvals (
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    source_key TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    approval_ref TEXT NOT NULL,
    max_retention_days INTEGER NOT NULL,
    approval_status TEXT NOT NULL DEFAULT 'active',
    approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, source_key),
    CONSTRAINT assisted_source_key_check CHECK
        (source_key ~ '^[a-z0-9][a-z0-9_-]{0,119}$'),
    CONSTRAINT assisted_source_kind_check CHECK
        (source_kind IN ('customer_owned', 'licensed_provider', 'approved_directory', 'manual_research')),
    CONSTRAINT assisted_source_approval_ref_check CHECK
        (public.prospecting_is_safe_evidence_summary(approval_ref)),
    CONSTRAINT assisted_source_retention_check CHECK
        (max_retention_days BETWEEN 1 AND 89),
    CONSTRAINT assisted_source_status_check CHECK
        (approval_status IN ('active', 'revoked')),
    CONSTRAINT assisted_source_validity_check CHECK (valid_until > approved_at)
);

CREATE TABLE IF NOT EXISTS public.assisted_prospect_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    targeting_profile_id UUID NOT NULL,
    targeting_profile_version INTEGER NOT NULL CHECK (targeting_profile_version >= 1),
    prospect_entity_id UUID NOT NULL,
    domain TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unreviewed',
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT assisted_candidate_status_check CHECK
        (status IN ('unreviewed', 'researching', 'rejected', 'delivered')),
    CONSTRAINT assisted_candidate_unique_entity_revision UNIQUE
        (tenant_id, targeting_profile_id, targeting_profile_version, prospect_entity_id),
    CONSTRAINT assisted_candidate_unique_domain_revision UNIQUE
        (tenant_id, targeting_profile_id, targeting_profile_version, domain),
    CONSTRAINT assisted_candidate_tenant_id_id_unique UNIQUE (tenant_id, id),
    CONSTRAINT assisted_candidate_tenant_profile_fk FOREIGN KEY (tenant_id, targeting_profile_id)
        REFERENCES public.targeting_profiles(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT assisted_candidate_tenant_entity_fk FOREIGN KEY (tenant_id, prospect_entity_id)
        REFERENCES public.prospect_entities(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS assisted_candidates_queue_idx
    ON public.assisted_prospect_candidates
       (tenant_id, targeting_profile_id, targeting_profile_version, status, first_seen_at, id);

CREATE TABLE IF NOT EXISTS public.assisted_candidate_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL,
    observation_key TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_key TEXT NOT NULL,
    source_url TEXT,
    rights_approval_ref TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    retention_expires_at TIMESTAMPTZ NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT assisted_observation_key_check CHECK (observation_key ~ '^[a-f0-9]{64}$'),
    CONSTRAINT assisted_observation_source_kind_check CHECK
        (source_kind IN ('customer_owned', 'licensed_provider', 'approved_directory', 'manual_research')),
    CONSTRAINT assisted_observation_source_key_check CHECK
        (char_length(btrim(source_key)) BETWEEN 1 AND 120),
    CONSTRAINT assisted_observation_source_url_check CHECK
        (source_url IS NULL OR public.prospecting_is_valid_public_http_url(source_url)),
    CONSTRAINT assisted_observation_listing_url_check CHECK
        (source_kind NOT IN ('approved_directory', 'manual_research') OR source_url IS NOT NULL),
    CONSTRAINT assisted_observation_rights_check CHECK
        (public.prospecting_is_safe_evidence_summary(rights_approval_ref)),
    CONSTRAINT assisted_observation_retention_check CHECK (
        retention_expires_at > observed_at
        AND retention_expires_at <= observed_at + INTERVAL '90 days'
    ),
    CONSTRAINT assisted_observation_unique_key UNIQUE (tenant_id, candidate_id, observation_key),
    CONSTRAINT assisted_observation_tenant_candidate_fk FOREIGN KEY (tenant_id, candidate_id)
        REFERENCES public.assisted_prospect_candidates(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT assisted_observation_tenant_source_fk FOREIGN KEY (tenant_id, source_key)
        REFERENCES public.assisted_source_approvals(tenant_id, source_key)
);

CREATE INDEX IF NOT EXISTS assisted_observations_candidate_idx
    ON public.assisted_candidate_observations(tenant_id, candidate_id, imported_at DESC);

CREATE OR REPLACE FUNCTION public.purge_assisted_candidate_observations(batch_size INTEGER DEFAULT 200)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    IF batch_size IS NULL OR batch_size < 1 OR batch_size > 500 THEN
        RAISE EXCEPTION 'invalid purge batch size' USING ERRCODE = '22023';
    END IF;
    WITH doomed AS (
        SELECT observation.id
          FROM public.assisted_candidate_observations observation
          JOIN public.assisted_source_approvals approval
            ON approval.tenant_id = observation.tenant_id
           AND approval.source_key = observation.source_key
         WHERE observation.retention_expires_at <= NOW()
            OR approval.approval_status = 'revoked'
            OR approval.valid_until <= NOW()
            OR approval.source_kind <> observation.source_kind
            OR approval.approval_ref <> observation.rights_approval_ref
         ORDER BY observation.retention_expires_at, observation.id
         LIMIT batch_size
         FOR UPDATE OF observation SKIP LOCKED
    )
    DELETE FROM public.assisted_candidate_observations observation
     USING doomed WHERE observation.id = doomed.id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

ALTER TABLE public.assisted_prospect_rejections
    ADD COLUMN IF NOT EXISTS candidate_id UUID;
ALTER TABLE public.assisted_prospect_deliveries
    ADD COLUMN IF NOT EXISTS candidate_id UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assisted_rejection_tenant_candidate_fk'
          AND conrelid = 'public.assisted_prospect_rejections'::regclass
    ) THEN
        ALTER TABLE public.assisted_prospect_rejections
            ADD CONSTRAINT assisted_rejection_tenant_candidate_fk
            FOREIGN KEY (tenant_id, candidate_id)
            REFERENCES public.assisted_prospect_candidates(tenant_id, id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'assisted_delivery_tenant_candidate_fk'
          AND conrelid = 'public.assisted_prospect_deliveries'::regclass
    ) THEN
        ALTER TABLE public.assisted_prospect_deliveries
            ADD CONSTRAINT assisted_delivery_tenant_candidate_fk
            FOREIGN KEY (tenant_id, candidate_id)
            REFERENCES public.assisted_prospect_candidates(tenant_id, id);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_assisted_rejection_candidate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.candidate_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.assisted_prospect_candidates c
         WHERE c.id = NEW.candidate_id AND c.tenant_id = NEW.tenant_id
           AND c.targeting_profile_id = NEW.targeting_profile_id
           AND c.targeting_profile_version = NEW.targeting_profile_version
           AND c.status <> 'delivered'
    ) THEN
        RAISE EXCEPTION 'rejection candidate is outside this brief or already delivered'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_assisted_rejection_candidate ON public.assisted_prospect_rejections;
CREATE TRIGGER guard_assisted_rejection_candidate
    BEFORE INSERT ON public.assisted_prospect_rejections
    FOR EACH ROW EXECUTE FUNCTION public.guard_assisted_rejection_candidate();

CREATE OR REPLACE FUNCTION public.mark_assisted_candidate_rejected()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.candidate_id IS NOT NULL THEN
        UPDATE public.assisted_prospect_candidates
           SET status = CASE
               WHEN NEW.reason_code IN ('missing_route', 'unclear_identity',
                   'fit_unverified', 'source_temporarily_unavailable')
               THEN 'researching' ELSE 'rejected' END
         WHERE id = NEW.candidate_id AND tenant_id = NEW.tenant_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mark_assisted_candidate_rejected ON public.assisted_prospect_rejections;
CREATE TRIGGER mark_assisted_candidate_rejected
    AFTER INSERT ON public.assisted_prospect_rejections
    FOR EACH ROW EXECUTE FUNCTION public.mark_assisted_candidate_rejected();

CREATE OR REPLACE FUNCTION public.guard_assisted_candidate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.targeting_profile_id IS DISTINCT FROM OLD.targeting_profile_id
           OR NEW.targeting_profile_version IS DISTINCT FROM OLD.targeting_profile_version
           OR NEW.prospect_entity_id IS DISTINCT FROM OLD.prospect_entity_id
           OR NEW.domain IS DISTINCT FROM OLD.domain
           OR NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at THEN
            RAISE EXCEPTION 'candidate identity and brief revision are immutable'
                USING ERRCODE = '23514';
        END IF;
        NEW.updated_at = NOW();
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.targeting_profiles p
        JOIN public.assisted_prospect_pilots pilot ON pilot.tenant_id = p.tenant_id
         WHERE p.id = NEW.targeting_profile_id AND p.tenant_id = NEW.tenant_id
           AND p.profile_version = NEW.targeting_profile_version
           AND p.approval_status = 'approved'
           AND pilot.pilot_status = 'active' AND pilot.access_expires_at > NOW()
    ) THEN
        RAISE EXCEPTION 'candidate requires current approved brief and active pilot'
            USING ERRCODE = '23514';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id), hashtext(NEW.domain));
    IF NOT EXISTS (
        SELECT 1 FROM public.prospect_entities e
         WHERE e.id = NEW.prospect_entity_id AND e.tenant_id = NEW.tenant_id
           AND e.entity_kind = 'account' AND e.entity_provider = 'assisted_account'
           AND e.entity_external_id = NEW.domain
    ) THEN
        RAISE EXCEPTION 'candidate requires a matching assisted account identity'
            USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.assisted_account_suppressions s
         WHERE s.tenant_id = NEW.tenant_id AND s.domain = NEW.domain
           AND s.cleared_at IS NULL
    ) THEN
        RAISE EXCEPTION 'candidate account is suppressed'
            USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.assisted_prospect_deliveries d
         WHERE d.tenant_id = NEW.tenant_id AND d.prospect_entity_id = NEW.prospect_entity_id
           AND d.delivered_at >= NOW() - INTERVAL '90 days'
    ) THEN
        RAISE EXCEPTION 'candidate account was recently delivered'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_assisted_candidate ON public.assisted_prospect_candidates;
CREATE TRIGGER guard_assisted_candidate
    BEFORE INSERT OR UPDATE ON public.assisted_prospect_candidates
    FOR EACH ROW EXECUTE FUNCTION public.guard_assisted_candidate();

CREATE OR REPLACE FUNCTION public.guard_assisted_candidate_observation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
           OR NEW.observation_key IS DISTINCT FROM OLD.observation_key
           OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
           OR NEW.source_key IS DISTINCT FROM OLD.source_key
           OR NEW.source_url IS DISTINCT FROM OLD.source_url
           OR NEW.imported_at IS DISTINCT FROM OLD.imported_at THEN
            RAISE EXCEPTION 'source observation identity is immutable'
                USING ERRCODE = '23514';
        END IF;
        NEW.observed_at = GREATEST(OLD.observed_at, NEW.observed_at);
        NEW.retention_expires_at = GREATEST(OLD.retention_expires_at, NEW.retention_expires_at);
    END IF;
    IF NEW.observed_at > NOW() THEN
        RAISE EXCEPTION 'source observation date cannot be in the future'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.assisted_source_approvals source
         WHERE source.tenant_id = NEW.tenant_id AND source.source_key = NEW.source_key
           AND source.source_kind = NEW.source_kind
           AND source.approval_ref = NEW.rights_approval_ref
           AND source.approval_status = 'active' AND source.valid_until > NOW()
           AND NEW.retention_expires_at <= NEW.observed_at
               + source.max_retention_days * INTERVAL '1 day'
    ) THEN
        RAISE EXCEPTION 'source is not approved for this use and retention window'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_assisted_candidate_observation ON public.assisted_candidate_observations;
CREATE TRIGGER guard_assisted_candidate_observation
    BEFORE INSERT OR UPDATE ON public.assisted_candidate_observations
    FOR EACH ROW EXECUTE FUNCTION public.guard_assisted_candidate_observation();

-- Suppression protects publication even when a candidate was queued earlier.
CREATE OR REPLACE FUNCTION public.guard_assisted_delivery_suppression()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
    entity_kind TEXT;
    entity_provider TEXT;
    entity_domain TEXT;
BEGIN
    SELECT e.entity_kind, e.entity_provider, e.entity_external_id
      INTO entity_kind, entity_provider, entity_domain
      FROM public.prospect_entities e
     WHERE e.id = NEW.prospect_entity_id AND e.tenant_id = NEW.tenant_id;
    IF entity_kind = 'account' THEN
        PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id), hashtext(entity_domain));
        IF entity_provider <> 'assisted_account' OR NEW.candidate_id IS NULL
           OR NOT EXISTS (
               SELECT 1 FROM public.assisted_prospect_candidates c
               JOIN public.assisted_candidate_observations observation
                 ON observation.tenant_id = c.tenant_id AND observation.candidate_id = c.id
               JOIN public.assisted_source_approvals approval
                 ON approval.tenant_id = observation.tenant_id
                AND approval.source_key = observation.source_key
                WHERE c.id = NEW.candidate_id AND c.tenant_id = NEW.tenant_id
                  AND c.targeting_profile_id = NEW.targeting_profile_id
                  AND c.targeting_profile_version = NEW.targeting_profile_version
                  AND c.prospect_entity_id = NEW.prospect_entity_id
                  AND c.status IN ('unreviewed', 'researching')
                  AND observation.retention_expires_at > NOW()
                  AND observation.retention_expires_at >= NEW.display_expires_at
                  AND approval.approval_status = 'active' AND approval.valid_until > NOW()
                  AND approval.valid_until >= NEW.display_expires_at
                  AND approval.source_kind = observation.source_kind
                  AND approval.approval_ref = observation.rights_approval_ref
           ) THEN
            RAISE EXCEPTION 'account delivery requires a current approved candidate source'
                USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.candidate_id IS NOT NULL THEN
        RAISE EXCEPTION 'only account deliveries may reference an account candidate'
            USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.prospect_entities e
        JOIN public.assisted_account_suppressions s
          ON s.tenant_id = e.tenant_id AND s.domain = e.entity_external_id
         WHERE e.id = NEW.prospect_entity_id AND e.tenant_id = NEW.tenant_id
           AND e.entity_kind = 'account' AND e.entity_provider = 'assisted_account'
           AND s.cleared_at IS NULL
    ) THEN
        RAISE EXCEPTION 'suppressed account cannot be delivered'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_assisted_delivery_suppression ON public.assisted_prospect_deliveries;
CREATE TRIGGER guard_assisted_delivery_suppression
    BEFORE INSERT ON public.assisted_prospect_deliveries
    FOR EACH ROW EXECUTE FUNCTION public.guard_assisted_delivery_suppression();

CREATE OR REPLACE FUNCTION public.mark_assisted_candidate_delivered()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE public.assisted_prospect_candidates
       SET status = 'delivered', last_seen_at = GREATEST(last_seen_at, NEW.delivered_at)
     WHERE id = NEW.candidate_id AND tenant_id = NEW.tenant_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mark_assisted_candidate_delivered ON public.assisted_prospect_deliveries;
CREATE TRIGGER mark_assisted_candidate_delivered
    AFTER INSERT ON public.assisted_prospect_deliveries
    FOR EACH ROW EXECUTE FUNCTION public.mark_assisted_candidate_delivered();

-- A withdrawn, expired, revoked, or newly suppressed account cannot keep its card visible.
-- Historical account deliveries without a candidate ID are hidden by this gate.
CREATE OR REPLACE FUNCTION public.assisted_candidate_has_current_source(
    target_tenant_id TEXT, target_candidate_id UUID
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.assisted_prospect_candidates candidate
        JOIN public.assisted_candidate_observations observation
          ON observation.tenant_id = candidate.tenant_id
         AND observation.candidate_id = candidate.id
        JOIN public.assisted_source_approvals approval
          ON approval.tenant_id = observation.tenant_id
         AND approval.source_key = observation.source_key
         WHERE candidate.tenant_id = target_tenant_id
           AND candidate.id = target_candidate_id
           AND NOT EXISTS (
               SELECT 1 FROM public.assisted_account_suppressions suppression
                WHERE suppression.tenant_id = candidate.tenant_id
                  AND suppression.domain = candidate.domain
                  AND suppression.cleared_at IS NULL
           )
           AND observation.retention_expires_at > NOW()
           AND approval.approval_status = 'active' AND approval.valid_until > NOW()
           AND approval.source_kind = observation.source_kind
           AND approval.approval_ref = observation.rights_approval_ref
    );
$$;

CREATE OR REPLACE FUNCTION public.list_assisted_prospect_deliveries(target_profile_id UUID)
RETURNS TABLE (
    id UUID, entity_id UUID, entity_kind TEXT, entity_title TEXT, entity_url TEXT,
    tier TEXT, fit_summary TEXT, fit_source_url TEXT, buyer_role TEXT, angle TEXT,
    uncertainty_summary TEXT,
    signal_summary TEXT, signal_source_url TEXT, signal_date DATE,
    contact_route_type TEXT, contact_route_url TEXT, source_checked_at TIMESTAMPTZ,
    route_checked_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, my_verdict TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.targeting_profiles p
        WHERE p.id = target_profile_id AND p.approval_status = 'approved'
          AND public.assisted_prospect_pilot_has_access(p.tenant_id)
    ) THEN
        RAISE EXCEPTION 'pilot is not available for this targeting profile' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT d.id, e.id, e.entity_kind, e.title, e.canonical_url,
           d.tier, d.fit_summary, d.fit_source_url, d.buyer_role, d.angle,
           d.uncertainty_summary,
           d.signal_summary, d.signal_source_url, d.signal_date,
           d.contact_route_type, d.contact_route_url, d.source_checked_at,
           d.route_checked_at, d.delivered_at, f.verdict
      FROM public.assisted_prospect_deliveries d
      JOIN public.targeting_profiles p ON p.id = d.targeting_profile_id
          AND p.tenant_id = d.tenant_id AND p.profile_version = d.targeting_profile_version
      JOIN public.prospect_entities e ON e.id = d.prospect_entity_id AND e.tenant_id = d.tenant_id
      LEFT JOIN LATERAL (
          SELECT event.verdict FROM public.assisted_prospect_feedback event
           WHERE event.delivery_id = d.id AND event.tenant_id = d.tenant_id
             AND event.user_id = auth.uid()::TEXT
           ORDER BY event.created_at DESC, event.id DESC LIMIT 1
      ) f ON TRUE
     WHERE d.targeting_profile_id = target_profile_id AND d.withdrawn_at IS NULL
       AND d.display_expires_at > NOW()
       AND (e.entity_kind <> 'account'
            OR public.assisted_candidate_has_current_source(d.tenant_id, d.candidate_id))
     ORDER BY d.delivered_at DESC, d.id DESC
     LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_assisted_prospect_feedback(
    target_delivery_id UUID, target_verdict TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    matched_tenant TEXT;
    latest_verdict TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    IF target_verdict NOT IN
        ('worth_contacting', 'wrong_fit', 'already_known', 'no_route', 'bad_evidence', 'not_now', 'contacted', 'meeting') THEN
        RAISE EXCEPTION 'invalid prospect verdict' USING ERRCODE = '22023';
    END IF;
    SELECT d.tenant_id INTO matched_tenant
      FROM public.assisted_prospect_deliveries d
      JOIN public.targeting_profiles p ON p.id = d.targeting_profile_id
          AND p.tenant_id = d.tenant_id AND p.profile_version = d.targeting_profile_version
      JOIN public.prospect_entities e ON e.id = d.prospect_entity_id AND e.tenant_id = d.tenant_id
     WHERE d.id = target_delivery_id AND d.withdrawn_at IS NULL
       AND d.display_expires_at > NOW()
       AND p.approval_status = 'approved'
       AND public.assisted_prospect_pilot_has_access(d.tenant_id)
       AND (e.entity_kind <> 'account'
            OR public.assisted_candidate_has_current_source(d.tenant_id, d.candidate_id));
    IF NOT FOUND THEN
        RAISE EXCEPTION 'prospect is not available in this workspace' USING ERRCODE = '42501';
    END IF;
    SELECT event.verdict INTO latest_verdict
      FROM public.assisted_prospect_feedback event
     WHERE event.tenant_id = matched_tenant AND event.delivery_id = target_delivery_id
       AND event.user_id = auth.uid()::TEXT
     ORDER BY event.created_at DESC, event.id DESC LIMIT 1;
    IF latest_verdict IS DISTINCT FROM target_verdict THEN
        INSERT INTO public.assisted_prospect_feedback(tenant_id, delivery_id, user_id, verdict)
        VALUES (matched_tenant, target_delivery_id, auth.uid()::TEXT, target_verdict);
    END IF;
    RETURN TRUE;
END;
$$;

ALTER TABLE public.assisted_account_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assisted_source_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assisted_prospect_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assisted_candidate_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assisted_account_suppressions FROM PUBLIC;
REVOKE ALL ON public.assisted_source_approvals FROM PUBLIC;
REVOKE ALL ON public.assisted_prospect_candidates FROM PUBLIC;
REVOKE ALL ON public.assisted_candidate_observations FROM PUBLIC;
REVOKE ALL ON public.assisted_account_suppressions FROM anon, authenticated;
REVOKE ALL ON public.assisted_source_approvals FROM anon, authenticated;
REVOKE ALL ON public.assisted_prospect_candidates FROM anon, authenticated;
REVOKE ALL ON public.assisted_candidate_observations FROM anon, authenticated;
REVOKE ALL ON public.assisted_source_approvals FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.assisted_account_suppressions TO service_role;
GRANT SELECT ON public.assisted_source_approvals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assisted_prospect_candidates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assisted_candidate_observations TO service_role;
GRANT DELETE ON public.assisted_prospect_rejections TO service_role;
REVOKE ALL ON FUNCTION public.guard_assisted_candidate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_assisted_account_suppression() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_assisted_candidate_observation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_assisted_rejection_candidate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_assisted_candidate_rejected() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_assisted_delivery_suppression() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_assisted_candidate_delivered() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assisted_candidate_has_current_source(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_assisted_prospect_deliveries(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_assisted_prospect_feedback(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_assisted_prospect_deliveries(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_assisted_prospect_feedback(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.purge_assisted_candidate_observations(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_assisted_candidate_observations(INTEGER) TO service_role;
