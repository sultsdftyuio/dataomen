-- Candidate-first discovery-pool contract.
--
-- Apply after scripts/prospect_intelligence_contract.sql and
-- scripts/hn_source_posts_global_contract.sql.  This is intentionally
-- additive: lead_matches remains the verifier-owned qualified-lead workflow,
-- while this contract retains broad, tenant-scoped discovery candidates before
-- verification decides whether they are leads.
--
-- Public-post candidates reference the global source_posts UUID.  The foreign
-- key cascades deletion so public-data removal and retention delete every
-- tenant snapshot derived from the removed source material.  Account and
-- contact candidates are provider-neutral extension points; they have a
-- stable provider/external identity but do not require an external provider
-- integration in this migration.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.discovery_runs') IS NULL
       OR to_regclass('public.service_profiles') IS NULL
       OR to_regclass('public.source_posts') IS NULL
       OR to_regclass('public.tenant_users') IS NULL THEN
        RAISE EXCEPTION
            'discovery_candidate_pool_contract requires prospect intelligence and global public-source contracts';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.discovery_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    service_profile_id UUID NOT NULL,
    first_discovery_run_id UUID NOT NULL,
    last_discovery_run_id UUID NOT NULL,

    -- The candidate subject. `public_post` is implemented now; `account` and
    -- `contact` provide a provider-neutral identity for later enrichment.
    candidate_kind TEXT NOT NULL DEFAULT 'public_post',
    entity_provider TEXT NOT NULL,
    entity_external_id TEXT NOT NULL,
    entity_url TEXT,

    -- The first source that produced this candidate.  For a public post the
    -- source fields and entity identity must agree with the referenced global
    -- source_posts row; source_post_id is the database UUID, not a provider ID.
    source TEXT NOT NULL,
    source_external_id TEXT NOT NULL,
    source_post_id UUID REFERENCES public.source_posts(id) ON DELETE CASCADE,

    -- A worker-computed SHA-256 of candidate_kind/provider/external identity.
    -- It makes retries deterministic without exposing tenant data in an index.
    dedupe_key TEXT NOT NULL,
    candidate_status TEXT NOT NULL DEFAULT 'raw',

    raw_score DOUBLE PRECISION,
    plausibility_score DOUBLE PRECISION,
    similarity_score DOUBLE PRECISION,
    verifier_score DOUBLE PRECISION,
    priority_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    score_components JSONB NOT NULL DEFAULT '{}'::JSONB,

    -- source_snapshot can include public source text needed for tenant review.
    -- It is intentionally tied to source_post_id for public posts so retention
    -- and verified removal requests erase the snapshot with the source row.
    source_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    evidence JSONB NOT NULL DEFAULT '{}'::JSONB,

    decision_by TEXT,
    decision_reason TEXT,
    decision_at TIMESTAMPTZ,
    qualified_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT discovery_candidates_kind_check
        CHECK (candidate_kind IN ('public_post', 'account', 'contact')),
    CONSTRAINT discovery_candidates_entity_provider_check
        CHECK (char_length(btrim(entity_provider)) BETWEEN 1 AND 120),
    CONSTRAINT discovery_candidates_entity_external_id_check
        CHECK (char_length(btrim(entity_external_id)) BETWEEN 1 AND 512),
    CONSTRAINT discovery_candidates_entity_url_check
        CHECK (entity_url IS NULL OR entity_url ~* '^https?://[^[:space:]]+$'),
    CONSTRAINT discovery_candidates_source_check
        CHECK (char_length(btrim(source)) BETWEEN 1 AND 120),
    CONSTRAINT discovery_candidates_source_external_id_check
        CHECK (char_length(btrim(source_external_id)) BETWEEN 1 AND 512),
    CONSTRAINT discovery_candidates_public_post_source_check
        CHECK (candidate_kind <> 'public_post' OR source_post_id IS NOT NULL),
    CONSTRAINT discovery_candidates_dedupe_key_check
        CHECK (dedupe_key ~ '^[0-9a-f]{64}$'),
    CONSTRAINT discovery_candidates_status_check
        CHECK (candidate_status IN ('raw', 'plausible', 'review', 'qualified', 'rejected')),
    CONSTRAINT discovery_candidates_score_check
        CHECK (
            (raw_score IS NULL OR raw_score BETWEEN 0 AND 1)
            AND (plausibility_score IS NULL OR plausibility_score BETWEEN 0 AND 1)
            AND (similarity_score IS NULL OR similarity_score BETWEEN 0 AND 1)
            AND (verifier_score IS NULL OR verifier_score BETWEEN 0 AND 1)
            AND priority_score BETWEEN 0 AND 100
        ),
    CONSTRAINT discovery_candidates_json_check
        CHECK (
            jsonb_typeof(score_components) = 'object'
            AND jsonb_typeof(source_snapshot) = 'object'
            AND jsonb_typeof(evidence) = 'object'
        ),
    CONSTRAINT discovery_candidates_terminal_decision_check
        CHECK (
            (
                candidate_status IN ('raw', 'plausible', 'review')
                AND decision_by IS NULL
                AND decision_reason IS NULL
                AND decision_at IS NULL
                AND qualified_at IS NULL
                AND rejected_at IS NULL
            )
            OR (
                candidate_status = 'qualified'
                AND decision_at IS NOT NULL
                AND qualified_at IS NOT NULL
                AND rejected_at IS NULL
            )
            OR (
                candidate_status = 'rejected'
                AND decision_at IS NOT NULL
                AND rejected_at IS NOT NULL
                AND qualified_at IS NULL
            )
        )
);

-- One canonical candidate is retained per workspace/profile/subject.  Query
-- and run provenance deliberately lives in discovery_candidate_observations,
-- allowing the same candidate to be found by multiple queries and runs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_candidates_tenant_profile_dedupe
    ON public.discovery_candidates(tenant_id, service_profile_id, dedupe_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_candidates_tenant_profile_source_post
    ON public.discovery_candidates(tenant_id, service_profile_id, source_post_id)
    WHERE source_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_tenant_profile_status_priority
    ON public.discovery_candidates(
        tenant_id,
        service_profile_id,
        candidate_status,
        priority_score DESC,
        last_seen_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_tenant_run_last_seen
    ON public.discovery_candidates(tenant_id, last_discovery_run_id, last_seen_at DESC);

-- Composite keys make every profile/run relationship tenant-scoped even for
-- trusted database roles.  Existing prospect-intelligence deployments already
-- have the first two keys; the guards make this migration re-applicable.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'uq_service_profiles_tenant_id_id'
           AND conrelid = 'public.service_profiles'::regclass
    ) THEN
        ALTER TABLE public.service_profiles
            ADD CONSTRAINT uq_service_profiles_tenant_id_id UNIQUE (tenant_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'uq_discovery_runs_tenant_id_id'
           AND conrelid = 'public.discovery_runs'::regclass
    ) THEN
        ALTER TABLE public.discovery_runs
            ADD CONSTRAINT uq_discovery_runs_tenant_id_id UNIQUE (tenant_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'uq_discovery_candidates_tenant_id_id'
           AND conrelid = 'public.discovery_candidates'::regclass
    ) THEN
        ALTER TABLE public.discovery_candidates
            ADD CONSTRAINT uq_discovery_candidates_tenant_id_id UNIQUE (tenant_id, id);
    END IF;
END;
$$;

ALTER TABLE public.discovery_candidates
    DROP CONSTRAINT IF EXISTS fk_discovery_candidates_tenant_profile;
ALTER TABLE public.discovery_candidates
    ADD CONSTRAINT fk_discovery_candidates_tenant_profile
    FOREIGN KEY (tenant_id, service_profile_id)
    REFERENCES public.service_profiles (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE public.discovery_candidates
    DROP CONSTRAINT IF EXISTS fk_discovery_candidates_tenant_first_run;
ALTER TABLE public.discovery_candidates
    ADD CONSTRAINT fk_discovery_candidates_tenant_first_run
    FOREIGN KEY (tenant_id, first_discovery_run_id)
    REFERENCES public.discovery_runs (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE public.discovery_candidates
    DROP CONSTRAINT IF EXISTS fk_discovery_candidates_tenant_last_run;
ALTER TABLE public.discovery_candidates
    ADD CONSTRAINT fk_discovery_candidates_tenant_last_run
    FOREIGN KEY (tenant_id, last_discovery_run_id)
    REFERENCES public.discovery_runs (tenant_id, id)
    ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.discovery_candidate_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL,
    discovery_run_id UUID NOT NULL,
    source TEXT NOT NULL,
    source_post_id UUID REFERENCES public.source_posts(id) ON DELETE CASCADE,
    query_type TEXT NOT NULL,
    query_phrase TEXT NOT NULL,
    query_hash TEXT NOT NULL,
    observation_scores JSONB NOT NULL DEFAULT '{}'::JSONB,
    evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    observation_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT discovery_candidate_observations_source_check
        CHECK (char_length(btrim(source)) BETWEEN 1 AND 120),
    CONSTRAINT discovery_candidate_observations_query_type_check
        CHECK (char_length(btrim(query_type)) BETWEEN 1 AND 120),
    CONSTRAINT discovery_candidate_observations_query_phrase_check
        CHECK (char_length(btrim(query_phrase)) BETWEEN 1 AND 512),
    CONSTRAINT discovery_candidate_observations_query_hash_check
        CHECK (query_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT discovery_candidate_observations_count_check
        CHECK (observation_count >= 1),
    CONSTRAINT discovery_candidate_observations_json_check
        CHECK (
            jsonb_typeof(observation_scores) = 'object'
            AND jsonb_typeof(evidence) = 'object'
        )
);

ALTER TABLE public.discovery_candidate_observations
    DROP CONSTRAINT IF EXISTS fk_discovery_candidate_observations_tenant_candidate;
ALTER TABLE public.discovery_candidate_observations
    ADD CONSTRAINT fk_discovery_candidate_observations_tenant_candidate
    FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES public.discovery_candidates (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.discovery_candidate_observations
    DROP CONSTRAINT IF EXISTS fk_discovery_candidate_observations_tenant_run;
ALTER TABLE public.discovery_candidate_observations
    ADD CONSTRAINT fk_discovery_candidate_observations_tenant_run
    FOREIGN KEY (tenant_id, discovery_run_id)
    REFERENCES public.discovery_runs (tenant_id, id)
    ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_candidate_observations_dedupe
    ON public.discovery_candidate_observations(
        tenant_id,
        candidate_id,
        discovery_run_id,
        source,
        query_hash
    );
CREATE INDEX IF NOT EXISTS idx_discovery_candidate_observations_tenant_run_observed
    ON public.discovery_candidate_observations(tenant_id, discovery_run_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_candidate_observations_tenant_candidate_observed
    ON public.discovery_candidate_observations(tenant_id, candidate_id, observed_at DESC);

CREATE OR REPLACE FUNCTION public.set_discovery_candidate_pool_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_discovery_candidate_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    source_row_source TEXT;
    source_row_external_id TEXT;
    source_row_tenant_id TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.service_profile_id IS DISTINCT FROM OLD.service_profile_id
           OR NEW.first_discovery_run_id IS DISTINCT FROM OLD.first_discovery_run_id
           OR NEW.candidate_kind IS DISTINCT FROM OLD.candidate_kind
           OR NEW.entity_provider IS DISTINCT FROM OLD.entity_provider
           OR NEW.entity_external_id IS DISTINCT FROM OLD.entity_external_id
           OR NEW.entity_url IS DISTINCT FROM OLD.entity_url
           OR NEW.source IS DISTINCT FROM OLD.source
           OR NEW.source_external_id IS DISTINCT FROM OLD.source_external_id
           OR NEW.source_post_id IS DISTINCT FROM OLD.source_post_id
           OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
           OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
           OR NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       ) THEN
        RAISE EXCEPTION 'discovery candidate identity and source snapshot are immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.service_profiles AS profile
         WHERE profile.id = NEW.service_profile_id
           AND profile.tenant_id = NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'service profile does not belong to discovery candidate tenant'
            USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.discovery_runs AS run
         WHERE run.id = NEW.first_discovery_run_id
           AND run.tenant_id = NEW.tenant_id
           AND run.service_profile_id = NEW.service_profile_id
    ) THEN
        RAISE EXCEPTION 'first discovery run does not belong to discovery candidate profile'
            USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.discovery_runs AS run
         WHERE run.id = NEW.last_discovery_run_id
           AND run.tenant_id = NEW.tenant_id
           AND run.service_profile_id = NEW.service_profile_id
    ) THEN
        RAISE EXCEPTION 'last discovery run does not belong to discovery candidate profile'
            USING ERRCODE = '23503';
    END IF;

    IF NEW.candidate_kind = 'public_post' AND NEW.source_post_id IS NULL THEN
        RAISE EXCEPTION 'public-post candidate requires a global source post UUID'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.source_post_id IS NOT NULL THEN
        SELECT post.source, post.source_post_id, post.tenant_id
          INTO source_row_source, source_row_external_id, source_row_tenant_id
          FROM public.source_posts AS post
         WHERE post.id = NEW.source_post_id;

        IF NOT FOUND OR source_row_tenant_id IS NOT NULL THEN
            RAISE EXCEPTION 'candidate source post must be a global public source row'
                USING ERRCODE = '23503';
        END IF;

        IF source_row_source IS DISTINCT FROM NEW.source
           OR source_row_external_id IS DISTINCT FROM NEW.source_external_id THEN
            RAISE EXCEPTION 'candidate source provenance does not match source post'
                USING ERRCODE = '23503';
        END IF;

        IF NEW.candidate_kind = 'public_post'
           AND (
               NEW.entity_provider IS DISTINCT FROM NEW.source
               OR NEW.entity_external_id IS DISTINCT FROM NEW.source_external_id
           ) THEN
            RAISE EXCEPTION 'public-post candidate entity must match source provenance'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.candidate_status IS DISTINCT FROM OLD.candidate_status THEN
        IF NOT (
            (OLD.candidate_status = 'raw' AND NEW.candidate_status IN ('plausible', 'rejected'))
            OR (OLD.candidate_status = 'plausible' AND NEW.candidate_status IN ('review', 'rejected'))
            OR (OLD.candidate_status = 'review' AND NEW.candidate_status IN ('qualified', 'rejected'))
        ) THEN
            RAISE EXCEPTION 'invalid discovery candidate lifecycle transition from % to %', OLD.candidate_status, NEW.candidate_status
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_discovery_candidate_observation_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    candidate_profile_id UUID;
    source_row_source TEXT;
    source_row_external_id TEXT;
    source_row_tenant_id TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
           OR NEW.discovery_run_id IS DISTINCT FROM OLD.discovery_run_id
           OR NEW.source IS DISTINCT FROM OLD.source
           OR NEW.source_post_id IS DISTINCT FROM OLD.source_post_id
           OR NEW.query_type IS DISTINCT FROM OLD.query_type
           OR NEW.query_phrase IS DISTINCT FROM OLD.query_phrase
           OR NEW.query_hash IS DISTINCT FROM OLD.query_hash
           OR NEW.observation_scores IS DISTINCT FROM OLD.observation_scores
           OR NEW.evidence IS DISTINCT FROM OLD.evidence
           OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       ) THEN
        RAISE EXCEPTION 'discovery candidate observation provenance is immutable'
            USING ERRCODE = '23514';
    END IF;

    SELECT candidate.service_profile_id
      INTO candidate_profile_id
      FROM public.discovery_candidates AS candidate
     WHERE candidate.id = NEW.candidate_id
       AND candidate.tenant_id = NEW.tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'candidate does not belong to observation tenant'
            USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.discovery_runs AS run
         WHERE run.id = NEW.discovery_run_id
           AND run.tenant_id = NEW.tenant_id
           AND run.service_profile_id = candidate_profile_id
    ) THEN
        RAISE EXCEPTION 'discovery run does not belong to candidate profile'
            USING ERRCODE = '23503';
    END IF;

    IF NEW.source_post_id IS NOT NULL THEN
        SELECT post.source, post.source_post_id, post.tenant_id
          INTO source_row_source, source_row_external_id, source_row_tenant_id
          FROM public.source_posts AS post
         WHERE post.id = NEW.source_post_id;

        IF NOT FOUND OR source_row_tenant_id IS NOT NULL THEN
            RAISE EXCEPTION 'observation source post must be a global public source row'
                USING ERRCODE = '23503';
        END IF;

        IF source_row_source IS DISTINCT FROM NEW.source THEN
            RAISE EXCEPTION 'observation source does not match source post'
                USING ERRCODE = '23503';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS discovery_candidates_scope_guard ON public.discovery_candidates;
CREATE TRIGGER discovery_candidates_scope_guard
    BEFORE INSERT OR UPDATE ON public.discovery_candidates
    FOR EACH ROW EXECUTE FUNCTION public.guard_discovery_candidate_tenant_scope();

DROP TRIGGER IF EXISTS discovery_candidates_updated_at ON public.discovery_candidates;
CREATE TRIGGER discovery_candidates_updated_at
    BEFORE UPDATE ON public.discovery_candidates
    FOR EACH ROW EXECUTE FUNCTION public.set_discovery_candidate_pool_updated_at();

DROP TRIGGER IF EXISTS discovery_candidate_observations_scope_guard
    ON public.discovery_candidate_observations;
CREATE TRIGGER discovery_candidate_observations_scope_guard
    BEFORE INSERT OR UPDATE ON public.discovery_candidate_observations
    FOR EACH ROW EXECUTE FUNCTION public.guard_discovery_candidate_observation_tenant_scope();

DROP TRIGGER IF EXISTS discovery_candidate_observations_updated_at
    ON public.discovery_candidate_observations;
CREATE TRIGGER discovery_candidate_observations_updated_at
    BEFORE UPDATE ON public.discovery_candidate_observations
    FOR EACH ROW EXECUTE FUNCTION public.set_discovery_candidate_pool_updated_at();

-- Browser clients can view their workspace candidate pool, but cannot create,
-- alter, qualify, or erase candidates directly.  Trusted worker/service code
-- owns lifecycle changes; a future review API must authenticate and authorize
-- its caller before invoking that service-side operation.
ALTER TABLE public.discovery_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_candidate_observations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.discovery_candidates TO authenticated;
GRANT SELECT ON TABLE public.discovery_candidate_observations TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.discovery_candidates FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.discovery_candidate_observations FROM authenticated;

DROP POLICY IF EXISTS discovery_candidates_select_tenant ON public.discovery_candidates;
CREATE POLICY discovery_candidates_select_tenant ON public.discovery_candidates
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = discovery_candidates.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

DROP POLICY IF EXISTS discovery_candidate_observations_select_tenant
    ON public.discovery_candidate_observations;
CREATE POLICY discovery_candidate_observations_select_tenant
    ON public.discovery_candidate_observations
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = discovery_candidate_observations.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

REVOKE ALL ON FUNCTION public.guard_discovery_candidate_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_discovery_candidate_observation_tenant_scope() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
