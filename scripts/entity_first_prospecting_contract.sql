-- Entity-first prospecting contract.
--
-- Apply after:
--   * scripts/RLS_updates.sql
--   * scripts/hn_source_posts_global_contract.sql
--   * scripts/prospect_intelligence_contract.sql
--   * scripts/discovery_candidate_pool_contract.sql
--
-- This is intentionally additive.  ``lead_matches`` remains the public-post
-- opportunity workflow, while these tables retain account, builder, and
-- project targets that may have no public buying post at all.  A target is not
-- a lead: only accepted, fresh evaluation evidence can support the
-- ``strong_buyer_signal`` assessment state.
--
-- All prospect data is tenant-local.  There is deliberately no global graph
-- of people, no name/email/phone/contact columns, and no raw profile history.
-- Public-source evidence must point to the existing global source_posts row so
-- public-data removal and retention cascade through its stored excerpt.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.service_profiles') IS NULL
       OR to_regclass('public.source_posts') IS NULL
       OR to_regclass('public.tenant_users') IS NULL THEN
        RAISE EXCEPTION
            'entity_first_prospecting_contract requires the service profile, global public-source, and tenant membership contracts';
    END IF;
END;
$$;

-- Keep JSONB briefs bounded and structurally simple.  The browser-facing RPC
-- below accepts only arrays of short strings, never arbitrary JSON documents.
CREATE OR REPLACE FUNCTION public.prospecting_is_bounded_text_array(
    candidate JSONB,
    maximum_items INTEGER,
    maximum_item_length INTEGER,
    allow_empty BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
    SELECT CASE
        WHEN jsonb_typeof(candidate) IS DISTINCT FROM 'array' THEN FALSE
        ELSE jsonb_array_length(candidate) <= maximum_items
         AND (allow_empty OR jsonb_array_length(candidate) > 0)
         AND NOT EXISTS (
              SELECT 1
                FROM jsonb_array_elements(candidate) AS item(value)
               WHERE jsonb_typeof(item.value) <> 'string'
                  OR char_length(btrim(item.value #>> '{}')) NOT BETWEEN 1 AND maximum_item_length
         )
    END;
$$;

CREATE OR REPLACE FUNCTION public.prospecting_is_valid_public_http_url(candidate TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
    SELECT candidate IS NOT NULL
       AND char_length(btrim(candidate)) BETWEEN 8 AND 2048
       -- Deliberately excludes embedded credentials and direct email addresses.
       AND btrim(candidate) ~* '^https?://[^[:space:]@]+$'
       -- This is a stored-target boundary, not a substitute for the fetch
       -- worker's DNS/IP revalidation. It rejects obvious local targets now.
       AND btrim(candidate) !~* '^https?://([^/:?#]+[.])?(localhost|local)[.]?([:/?#]|$)'
       AND btrim(candidate) !~* '^https?://127([.][0-9]{1,3}){3}[.]?([:/?#]|$)'
       AND btrim(candidate) !~* '^https?://10([.][0-9]{1,3}){3}[.]?([:/?#]|$)'
       AND btrim(candidate) !~* '^https?://192[.]168([.][0-9]{1,3}){2}[.]?([:/?#]|$)'
       AND btrim(candidate) !~* '^https?://169[.]254([.][0-9]{1,3}){2}[.]?([:/?#]|$)'
       AND btrim(candidate) !~* '^https?://172[.](1[6-9]|2[0-9]|3[0-1])([.][0-9]{1,3}){2}[.]?([:/?#]|$)'
       AND btrim(candidate) !~* '^https?://0([.][0-9]{1,3}){3}[.]?([:/?#]|$)'
       AND btrim(candidate) !~* '^https?://100[.](6[4-9]|[789][0-9]|1[01][0-9]|12[0-7])([.][0-9]{1,3}){2}[.]?([:/?#]|$)'
       AND btrim(candidate) !~* '^https?://198[.](1[89])([.][0-9]{1,3}){2}[.]?([:/?#]|$)'
       AND btrim(candidate) !~* '^https?://[[](::1|0:0:0:0:0:0:0:1|fe[89ab][0-9a-f]:|f[cd][0-9a-f]{2}:)'
       -- An IPv4-mapped IPv6 literal can conceal a private IPv4 address.
       -- Reject the mapped form entirely; public sources normally use names
       -- or an unambiguous native public IP literal.
       AND btrim(candidate) !~* '^https?://[[]::ffff:';
$$;

CREATE OR REPLACE FUNCTION public.prospecting_is_bounded_url_array(
    candidate JSONB,
    maximum_items INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
    SELECT CASE
        WHEN jsonb_typeof(candidate) IS DISTINCT FROM 'array' THEN FALSE
        ELSE public.prospecting_is_bounded_text_array(candidate, maximum_items, 2048)
         AND NOT EXISTS (
              SELECT 1
                FROM jsonb_array_elements_text(candidate) AS item(value)
               WHERE NOT public.prospecting_is_valid_public_http_url(item.value)
         )
    END;
$$;

CREATE OR REPLACE FUNCTION public.prospecting_target_types_are_valid(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
    SELECT CASE
        WHEN jsonb_typeof(candidate) IS DISTINCT FROM 'array' THEN FALSE
        ELSE public.prospecting_is_bounded_text_array(candidate, 3, 32, FALSE)
         AND NOT EXISTS (
              SELECT 1
                FROM jsonb_array_elements_text(candidate) AS item(value)
               WHERE item.value NOT IN ('account', 'builder', 'project')
         )
         AND (
              SELECT count(*) = count(DISTINCT item.value)
                FROM jsonb_array_elements_text(candidate) AS item(value)
         )
    END;
$$;

-- Evidence-collection selections carry only approved public source names.
-- Keeping this validator in the database prevents an out-of-band worker write
-- from using the durable run mapping to enable an unapproved connector.
CREATE OR REPLACE FUNCTION public.prospecting_public_evidence_sources_are_valid(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
    SELECT CASE
        WHEN jsonb_typeof(candidate) IS DISTINCT FROM 'array' THEN FALSE
        ELSE public.prospecting_is_bounded_text_array(candidate, 5, 32, FALSE)
         AND NOT EXISTS (
              SELECT 1
                FROM jsonb_array_elements_text(candidate) AS item(value)
               WHERE item.value NOT IN ('hackernews', 'bluesky', 'stackexchange', 'github', 'lemmy')
         )
         AND (
              SELECT count(*) = count(DISTINCT item.value)
                FROM jsonb_array_elements_text(candidate) AS item(value)
         )
    END;
$$;

CREATE OR REPLACE FUNCTION public.prospecting_is_safe_entity_title(candidate TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
    SELECT candidate IS NULL
        OR (
            char_length(btrim(candidate)) BETWEEN 1 AND 240
            AND candidate !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,63}'
            AND candidate !~ '[+]?([0-9][0-9 .()-]{6,}[0-9])'
        );
$$;

CREATE OR REPLACE FUNCTION public.prospecting_is_safe_evidence_summary(candidate TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
    SELECT char_length(btrim(COALESCE(candidate, ''))) BETWEEN 1 AND 480
       AND candidate !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,63}'
       AND candidate !~ '[+]?([0-9][0-9 .()-]{6,}[0-9])';
$$;

CREATE TABLE IF NOT EXISTS public.targeting_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    service_profile_id UUID NOT NULL,

    target_types JSONB NOT NULL DEFAULT '["account", "builder", "project"]'::JSONB,
    ideal_customer_traits JSONB NOT NULL DEFAULT '[]'::JSONB,
    change_triggers JSONB NOT NULL DEFAULT '[]'::JSONB,
    strong_evidence_definitions JSONB NOT NULL DEFAULT '[]'::JSONB,
    exclusions JSONB NOT NULL DEFAULT '[]'::JSONB,
    seed_urls JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- A save through the authenticated RPC represents an explicit approval.
    -- Drafts are reserved for a later generated-brief review flow.
    approval_status TEXT NOT NULL DEFAULT 'draft',
    profile_version INTEGER NOT NULL DEFAULT 1,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT targeting_profiles_target_types_check
        CHECK (public.prospecting_target_types_are_valid(target_types)),
    CONSTRAINT targeting_profiles_traits_check
        CHECK (public.prospecting_is_bounded_text_array(ideal_customer_traits, 40, 320)),
    CONSTRAINT targeting_profiles_triggers_check
        CHECK (public.prospecting_is_bounded_text_array(change_triggers, 40, 320)),
    CONSTRAINT targeting_profiles_strong_evidence_check
        CHECK (public.prospecting_is_bounded_text_array(strong_evidence_definitions, 24, 480)),
    CONSTRAINT targeting_profiles_exclusions_check
        CHECK (public.prospecting_is_bounded_text_array(exclusions, 40, 320)),
    CONSTRAINT targeting_profiles_seed_urls_check
        CHECK (public.prospecting_is_bounded_url_array(seed_urls, 50)),
    CONSTRAINT targeting_profiles_approval_status_check
        CHECK (approval_status IN ('draft', 'approved', 'archived')),
    CONSTRAINT targeting_profiles_version_check
        CHECK (profile_version >= 1),
    CONSTRAINT targeting_profiles_approved_fields_check
        CHECK (
            approval_status <> 'approved'
            OR (
                approved_at IS NOT NULL
                AND char_length(btrim(COALESCE(approved_by, ''))) BETWEEN 1 AND 128
            )
        ),
    CONSTRAINT uq_targeting_profiles_tenant_service_profile
        UNIQUE (tenant_id, service_profile_id)
);

COMMENT ON TABLE public.targeting_profiles IS
    'Tenant-owned, user-approved target thesis. It governs target research but is not a lead definition.';

CREATE TABLE IF NOT EXISTS public.prospect_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,

    -- A builder is intentionally an anonymised public locator: no personal
    -- display label is retained. The canonical project/profile URL is enough
    -- to let the user inspect the public source in its original context.
    entity_kind TEXT NOT NULL,
    entity_provider TEXT NOT NULL,
    entity_external_id TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    title TEXT,
    origin_kind TEXT NOT NULL,
    origin_source_post_id UUID REFERENCES public.source_posts(id) ON DELETE CASCADE,

    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prospect_entities_kind_check
        CHECK (entity_kind IN ('account', 'builder', 'project')),
    CONSTRAINT prospect_entities_provider_check
        CHECK (char_length(btrim(entity_provider)) BETWEEN 1 AND 120),
    CONSTRAINT prospect_entities_external_id_check
        CHECK (char_length(btrim(entity_external_id)) BETWEEN 1 AND 2048),
    CONSTRAINT prospect_entities_canonical_url_check
        CHECK (public.prospecting_is_valid_public_http_url(canonical_url)),
    CONSTRAINT prospect_entities_title_check
        CHECK (public.prospecting_is_safe_entity_title(title)),
    CONSTRAINT prospect_entities_builder_title_check
        CHECK (entity_kind <> 'builder' OR title IS NULL),
    CONSTRAINT prospect_entities_origin_check
        CHECK (origin_kind IN ('manual', 'official_site', 'licensed_provider', 'public_source')),
    CONSTRAINT prospect_entities_public_origin_source_check
        CHECK (
            (origin_kind = 'public_source' AND origin_source_post_id IS NOT NULL)
            OR (origin_kind <> 'public_source' AND origin_source_post_id IS NULL)
        ),
    CONSTRAINT uq_prospect_entities_tenant_identity
        UNIQUE (tenant_id, entity_kind, entity_provider, entity_external_id)
);

COMMENT ON TABLE public.prospect_entities IS
    'Tenant-local accounts, builders, and projects. No contact/person PII is stored.';

CREATE TABLE IF NOT EXISTS public.prospect_entity_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    from_entity_id UUID NOT NULL,
    to_entity_id UUID NOT NULL,
    link_type TEXT NOT NULL,
    link_source_kind TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    source_post_id UUID REFERENCES public.source_posts(id) ON DELETE CASCADE,
    link_confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    link_key TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prospect_entity_links_distinct_entities_check
        CHECK (from_entity_id <> to_entity_id),
    CONSTRAINT prospect_entity_links_type_check
        CHECK (link_type IN (
            'builder_owns_project',
            'builder_operates_account',
            'project_belongs_to_account',
            'project_related_to_account'
        )),
    CONSTRAINT prospect_entity_links_source_kind_check
        CHECK (link_source_kind IN ('manual', 'official_site', 'licensed_provider', 'public_source')),
    CONSTRAINT prospect_entity_links_source_check
        CHECK (char_length(btrim(source)) BETWEEN 1 AND 120),
    CONSTRAINT prospect_entity_links_source_url_check
        CHECK (source_url IS NULL OR public.prospecting_is_valid_public_http_url(source_url)),
    CONSTRAINT prospect_entity_links_public_source_check
        CHECK (
            (link_source_kind = 'public_source' AND source_post_id IS NOT NULL)
            OR (link_source_kind <> 'public_source' AND source_post_id IS NULL)
        ),
    CONSTRAINT prospect_entity_links_confidence_check
        CHECK (link_confidence BETWEEN 0 AND 1),
    CONSTRAINT prospect_entity_links_key_check
        CHECK (link_key ~ '^[0-9a-f]{64}$'),
    CONSTRAINT uq_prospect_entity_links_tenant_key
        UNIQUE (tenant_id, link_key)
);

CREATE TABLE IF NOT EXISTS public.prospect_research_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    targeting_profile_id UUID NOT NULL,
    -- The worker may only write while this immutable approved-brief revision
    -- still matches. A changed thesis becomes a skipped run, never a stale
    -- target list under the customer's new targeting criteria.
    targeting_profile_version INTEGER NOT NULL,
    service_profile_id UUID NOT NULL,
    run_kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    idempotency_key TEXT NOT NULL,
    plan_fingerprint TEXT NOT NULL,

    -- Hard limits make comment/thread research a bounded enrichment step,
    -- rather than an unbounded crawl of somebody's posting history.
    candidate_limit INTEGER NOT NULL DEFAULT 25,
    evidence_limit_per_entity INTEGER NOT NULL DEFAULT 8,
    result_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
    error_code TEXT,
    -- Durable workers use a lease token rather than an updated-at heuristic:
    -- an expired worker cannot later overwrite a reclaimed run.
    claim_token UUID,
    lease_expires_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prospect_research_runs_kind_check
        CHECK (run_kind IN ('candidate_generation', 'evidence_collection', 'monitoring')),
    CONSTRAINT prospect_research_runs_status_check
        CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'skipped')),
    CONSTRAINT prospect_research_runs_idempotency_key_check
        CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
    CONSTRAINT prospect_research_runs_targeting_profile_version_check
        CHECK (targeting_profile_version >= 1),
    CONSTRAINT prospect_research_runs_plan_fingerprint_check
        CHECK (plan_fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT prospect_research_runs_candidate_limit_check
        CHECK (candidate_limit BETWEEN 1 AND 100),
    CONSTRAINT prospect_research_runs_evidence_limit_check
        CHECK (evidence_limit_per_entity BETWEEN 1 AND 25),
    CONSTRAINT prospect_research_runs_summary_check
        CHECK (jsonb_typeof(result_summary) = 'object'),
    CONSTRAINT prospect_research_runs_error_code_check
        CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_:-]{1,120}$'),
    CONSTRAINT prospect_research_runs_attempt_count_check
        CHECK (attempt_count BETWEEN 0 AND 100),
    CONSTRAINT prospect_research_runs_leased_claim_check
        CHECK (
            run_kind NOT IN ('candidate_generation', 'evidence_collection')
            OR (
                (status = 'queued' AND claim_token IS NULL AND lease_expires_at IS NULL)
                OR (status = 'running' AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL)
                OR (
                    status IN ('completed', 'partial', 'failed', 'cancelled', 'skipped')
                    AND claim_token IS NULL
                    AND lease_expires_at IS NULL
                )
            )
        ),
    CONSTRAINT prospect_research_runs_terminal_timestamp_check
        CHECK (
            (status IN ('queued', 'running') AND completed_at IS NULL)
            OR (status IN ('completed', 'partial', 'failed', 'cancelled', 'skipped') AND completed_at IS NOT NULL)
        ),
    CONSTRAINT uq_prospect_research_runs_tenant_idempotency
        UNIQUE (tenant_id, idempotency_key)
);

COMMENT ON TABLE public.prospect_research_runs IS
    'Tenant-scoped, idempotent, budget-bounded target generation and evidence research telemetry.';

-- The contract is intentionally repeatable. These compatibility statements
-- backfill the immutable run snapshot and lease fields for deployments that
-- created the base table before Phase 2's durable worker was introduced.
ALTER TABLE public.prospect_research_runs
    ADD COLUMN IF NOT EXISTS targeting_profile_version INTEGER;
ALTER TABLE public.prospect_research_runs
    ADD COLUMN IF NOT EXISTS plan_fingerprint TEXT;
ALTER TABLE public.prospect_research_runs
    ADD COLUMN IF NOT EXISTS claim_token UUID;
ALTER TABLE public.prospect_research_runs
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE public.prospect_research_runs
    ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE public.prospect_research_runs
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.prospect_research_runs AS run
   SET targeting_profile_version = profile.profile_version
  FROM public.targeting_profiles AS profile
 WHERE run.targeting_profile_version IS NULL
   AND profile.id = run.targeting_profile_id
   AND profile.tenant_id = run.tenant_id;
UPDATE public.prospect_research_runs
   SET targeting_profile_version = 1
 WHERE targeting_profile_version IS NULL;
UPDATE public.prospect_research_runs
   SET plan_fingerprint = idempotency_key
 WHERE plan_fingerprint IS NULL;
-- A pre-lease generation/evidence worker cannot safely retain ownership
-- across this migration. Mark a legacy running claim as expired so a
-- token-aware worker can reclaim it; do not pretend that it completed.
UPDATE public.prospect_research_runs
   SET claim_token = COALESCE(claim_token, gen_random_uuid()),
       lease_expires_at = COALESCE(lease_expires_at, NOW() - INTERVAL '1 second'),
       last_heartbeat_at = COALESCE(last_heartbeat_at, NOW() - INTERVAL '1 second'),
       attempt_count = GREATEST(attempt_count, 1)
 WHERE run_kind IN ('candidate_generation', 'evidence_collection')
   AND status = 'running';
UPDATE public.prospect_research_runs
   SET claim_token = NULL,
       lease_expires_at = NULL
 WHERE run_kind IN ('candidate_generation', 'evidence_collection')
   AND status <> 'running';
ALTER TABLE public.prospect_research_runs
    ALTER COLUMN targeting_profile_version SET NOT NULL;
ALTER TABLE public.prospect_research_runs
    ALTER COLUMN plan_fingerprint SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'prospect_research_runs_targeting_profile_version_check'
           AND conrelid = 'public.prospect_research_runs'::regclass
    ) THEN
        ALTER TABLE public.prospect_research_runs
            ADD CONSTRAINT prospect_research_runs_targeting_profile_version_check
            CHECK (targeting_profile_version >= 1);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'prospect_research_runs_plan_fingerprint_check'
           AND conrelid = 'public.prospect_research_runs'::regclass
    ) THEN
        ALTER TABLE public.prospect_research_runs
            ADD CONSTRAINT prospect_research_runs_plan_fingerprint_check
            CHECK (plan_fingerprint ~ '^[0-9a-f]{64}$');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'prospect_research_runs_attempt_count_check'
           AND conrelid = 'public.prospect_research_runs'::regclass
    ) THEN
        ALTER TABLE public.prospect_research_runs
            ADD CONSTRAINT prospect_research_runs_attempt_count_check
            CHECK (attempt_count BETWEEN 0 AND 100);
    END IF;
END;
$$;

-- Replace the Phase 2 candidate-only check with the shared lease invariant.
-- Dropping/recreating this named check keeps the additive contract repeatable
-- on installations that applied an earlier entity-first revision.
ALTER TABLE public.prospect_research_runs
    DROP CONSTRAINT IF EXISTS prospect_research_runs_candidate_claim_check;
ALTER TABLE public.prospect_research_runs
    DROP CONSTRAINT IF EXISTS prospect_research_runs_leased_claim_check;
ALTER TABLE public.prospect_research_runs
    ADD CONSTRAINT prospect_research_runs_leased_claim_check
    CHECK (
        run_kind NOT IN ('candidate_generation', 'evidence_collection')
        OR (
            (status = 'queued' AND claim_token IS NULL AND lease_expires_at IS NULL)
            OR (status = 'running' AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL)
            OR (
                status IN ('completed', 'partial', 'failed', 'cancelled', 'skipped')
                AND claim_token IS NULL
                AND lease_expires_at IS NULL
            )
        )
    );

-- The selected target set is intentionally a separate durable mapping. A run
-- holds no URL, author handle, query text, or source content: on retry, the
-- worker receives only this bounded set of tenant-local target IDs and the
-- policy classifications required to rebuild its original permission scope.
CREATE TABLE IF NOT EXISTS public.prospect_research_run_entities (
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    research_run_id UUID NOT NULL,
    prospect_entity_id UUID NOT NULL,
    request_position INTEGER NOT NULL,
    entity_kind TEXT NOT NULL,
    origin_kind TEXT NOT NULL,
    assessment_state_at_request TEXT NOT NULL,
    evidence_limit INTEGER NOT NULL,
    source_result_limit INTEGER NOT NULL,
    thread_context_item_limit INTEGER NOT NULL,
    thread_context_char_limit INTEGER NOT NULL,
    public_sources JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prospect_research_run_entities_primary_key
        PRIMARY KEY (research_run_id, prospect_entity_id),
    CONSTRAINT prospect_research_run_entities_position_key
        UNIQUE (tenant_id, research_run_id, request_position),
    CONSTRAINT prospect_research_run_entities_position_check
        CHECK (request_position BETWEEN 0 AND 24),
    CONSTRAINT prospect_research_run_entities_kind_check
        CHECK (entity_kind IN ('account', 'builder', 'project')),
    CONSTRAINT prospect_research_run_entities_origin_check
        CHECK (origin_kind IN ('manual', 'official_site', 'licensed_provider', 'public_source')),
    CONSTRAINT prospect_research_run_entities_state_check
        CHECK (assessment_state_at_request IN (
            'high_fit', 'triggered', 'signal_backed', 'strong_buyer_signal'
        )),
    CONSTRAINT prospect_research_run_entities_evidence_limit_check
        CHECK (evidence_limit BETWEEN 1 AND 8),
    CONSTRAINT prospect_research_run_entities_source_limit_check
        CHECK (source_result_limit BETWEEN 1 AND 10),
    CONSTRAINT prospect_research_run_entities_thread_item_limit_check
        CHECK (thread_context_item_limit BETWEEN 1 AND 6),
    CONSTRAINT prospect_research_run_entities_thread_char_limit_check
        CHECK (thread_context_char_limit BETWEEN 256 AND 6000),
    CONSTRAINT prospect_research_run_entities_sources_check
        CHECK (public.prospecting_public_evidence_sources_are_valid(public_sources))
);

COMMENT ON TABLE public.prospect_research_run_entities IS
    'Immutable, tenant-scoped selected entities for bounded retained-public evidence collection. No URLs, author handles, source text, or queries are retained here.';

CREATE TABLE IF NOT EXISTS public.prospect_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    targeting_profile_id UUID NOT NULL,
    prospect_entity_id UUID NOT NULL,
    research_run_id UUID NOT NULL,
    evidence_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence_source_kind TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    source_post_id UUID REFERENCES public.source_posts(id) ON DELETE CASCADE,
    evidence_excerpt TEXT,
    evidence_strength TEXT NOT NULL DEFAULT 'weak',
    evidence_status TEXT NOT NULL DEFAULT 'pending',
    verified_at TIMESTAMPTZ,
    verified_by TEXT,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evidence_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prospect_evidence_type_check
        CHECK (evidence_type IN ('fit', 'trigger', 'problem', 'evaluation', 'relationship', 'negative')),
    CONSTRAINT prospect_evidence_summary_check
        CHECK (public.prospecting_is_safe_evidence_summary(summary)),
    CONSTRAINT prospect_evidence_source_kind_check
        CHECK (evidence_source_kind IN ('manual', 'official_site', 'licensed_provider', 'public_source')),
    CONSTRAINT prospect_evidence_source_check
        CHECK (char_length(btrim(source)) BETWEEN 1 AND 120),
    CONSTRAINT prospect_evidence_source_url_check
        CHECK (source_url IS NULL OR public.prospecting_is_valid_public_http_url(source_url)),
    CONSTRAINT prospect_evidence_public_source_check
        CHECK (
            (evidence_source_kind = 'public_source' AND source_post_id IS NOT NULL)
            OR (evidence_source_kind <> 'public_source' AND source_post_id IS NULL)
        ),
    CONSTRAINT prospect_evidence_official_source_url_check
        CHECK (evidence_source_kind <> 'official_site' OR source_url IS NOT NULL),
    CONSTRAINT prospect_evidence_excerpt_check
        CHECK (evidence_excerpt IS NULL OR char_length(btrim(evidence_excerpt)) BETWEEN 1 AND 2000),
    CONSTRAINT prospect_evidence_strength_check
        CHECK (evidence_strength IN ('weak', 'moderate', 'strong')),
    CONSTRAINT prospect_evidence_status_check
        CHECK (evidence_status IN ('pending', 'accepted', 'rejected')),
    CONSTRAINT prospect_evidence_verification_check
        CHECK (
            (evidence_status = 'pending' AND verified_at IS NULL AND verified_by IS NULL)
            OR (
                evidence_status IN ('accepted', 'rejected')
                AND verified_at IS NOT NULL
                AND char_length(btrim(COALESCE(verified_by, ''))) BETWEEN 1 AND 128
            )
        ),
    CONSTRAINT prospect_evidence_key_check
        CHECK (evidence_key ~ '^[0-9a-f]{64}$'),
    CONSTRAINT uq_prospect_evidence_tenant_profile_key
        UNIQUE (tenant_id, targeting_profile_id, evidence_key)
);

COMMENT ON TABLE public.prospect_evidence IS
    'Typed, source-cited target evidence. Public-source excerpts are deleted with their source_posts row.';

CREATE TABLE IF NOT EXISTS public.prospect_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    targeting_profile_id UUID NOT NULL,
    prospect_entity_id UUID NOT NULL,
    assessment_state TEXT NOT NULL DEFAULT 'high_fit',

    -- These are relevance/evidence dimensions, not a probability that a
    -- person or company will buy.  Keeping them separate makes ranking
    -- explainable and lets users distinguish fit from active intent.
    fit_score DOUBLE PRECISION,
    trigger_score DOUBLE PRECISION,
    need_score DOUBLE PRECISION,
    evaluation_score DOUBLE PRECISION,
    evidence_quality_score DOUBLE PRECISION,
    priority_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    reason_codes JSONB NOT NULL DEFAULT '[]'::JSONB,
    strong_signal_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    last_assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prospect_assessments_state_check
        CHECK (assessment_state IN (
            'high_fit',
            'triggered',
            'signal_backed',
            'strong_buyer_signal',
            'rejected'
        )),
    CONSTRAINT prospect_assessments_score_check
        CHECK (
            (fit_score IS NULL OR fit_score BETWEEN 0 AND 1)
            AND (trigger_score IS NULL OR trigger_score BETWEEN 0 AND 1)
            AND (need_score IS NULL OR need_score BETWEEN 0 AND 1)
            AND (evaluation_score IS NULL OR evaluation_score BETWEEN 0 AND 1)
            AND (evidence_quality_score IS NULL OR evidence_quality_score BETWEEN 0 AND 1)
            AND priority_score BETWEEN 0 AND 100
        ),
    CONSTRAINT prospect_assessments_reason_codes_check
        CHECK (public.prospecting_is_bounded_text_array(reason_codes, 16, 80)),
    CONSTRAINT prospect_assessments_terminal_timestamp_check
        CHECK (
            (assessment_state = 'strong_buyer_signal' AND strong_signal_at IS NOT NULL AND rejected_at IS NULL)
            OR (assessment_state = 'rejected' AND rejected_at IS NOT NULL AND strong_signal_at IS NULL)
            OR (assessment_state NOT IN ('strong_buyer_signal', 'rejected') AND strong_signal_at IS NULL AND rejected_at IS NULL)
        ),
    CONSTRAINT uq_prospect_assessments_tenant_profile_entity
        UNIQUE (tenant_id, targeting_profile_id, prospect_entity_id)
);

COMMENT ON TABLE public.prospect_assessments IS
    'Per-targeting-profile target classification. Strong buyer signal requires accepted direct evaluation evidence.';

CREATE TABLE IF NOT EXISTS public.prospect_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    prospect_assessment_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    feedback_type TEXT NOT NULL,
    reason_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prospect_feedback_type_check
        CHECK (feedback_type IN (
            'promote_to_opportunity',
            'target',
            'useful_not_now',
            'not_relevant',
            'monitor',
            'contacted',
            'meeting',
            'won',
            'lost'
        )),
    CONSTRAINT prospect_feedback_reason_code_check
        CHECK (reason_code IS NULL OR reason_code ~ '^[a-z0-9_:-]{1,80}$'),
    CONSTRAINT uq_prospect_feedback_tenant_assessment_user_type
        UNIQUE (tenant_id, prospect_assessment_id, user_id, feedback_type)
);

COMMENT ON TABLE public.prospect_feedback IS
    'Immutable tenant-user feedback used to calibrate target ranking; it intentionally has no free-form personal notes field.';

-- Composite keys make every relation tenant-scoped even for trusted workers.
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
         WHERE conname = 'uq_targeting_profiles_tenant_id_id'
           AND conrelid = 'public.targeting_profiles'::regclass
    ) THEN
        ALTER TABLE public.targeting_profiles
            ADD CONSTRAINT uq_targeting_profiles_tenant_id_id UNIQUE (tenant_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'uq_prospect_entities_tenant_id_id'
           AND conrelid = 'public.prospect_entities'::regclass
    ) THEN
        ALTER TABLE public.prospect_entities
            ADD CONSTRAINT uq_prospect_entities_tenant_id_id UNIQUE (tenant_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'uq_prospect_research_runs_tenant_id_id'
           AND conrelid = 'public.prospect_research_runs'::regclass
    ) THEN
        ALTER TABLE public.prospect_research_runs
            ADD CONSTRAINT uq_prospect_research_runs_tenant_id_id UNIQUE (tenant_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'uq_prospect_evidence_tenant_id_id'
           AND conrelid = 'public.prospect_evidence'::regclass
    ) THEN
        ALTER TABLE public.prospect_evidence
            ADD CONSTRAINT uq_prospect_evidence_tenant_id_id UNIQUE (tenant_id, id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'uq_prospect_assessments_tenant_id_id'
           AND conrelid = 'public.prospect_assessments'::regclass
    ) THEN
        ALTER TABLE public.prospect_assessments
            ADD CONSTRAINT uq_prospect_assessments_tenant_id_id UNIQUE (tenant_id, id);
    END IF;
END;
$$;

ALTER TABLE public.targeting_profiles
    DROP CONSTRAINT IF EXISTS fk_targeting_profiles_tenant_service_profile;
ALTER TABLE public.targeting_profiles
    ADD CONSTRAINT fk_targeting_profiles_tenant_service_profile
    FOREIGN KEY (tenant_id, service_profile_id)
    REFERENCES public.service_profiles (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_entity_links
    DROP CONSTRAINT IF EXISTS fk_prospect_entity_links_tenant_from_entity;
ALTER TABLE public.prospect_entity_links
    ADD CONSTRAINT fk_prospect_entity_links_tenant_from_entity
    FOREIGN KEY (tenant_id, from_entity_id)
    REFERENCES public.prospect_entities (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_entity_links
    DROP CONSTRAINT IF EXISTS fk_prospect_entity_links_tenant_to_entity;
ALTER TABLE public.prospect_entity_links
    ADD CONSTRAINT fk_prospect_entity_links_tenant_to_entity
    FOREIGN KEY (tenant_id, to_entity_id)
    REFERENCES public.prospect_entities (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_research_runs
    DROP CONSTRAINT IF EXISTS fk_prospect_research_runs_tenant_targeting_profile;
ALTER TABLE public.prospect_research_runs
    ADD CONSTRAINT fk_prospect_research_runs_tenant_targeting_profile
    FOREIGN KEY (tenant_id, targeting_profile_id)
    REFERENCES public.targeting_profiles (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_research_runs
    DROP CONSTRAINT IF EXISTS fk_prospect_research_runs_tenant_service_profile;
ALTER TABLE public.prospect_research_runs
    ADD CONSTRAINT fk_prospect_research_runs_tenant_service_profile
    FOREIGN KEY (tenant_id, service_profile_id)
    REFERENCES public.service_profiles (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_research_run_entities
    DROP CONSTRAINT IF EXISTS fk_prospect_research_run_entities_tenant_run;
ALTER TABLE public.prospect_research_run_entities
    ADD CONSTRAINT fk_prospect_research_run_entities_tenant_run
    FOREIGN KEY (tenant_id, research_run_id)
    REFERENCES public.prospect_research_runs (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_research_run_entities
    DROP CONSTRAINT IF EXISTS fk_prospect_research_run_entities_tenant_entity;
ALTER TABLE public.prospect_research_run_entities
    ADD CONSTRAINT fk_prospect_research_run_entities_tenant_entity
    FOREIGN KEY (tenant_id, prospect_entity_id)
    REFERENCES public.prospect_entities (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_evidence
    DROP CONSTRAINT IF EXISTS fk_prospect_evidence_tenant_targeting_profile;
ALTER TABLE public.prospect_evidence
    ADD CONSTRAINT fk_prospect_evidence_tenant_targeting_profile
    FOREIGN KEY (tenant_id, targeting_profile_id)
    REFERENCES public.targeting_profiles (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_evidence
    DROP CONSTRAINT IF EXISTS fk_prospect_evidence_tenant_entity;
ALTER TABLE public.prospect_evidence
    ADD CONSTRAINT fk_prospect_evidence_tenant_entity
    FOREIGN KEY (tenant_id, prospect_entity_id)
    REFERENCES public.prospect_entities (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_evidence
    DROP CONSTRAINT IF EXISTS fk_prospect_evidence_tenant_research_run;
ALTER TABLE public.prospect_evidence
    ADD CONSTRAINT fk_prospect_evidence_tenant_research_run
    FOREIGN KEY (tenant_id, research_run_id)
    REFERENCES public.prospect_research_runs (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_assessments
    DROP CONSTRAINT IF EXISTS fk_prospect_assessments_tenant_targeting_profile;
ALTER TABLE public.prospect_assessments
    ADD CONSTRAINT fk_prospect_assessments_tenant_targeting_profile
    FOREIGN KEY (tenant_id, targeting_profile_id)
    REFERENCES public.targeting_profiles (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_assessments
    DROP CONSTRAINT IF EXISTS fk_prospect_assessments_tenant_entity;
ALTER TABLE public.prospect_assessments
    ADD CONSTRAINT fk_prospect_assessments_tenant_entity
    FOREIGN KEY (tenant_id, prospect_entity_id)
    REFERENCES public.prospect_entities (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_feedback
    DROP CONSTRAINT IF EXISTS fk_prospect_feedback_tenant_assessment;
ALTER TABLE public.prospect_feedback
    ADD CONSTRAINT fk_prospect_feedback_tenant_assessment
    FOREIGN KEY (tenant_id, prospect_assessment_id)
    REFERENCES public.prospect_assessments (tenant_id, id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_targeting_profiles_tenant_service_profile_updated
    ON public.targeting_profiles(tenant_id, service_profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_entities_tenant_kind_last_seen
    ON public.prospect_entities(tenant_id, entity_kind, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_entity_links_tenant_from_observed
    ON public.prospect_entity_links(tenant_id, from_entity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_entity_links_tenant_to_observed
    ON public.prospect_entity_links(tenant_id, to_entity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_research_runs_tenant_profile_started
    ON public.prospect_research_runs(tenant_id, targeting_profile_id, started_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_prospect_research_runs_candidate_claim
    ON public.prospect_research_runs(tenant_id, status, lease_expires_at)
    WHERE run_kind = 'candidate_generation';
CREATE INDEX IF NOT EXISTS idx_prospect_research_runs_evidence_collection_claim
    ON public.prospect_research_runs(tenant_id, status, lease_expires_at)
    WHERE run_kind = 'evidence_collection';
CREATE INDEX IF NOT EXISTS idx_prospect_research_run_entities_tenant_run_position
    ON public.prospect_research_run_entities(tenant_id, research_run_id, request_position);
CREATE INDEX IF NOT EXISTS idx_prospect_evidence_tenant_profile_entity_observed
    ON public.prospect_evidence(tenant_id, targeting_profile_id, prospect_entity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_evidence_public_source_post
    ON public.prospect_evidence(source_post_id)
    WHERE source_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospect_assessments_tenant_profile_state_priority
    ON public.prospect_assessments(
        tenant_id,
        targeting_profile_id,
        assessment_state,
        priority_score DESC,
        last_assessed_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_prospect_feedback_tenant_assessment_created
    ON public.prospect_feedback(tenant_id, prospect_assessment_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_entity_first_prospecting_updated_at()
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

CREATE OR REPLACE FUNCTION public.guard_targeting_profile_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.service_profile_id IS DISTINCT FROM OLD.service_profile_id
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       ) THEN
        RAISE EXCEPTION 'targeting profile tenant and service profile are immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.service_profiles AS profile
         WHERE profile.id = NEW.service_profile_id
           AND profile.tenant_id = NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'service profile does not belong to targeting profile tenant'
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_prospect_entity_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    source_tenant_id TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.entity_kind IS DISTINCT FROM OLD.entity_kind
           OR NEW.entity_provider IS DISTINCT FROM OLD.entity_provider
           OR NEW.entity_external_id IS DISTINCT FROM OLD.entity_external_id
           OR NEW.canonical_url IS DISTINCT FROM OLD.canonical_url
           OR NEW.origin_kind IS DISTINCT FROM OLD.origin_kind
           OR NEW.origin_source_post_id IS DISTINCT FROM OLD.origin_source_post_id
           OR NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       ) THEN
        RAISE EXCEPTION 'prospect entity identity and origin are immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.origin_source_post_id IS NOT NULL THEN
        SELECT source_post.tenant_id
          INTO source_tenant_id
          FROM public.source_posts AS source_post
         WHERE source_post.id = NEW.origin_source_post_id;

        IF NOT FOUND OR source_tenant_id IS NOT NULL THEN
            RAISE EXCEPTION 'public-source entity origin must reference a global source post'
                USING ERRCODE = '23503';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_prospect_entity_link_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    source_tenant_id TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.from_entity_id IS DISTINCT FROM OLD.from_entity_id
           OR NEW.to_entity_id IS DISTINCT FROM OLD.to_entity_id
           OR NEW.link_type IS DISTINCT FROM OLD.link_type
           OR NEW.link_source_kind IS DISTINCT FROM OLD.link_source_kind
           OR NEW.source IS DISTINCT FROM OLD.source
           OR NEW.source_url IS DISTINCT FROM OLD.source_url
           OR NEW.source_post_id IS DISTINCT FROM OLD.source_post_id
           OR NEW.link_key IS DISTINCT FROM OLD.link_key
           OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       ) THEN
        RAISE EXCEPTION 'prospect entity link identity and provenance are immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.prospect_entities AS entity
         WHERE entity.id = NEW.from_entity_id AND entity.tenant_id = NEW.tenant_id
    ) OR NOT EXISTS (
        SELECT 1 FROM public.prospect_entities AS entity
         WHERE entity.id = NEW.to_entity_id AND entity.tenant_id = NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'prospect entity link crosses tenant scope'
            USING ERRCODE = '23503';
    END IF;

    IF NEW.source_post_id IS NOT NULL THEN
        SELECT source_post.tenant_id
          INTO source_tenant_id
          FROM public.source_posts AS source_post
         WHERE source_post.id = NEW.source_post_id;
        IF NOT FOUND OR source_tenant_id IS NOT NULL THEN
            RAISE EXCEPTION 'public-source entity link must reference a global source post'
                USING ERRCODE = '23503';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_prospect_research_run_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    target_service_profile_id UUID;
    target_status TEXT;
    target_profile_version INTEGER;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.targeting_profile_id IS DISTINCT FROM OLD.targeting_profile_id
           OR NEW.targeting_profile_version IS DISTINCT FROM OLD.targeting_profile_version
           OR NEW.service_profile_id IS DISTINCT FROM OLD.service_profile_id
           OR NEW.run_kind IS DISTINCT FROM OLD.run_kind
           OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
           OR NEW.plan_fingerprint IS DISTINCT FROM OLD.plan_fingerprint
           OR NEW.candidate_limit IS DISTINCT FROM OLD.candidate_limit
           OR NEW.evidence_limit_per_entity IS DISTINCT FROM OLD.evidence_limit_per_entity
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       ) THEN
        RAISE EXCEPTION 'prospect research run identity, profile revision, plan, and budget are immutable'
            USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.attempt_count < OLD.attempt_count THEN
        RAISE EXCEPTION 'prospect research run attempt count cannot decrease'
            USING ERRCODE = '23514';
    END IF;

    SELECT profile.service_profile_id,
           profile.approval_status,
           profile.profile_version
      INTO target_service_profile_id, target_status, target_profile_version
      FROM public.targeting_profiles AS profile
     WHERE profile.id = NEW.targeting_profile_id
       AND profile.tenant_id = NEW.tenant_id;

    IF NOT FOUND OR target_service_profile_id IS DISTINCT FROM NEW.service_profile_id THEN
        RAISE EXCEPTION 'research run targeting profile does not belong to service profile tenant'
            USING ERRCODE = '23503';
    END IF;
    -- A revision/approval check applies at durable-run creation. On later
    -- updates the worker must be able to terminalize a stale run as skipped
    -- after the customer changes or archives their targeting thesis.
    IF TG_OP = 'INSERT'
       AND (
           target_status <> 'approved'
           OR target_profile_version IS DISTINCT FROM NEW.targeting_profile_version
       ) THEN
        RAISE EXCEPTION 'prospect research requires the current approved targeting profile revision'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_prospect_research_run_entity_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    selected_run_kind TEXT;
    selected_run_status TEXT;
    selected_entity_limit INTEGER;
    selected_evidence_limit INTEGER;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'prospect research run entity selection is immutable'
            USING ERRCODE = '23514';
    END IF;

    SELECT run.run_kind,
           run.status,
           run.candidate_limit,
           run.evidence_limit_per_entity
      INTO selected_run_kind,
           selected_run_status,
           selected_entity_limit,
           selected_evidence_limit
      FROM public.prospect_research_runs AS run
      INNER JOIN public.prospect_entities AS entity
              ON entity.id = NEW.prospect_entity_id
             AND entity.tenant_id = NEW.tenant_id
             AND entity.entity_kind = NEW.entity_kind
             AND entity.origin_kind = NEW.origin_kind
      INNER JOIN public.prospect_assessments AS assessment
              ON assessment.prospect_entity_id = NEW.prospect_entity_id
             AND assessment.tenant_id = NEW.tenant_id
             AND assessment.targeting_profile_id = run.targeting_profile_id
             AND assessment.assessment_state = NEW.assessment_state_at_request
     WHERE run.id = NEW.research_run_id
       AND run.tenant_id = NEW.tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'research run entity selection crosses tenant, target, or assessment scope'
            USING ERRCODE = '23503';
    END IF;
    IF selected_run_kind <> 'evidence_collection' OR selected_run_status <> 'queued' THEN
        RAISE EXCEPTION 'research run entity selection requires a queued evidence-collection run'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.request_position >= selected_entity_limit
       OR NEW.evidence_limit > selected_evidence_limit THEN
        RAISE EXCEPTION 'research run entity selection exceeds its persisted budget'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_prospect_evidence_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    run_targeting_profile_id UUID;
    source_tenant_id TEXT;
    source_name TEXT;
    source_post_url TEXT;
    source_text TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.targeting_profile_id IS DISTINCT FROM OLD.targeting_profile_id
           OR NEW.prospect_entity_id IS DISTINCT FROM OLD.prospect_entity_id
           OR NEW.research_run_id IS DISTINCT FROM OLD.research_run_id
           OR NEW.evidence_type IS DISTINCT FROM OLD.evidence_type
           OR NEW.summary IS DISTINCT FROM OLD.summary
           OR NEW.evidence_source_kind IS DISTINCT FROM OLD.evidence_source_kind
           OR NEW.source IS DISTINCT FROM OLD.source
           OR NEW.source_url IS DISTINCT FROM OLD.source_url
           OR NEW.source_post_id IS DISTINCT FROM OLD.source_post_id
           OR NEW.evidence_excerpt IS DISTINCT FROM OLD.evidence_excerpt
           OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
           OR NEW.evidence_key IS DISTINCT FROM OLD.evidence_key
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       ) THEN
        RAISE EXCEPTION 'prospect evidence identity and source material are immutable'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.evidence_status IS DISTINCT FROM OLD.evidence_status
       AND NOT (
           OLD.evidence_status = 'pending'
           AND NEW.evidence_status IN ('accepted', 'rejected')
       ) THEN
        RAISE EXCEPTION 'prospect evidence verification is terminal'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.prospect_entities AS entity
         WHERE entity.id = NEW.prospect_entity_id AND entity.tenant_id = NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'prospect evidence entity does not belong to tenant'
            USING ERRCODE = '23503';
    END IF;

    SELECT run.targeting_profile_id
      INTO run_targeting_profile_id
      FROM public.prospect_research_runs AS run
     WHERE run.id = NEW.research_run_id
       AND run.tenant_id = NEW.tenant_id;
    IF NOT FOUND OR run_targeting_profile_id IS DISTINCT FROM NEW.targeting_profile_id THEN
        RAISE EXCEPTION 'prospect evidence research run does not belong to targeting profile'
            USING ERRCODE = '23503';
    END IF;

    IF NEW.source_post_id IS NOT NULL THEN
        SELECT source_post.tenant_id,
               source_post.source,
               source_post.url,
               COALESCE(source_post.body, source_post.text, '')
          INTO source_tenant_id, source_name, source_post_url, source_text
          FROM public.source_posts AS source_post
         WHERE source_post.id = NEW.source_post_id;

        IF NOT FOUND OR source_tenant_id IS NOT NULL THEN
            RAISE EXCEPTION 'public-source evidence must reference a global source post'
                USING ERRCODE = '23503';
        END IF;
        IF source_name IS DISTINCT FROM NEW.source THEN
            RAISE EXCEPTION 'prospect evidence source does not match source post'
                USING ERRCODE = '23503';
        END IF;
        IF NEW.source_url IS NOT NULL
           AND source_post_url IS NOT NULL
           AND NEW.source_url IS DISTINCT FROM source_post_url THEN
            RAISE EXCEPTION 'prospect evidence URL does not match source post'
                USING ERRCODE = '23503';
        END IF;
        IF NEW.evidence_excerpt IS NOT NULL
           AND position(NEW.evidence_excerpt IN source_text) = 0 THEN
            RAISE EXCEPTION 'public-source evidence excerpt must be grounded in source post text'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_prospect_assessment_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    has_trigger_evidence BOOLEAN;
    has_signal_evidence BOOLEAN;
    has_strong_evaluation BOOLEAN;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.targeting_profile_id IS DISTINCT FROM OLD.targeting_profile_id
           OR NEW.prospect_entity_id IS DISTINCT FROM OLD.prospect_entity_id
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       ) THEN
        RAISE EXCEPTION 'prospect assessment tenant, target profile, and entity are immutable'
            USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.assessment_state = 'rejected'
       AND NEW.assessment_state <> 'rejected' THEN
        RAISE EXCEPTION 'rejected prospect assessment cannot be reopened in place'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.targeting_profiles AS profile
         WHERE profile.id = NEW.targeting_profile_id AND profile.tenant_id = NEW.tenant_id
    ) OR NOT EXISTS (
        SELECT 1 FROM public.prospect_entities AS entity
         WHERE entity.id = NEW.prospect_entity_id AND entity.tenant_id = NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'prospect assessment crosses tenant scope'
            USING ERRCODE = '23503';
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.prospect_evidence AS evidence
         WHERE evidence.tenant_id = NEW.tenant_id
           AND evidence.targeting_profile_id = NEW.targeting_profile_id
           AND evidence.prospect_entity_id = NEW.prospect_entity_id
           AND evidence.evidence_status = 'accepted'
           AND evidence.evidence_type = 'trigger'
    ), EXISTS (
        SELECT 1
          FROM public.prospect_evidence AS evidence
         WHERE evidence.tenant_id = NEW.tenant_id
           AND evidence.targeting_profile_id = NEW.targeting_profile_id
           AND evidence.prospect_entity_id = NEW.prospect_entity_id
           AND evidence.evidence_status = 'accepted'
           AND evidence.evidence_type IN ('problem', 'evaluation')
    ), EXISTS (
        SELECT 1
          FROM public.prospect_evidence AS evidence
         WHERE evidence.tenant_id = NEW.tenant_id
           AND evidence.targeting_profile_id = NEW.targeting_profile_id
           AND evidence.prospect_entity_id = NEW.prospect_entity_id
           AND evidence.evidence_status = 'accepted'
           AND evidence.evidence_type = 'evaluation'
           AND evidence.evidence_strength = 'strong'
           AND evidence.observed_at >= NOW() - INTERVAL '180 days'
    )
      INTO has_trigger_evidence, has_signal_evidence, has_strong_evaluation;

    IF NEW.assessment_state = 'triggered' AND NOT has_trigger_evidence THEN
        RAISE EXCEPTION 'triggered prospect assessment requires accepted trigger evidence'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.assessment_state = 'signal_backed' AND NOT has_signal_evidence THEN
        RAISE EXCEPTION 'signal-backed prospect assessment requires accepted problem or evaluation evidence'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.assessment_state = 'strong_buyer_signal'
       AND (COALESCE(NEW.fit_score, 0) < 0.5 OR NOT has_strong_evaluation) THEN
        RAISE EXCEPTION 'strong buyer signal requires fit and fresh accepted direct evaluation evidence'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_prospect_feedback_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'prospect feedback is immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.prospect_assessments AS assessment
         WHERE assessment.id = NEW.prospect_assessment_id
           AND assessment.tenant_id = NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'prospect feedback assessment does not belong to tenant'
            USING ERRCODE = '23503';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM public.tenant_users AS tenant_user
         WHERE tenant_user.tenant_id::TEXT = NEW.tenant_id::TEXT
           AND tenant_user.user_id::TEXT = NEW.user_id::TEXT
    ) THEN
        RAISE EXCEPTION 'prospect feedback user does not belong to tenant'
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

-- Evidence review and source-post removal both change the accepted evidence
-- set. Recompute the assessment from that set after either operation so a
-- target is never promoted solely because an unreviewed or removed item was
-- once present. Rejected targets remain rejected.
CREATE OR REPLACE FUNCTION public.reconcile_prospect_assessment_after_evidence_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    affected_tenant_id TEXT;
    affected_targeting_profile_id UUID;
    affected_prospect_entity_id UUID;
    has_trigger_evidence BOOLEAN;
    has_signal_evidence BOOLEAN;
    has_strong_evaluation BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        affected_tenant_id = OLD.tenant_id;
        affected_targeting_profile_id = OLD.targeting_profile_id;
        affected_prospect_entity_id = OLD.prospect_entity_id;
    ELSE
        affected_tenant_id = NEW.tenant_id;
        affected_targeting_profile_id = NEW.targeting_profile_id;
        affected_prospect_entity_id = NEW.prospect_entity_id;
    END IF;

    -- Serialize reconciliation per assessment. Different reviewers can act
    -- on separate evidence rows at once, but their final target state must be
    -- based on one ordered view of the accepted evidence set.
    PERFORM 1
      FROM public.prospect_assessments AS assessment
     WHERE assessment.tenant_id = affected_tenant_id
       AND assessment.targeting_profile_id = affected_targeting_profile_id
       AND assessment.prospect_entity_id = affected_prospect_entity_id
       FOR UPDATE;

    SELECT EXISTS (
        SELECT 1 FROM public.prospect_evidence AS evidence
         WHERE evidence.tenant_id = affected_tenant_id
           AND evidence.targeting_profile_id = affected_targeting_profile_id
           AND evidence.prospect_entity_id = affected_prospect_entity_id
           AND evidence.evidence_status = 'accepted'
           AND evidence.evidence_type = 'trigger'
    ), EXISTS (
        SELECT 1 FROM public.prospect_evidence AS evidence
         WHERE evidence.tenant_id = affected_tenant_id
           AND evidence.targeting_profile_id = affected_targeting_profile_id
           AND evidence.prospect_entity_id = affected_prospect_entity_id
           AND evidence.evidence_status = 'accepted'
           AND evidence.evidence_type IN ('problem', 'evaluation')
    ), EXISTS (
        SELECT 1 FROM public.prospect_evidence AS evidence
         WHERE evidence.tenant_id = affected_tenant_id
           AND evidence.targeting_profile_id = affected_targeting_profile_id
           AND evidence.prospect_entity_id = affected_prospect_entity_id
           AND evidence.evidence_status = 'accepted'
           AND evidence.evidence_type = 'evaluation'
           AND evidence.evidence_strength = 'strong'
           AND evidence.observed_at >= NOW() - INTERVAL '180 days'
    ) INTO has_trigger_evidence, has_signal_evidence, has_strong_evaluation;

    UPDATE public.prospect_assessments AS assessment
       SET assessment_state = CASE
               WHEN has_strong_evaluation AND COALESCE(assessment.fit_score, 0) >= 0.5
                   THEN 'strong_buyer_signal'
               WHEN has_signal_evidence THEN 'signal_backed'
               WHEN has_trigger_evidence THEN 'triggered'
               ELSE 'high_fit'
           END,
           strong_signal_at = CASE
               WHEN has_strong_evaluation AND COALESCE(assessment.fit_score, 0) >= 0.5
                   THEN COALESCE(assessment.strong_signal_at, NOW())
               ELSE NULL
           END,
           rejected_at = NULL,
           last_assessed_at = NOW(),
           updated_at = NOW()
     WHERE assessment.tenant_id = affected_tenant_id
       AND assessment.targeting_profile_id = affected_targeting_profile_id
       AND assessment.prospect_entity_id = affected_prospect_entity_id
       AND assessment.assessment_state <> 'rejected';
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS targeting_profiles_scope_guard ON public.targeting_profiles;
CREATE TRIGGER targeting_profiles_scope_guard
    BEFORE INSERT OR UPDATE ON public.targeting_profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_targeting_profile_tenant_scope();

DROP TRIGGER IF EXISTS targeting_profiles_updated_at ON public.targeting_profiles;
CREATE TRIGGER targeting_profiles_updated_at
    BEFORE UPDATE ON public.targeting_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_entity_first_prospecting_updated_at();

DROP TRIGGER IF EXISTS prospect_entities_scope_guard ON public.prospect_entities;
CREATE TRIGGER prospect_entities_scope_guard
    BEFORE INSERT OR UPDATE ON public.prospect_entities
    FOR EACH ROW EXECUTE FUNCTION public.guard_prospect_entity_tenant_scope();

DROP TRIGGER IF EXISTS prospect_entities_updated_at ON public.prospect_entities;
CREATE TRIGGER prospect_entities_updated_at
    BEFORE UPDATE ON public.prospect_entities
    FOR EACH ROW EXECUTE FUNCTION public.set_entity_first_prospecting_updated_at();

DROP TRIGGER IF EXISTS prospect_entity_links_scope_guard ON public.prospect_entity_links;
CREATE TRIGGER prospect_entity_links_scope_guard
    BEFORE INSERT OR UPDATE ON public.prospect_entity_links
    FOR EACH ROW EXECUTE FUNCTION public.guard_prospect_entity_link_tenant_scope();

DROP TRIGGER IF EXISTS prospect_entity_links_updated_at ON public.prospect_entity_links;
CREATE TRIGGER prospect_entity_links_updated_at
    BEFORE UPDATE ON public.prospect_entity_links
    FOR EACH ROW EXECUTE FUNCTION public.set_entity_first_prospecting_updated_at();

DROP TRIGGER IF EXISTS prospect_research_runs_scope_guard ON public.prospect_research_runs;
CREATE TRIGGER prospect_research_runs_scope_guard
    BEFORE INSERT OR UPDATE ON public.prospect_research_runs
    FOR EACH ROW EXECUTE FUNCTION public.guard_prospect_research_run_tenant_scope();

DROP TRIGGER IF EXISTS prospect_research_runs_updated_at ON public.prospect_research_runs;
CREATE TRIGGER prospect_research_runs_updated_at
    BEFORE UPDATE ON public.prospect_research_runs
    FOR EACH ROW EXECUTE FUNCTION public.set_entity_first_prospecting_updated_at();

DROP TRIGGER IF EXISTS prospect_research_run_entities_scope_guard ON public.prospect_research_run_entities;
CREATE TRIGGER prospect_research_run_entities_scope_guard
    BEFORE INSERT OR UPDATE ON public.prospect_research_run_entities
    FOR EACH ROW EXECUTE FUNCTION public.guard_prospect_research_run_entity_tenant_scope();

DROP TRIGGER IF EXISTS prospect_evidence_scope_guard ON public.prospect_evidence;
CREATE TRIGGER prospect_evidence_scope_guard
    BEFORE INSERT OR UPDATE ON public.prospect_evidence
    FOR EACH ROW EXECUTE FUNCTION public.guard_prospect_evidence_tenant_scope();

DROP TRIGGER IF EXISTS prospect_evidence_updated_at ON public.prospect_evidence;
CREATE TRIGGER prospect_evidence_updated_at
    BEFORE UPDATE ON public.prospect_evidence
    FOR EACH ROW EXECUTE FUNCTION public.set_entity_first_prospecting_updated_at();

DROP TRIGGER IF EXISTS prospect_evidence_assessment_reconcile ON public.prospect_evidence;
DROP FUNCTION IF EXISTS public.reconcile_prospect_assessment_after_evidence_delete();
CREATE TRIGGER prospect_evidence_assessment_reconcile
    AFTER DELETE OR UPDATE ON public.prospect_evidence
    FOR EACH ROW EXECUTE FUNCTION public.reconcile_prospect_assessment_after_evidence_change();

DROP TRIGGER IF EXISTS prospect_assessments_scope_guard ON public.prospect_assessments;
CREATE TRIGGER prospect_assessments_scope_guard
    BEFORE INSERT OR UPDATE ON public.prospect_assessments
    FOR EACH ROW EXECUTE FUNCTION public.guard_prospect_assessment_tenant_scope();

DROP TRIGGER IF EXISTS prospect_assessments_updated_at ON public.prospect_assessments;
CREATE TRIGGER prospect_assessments_updated_at
    BEFORE UPDATE ON public.prospect_assessments
    FOR EACH ROW EXECUTE FUNCTION public.set_entity_first_prospecting_updated_at();

DROP TRIGGER IF EXISTS prospect_feedback_scope_guard ON public.prospect_feedback;
CREATE TRIGGER prospect_feedback_scope_guard
    BEFORE INSERT OR UPDATE ON public.prospect_feedback
    FOR EACH ROW EXECUTE FUNCTION public.guard_prospect_feedback_tenant_scope();

-- Browsers can read tenant-scoped targeting/prospecting data, but direct table
-- writes stay service-owned. Three narrow RPCs below permit an authenticated
-- tenant member to approve a brief, create a manual seed target, or review
-- pending evidence.
ALTER TABLE public.targeting_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_research_run_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_feedback ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.targeting_profiles TO authenticated;
GRANT SELECT ON TABLE public.prospect_entities TO authenticated;
GRANT SELECT ON TABLE public.prospect_entity_links TO authenticated;
GRANT SELECT ON TABLE public.prospect_research_runs TO authenticated;
GRANT SELECT ON TABLE public.prospect_evidence TO authenticated;
GRANT SELECT ON TABLE public.prospect_assessments TO authenticated;
GRANT SELECT ON TABLE public.prospect_feedback TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.targeting_profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.prospect_entities FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.prospect_entity_links FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.prospect_research_runs FROM authenticated;
-- This durable selection is worker-only. The desk already receives the
-- bounded target projection it needs and should never read run mappings.
REVOKE ALL ON TABLE public.prospect_research_run_entities FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.prospect_evidence FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.prospect_assessments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.prospect_feedback FROM authenticated;

DROP POLICY IF EXISTS targeting_profiles_select_tenant ON public.targeting_profiles;
CREATE POLICY targeting_profiles_select_tenant ON public.targeting_profiles
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = targeting_profiles.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

DROP POLICY IF EXISTS prospect_entities_select_tenant ON public.prospect_entities;
CREATE POLICY prospect_entities_select_tenant ON public.prospect_entities
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = prospect_entities.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

DROP POLICY IF EXISTS prospect_entity_links_select_tenant ON public.prospect_entity_links;
CREATE POLICY prospect_entity_links_select_tenant ON public.prospect_entity_links
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = prospect_entity_links.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

DROP POLICY IF EXISTS prospect_research_runs_select_tenant ON public.prospect_research_runs;
CREATE POLICY prospect_research_runs_select_tenant ON public.prospect_research_runs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = prospect_research_runs.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

DROP POLICY IF EXISTS prospect_evidence_select_tenant ON public.prospect_evidence;
CREATE POLICY prospect_evidence_select_tenant ON public.prospect_evidence
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = prospect_evidence.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

DROP POLICY IF EXISTS prospect_assessments_select_tenant ON public.prospect_assessments;
CREATE POLICY prospect_assessments_select_tenant ON public.prospect_assessments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = prospect_assessments.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

DROP POLICY IF EXISTS prospect_feedback_select_tenant ON public.prospect_feedback;
CREATE POLICY prospect_feedback_select_tenant ON public.prospect_feedback
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = prospect_feedback.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

-- An authenticated user may only upsert the brief associated with a service
-- profile in a workspace they belong to. tenant_id is intentionally not an RPC
-- argument and is resolved inside the function from membership.
CREATE OR REPLACE FUNCTION public.upsert_targeting_profile(
    target_service_profile_id UUID,
    target_types_input JSONB,
    ideal_customer_traits_input JSONB,
    change_triggers_input JSONB,
    strong_evidence_definitions_input JSONB,
    exclusions_input JSONB,
    seed_urls_input JSONB
)
RETURNS public.targeting_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    resolved_tenant_id TEXT;
    saved_profile public.targeting_profiles%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication is required to save a targeting profile'
            USING ERRCODE = '42501';
    END IF;
    IF NOT public.prospecting_target_types_are_valid(target_types_input)
       OR NOT public.prospecting_is_bounded_text_array(ideal_customer_traits_input, 40, 320)
       OR NOT public.prospecting_is_bounded_text_array(change_triggers_input, 40, 320)
       OR NOT public.prospecting_is_bounded_text_array(strong_evidence_definitions_input, 24, 480)
       OR NOT public.prospecting_is_bounded_text_array(exclusions_input, 40, 320)
       OR NOT public.prospecting_is_bounded_url_array(seed_urls_input, 50) THEN
        RAISE EXCEPTION 'targeting profile input is invalid or exceeds its bounded limits'
            USING ERRCODE = '22023';
    END IF;

    SELECT profile.tenant_id
      INTO resolved_tenant_id
      FROM public.service_profiles AS profile
      INNER JOIN public.tenant_users AS tenant_user
              ON tenant_user.tenant_id::TEXT = profile.tenant_id::TEXT
             AND tenant_user.user_id::TEXT = auth.uid()::TEXT
     WHERE profile.id = target_service_profile_id
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'service profile is not available in this workspace'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.targeting_profiles (
        tenant_id,
        service_profile_id,
        target_types,
        ideal_customer_traits,
        change_triggers,
        strong_evidence_definitions,
        exclusions,
        seed_urls,
        approval_status,
        profile_version,
        approved_at,
        approved_by
    ) VALUES (
        resolved_tenant_id,
        target_service_profile_id,
        target_types_input,
        ideal_customer_traits_input,
        change_triggers_input,
        strong_evidence_definitions_input,
        exclusions_input,
        seed_urls_input,
        'approved',
        1,
        NOW(),
        auth.uid()::TEXT
    )
    ON CONFLICT (tenant_id, service_profile_id)
    DO UPDATE SET
        target_types = EXCLUDED.target_types,
        ideal_customer_traits = EXCLUDED.ideal_customer_traits,
        change_triggers = EXCLUDED.change_triggers,
        strong_evidence_definitions = EXCLUDED.strong_evidence_definitions,
        exclusions = EXCLUDED.exclusions,
        seed_urls = EXCLUDED.seed_urls,
        approval_status = 'approved',
        profile_version = public.targeting_profiles.profile_version + 1,
        approved_at = NOW(),
        approved_by = auth.uid()::TEXT,
        updated_at = NOW()
    RETURNING * INTO saved_profile;

    RETURN saved_profile;
END;
$$;

-- Create a manual target only from a target type and canonical public URL.
-- The function does not accept provider payloads, contact details, evidence,
-- scores, assessment state, or tenant ID. A manual seed is high fit by user
-- choice, not a claim of current purchase intent.
CREATE OR REPLACE FUNCTION public.create_manual_prospect_entity(
    target_service_profile_id UUID,
    entity_kind_input TEXT,
    canonical_url_input TEXT,
    title_input TEXT DEFAULT NULL
)
RETURNS TABLE (
    entity_id UUID,
    assessment_id UUID,
    assessment_state TEXT,
    entity_created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    resolved_tenant_id TEXT;
    resolved_targeting_profile_id UUID;
    resolved_target_types JSONB;
    resolved_kind TEXT;
    resolved_url TEXT;
    resolved_title TEXT;
    persisted_entity_id UUID;
    persisted_assessment_id UUID;
    persisted_assessment_state TEXT;
    persisted_entity_created BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication is required to create a target'
            USING ERRCODE = '42501';
    END IF;
    resolved_kind = lower(btrim(COALESCE(entity_kind_input, '')));
    IF resolved_kind NOT IN ('account', 'builder', 'project') THEN
        RAISE EXCEPTION 'unsupported prospect entity kind'
            USING ERRCODE = '22023';
    END IF;
    resolved_url = btrim(COALESCE(canonical_url_input, ''));
    IF NOT public.prospecting_is_valid_public_http_url(resolved_url) THEN
        RAISE EXCEPTION 'canonical URL must be a bounded public http(s) URL without embedded contact data'
            USING ERRCODE = '22023';
    END IF;
    -- Builder titles are purposefully not retained: a public handle/name is
    -- not necessary for target assessment and can be personal data.
    IF resolved_kind = 'builder' THEN
        resolved_title = NULL;
    ELSE
        resolved_title = NULLIF(btrim(COALESCE(title_input, '')), '');
        IF NOT public.prospecting_is_safe_entity_title(resolved_title) THEN
            RAISE EXCEPTION 'target title must be a short business/project descriptor without contact data'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    SELECT profile.tenant_id, targeting_profile.id, targeting_profile.target_types
      INTO resolved_tenant_id, resolved_targeting_profile_id, resolved_target_types
      FROM public.service_profiles AS profile
      INNER JOIN public.tenant_users AS tenant_user
              ON tenant_user.tenant_id::TEXT = profile.tenant_id::TEXT
             AND tenant_user.user_id::TEXT = auth.uid()::TEXT
      INNER JOIN public.targeting_profiles AS targeting_profile
              ON targeting_profile.tenant_id = profile.tenant_id
             AND targeting_profile.service_profile_id = profile.id
             AND targeting_profile.approval_status = 'approved'
     WHERE profile.id = target_service_profile_id
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'an approved targeting profile is required before creating a target'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM jsonb_array_elements_text(resolved_target_types) AS target_type(value)
         WHERE target_type.value = resolved_kind
    ) THEN
        RAISE EXCEPTION 'prospect entity kind is not enabled by this targeting profile'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.prospect_entities (
        tenant_id,
        entity_kind,
        entity_provider,
        entity_external_id,
        canonical_url,
        title,
        origin_kind
    ) VALUES (
        resolved_tenant_id,
        resolved_kind,
        'manual',
        resolved_url,
        resolved_url,
        resolved_title,
        'manual'
    )
    ON CONFLICT (tenant_id, entity_kind, entity_provider, entity_external_id)
    DO UPDATE SET
        title = COALESCE(EXCLUDED.title, public.prospect_entities.title),
        last_seen_at = NOW(),
        updated_at = NOW()
    RETURNING id, (xmax = 0) INTO persisted_entity_id, persisted_entity_created;

    INSERT INTO public.prospect_assessments (
        tenant_id,
        targeting_profile_id,
        prospect_entity_id,
        assessment_state,
        reason_codes
    ) VALUES (
        resolved_tenant_id,
        resolved_targeting_profile_id,
        persisted_entity_id,
        'high_fit',
        '["manual_seed"]'::JSONB
    )
    ON CONFLICT (tenant_id, targeting_profile_id, prospect_entity_id)
    DO UPDATE SET
        last_assessed_at = NOW(),
        updated_at = NOW()
    RETURNING id, assessment_state
      INTO persisted_assessment_id, persisted_assessment_state;

    RETURN QUERY SELECT
        persisted_entity_id,
        persisted_assessment_id,
        persisted_assessment_state,
        persisted_entity_created;
END;
$$;

-- Return only the tenant's reviewable evidence projection. Global source-post
-- data remains private to the retention layer: the sole projected source-post
-- field is its original URL, used as the human-review citation without URL
-- normalization or any author/body metadata.
CREATE OR REPLACE FUNCTION public.list_prospect_evidence_for_profile(
    target_profile_id UUID
)
RETURNS TABLE (
    id UUID,
    prospect_entity_id UUID,
    evidence_type TEXT,
    summary TEXT,
    source TEXT,
    source_url TEXT,
    evidence_excerpt TEXT,
    evidence_strength TEXT,
    evidence_status TEXT,
    observed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    resolved_tenant_id TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication is required to list target evidence'
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
    SELECT evidence.id,
           evidence.prospect_entity_id,
           evidence.evidence_type,
           evidence.summary,
           evidence.source,
           COALESCE(source_posts.url, evidence.source_url) AS source_url,
           evidence.evidence_excerpt,
           evidence.evidence_strength,
           evidence.evidence_status,
           evidence.observed_at
      FROM public.prospect_evidence AS evidence
      LEFT JOIN public.source_posts AS source_posts
             ON source_posts.id = evidence.source_post_id
            AND source_posts.tenant_id IS NULL
     WHERE evidence.tenant_id = resolved_tenant_id
       AND evidence.targeting_profile_id = target_profile_id
       AND evidence.evidence_status IN ('pending', 'accepted')
     ORDER BY evidence.observed_at DESC, evidence.id DESC
     LIMIT 300;
END;
$$;

-- Outcome summaries are aggregate-only. They let a workspace see whether its
-- target feedback is accumulating without exposing reviewer identities or
-- turning individual outcomes into an automatic ranking adjustment.
CREATE OR REPLACE FUNCTION public.list_prospect_feedback_summary_for_profile(
    target_profile_id UUID
)
RETURNS TABLE (
    feedback_type TEXT,
    feedback_count BIGINT,
    target_count BIGINT,
    latest_feedback_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    resolved_tenant_id TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication is required to list target feedback'
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
    SELECT feedback.feedback_type,
           count(*)::BIGINT AS feedback_count,
           count(DISTINCT feedback.prospect_assessment_id)::BIGINT AS target_count,
           max(feedback.created_at) AS latest_feedback_at
      FROM public.prospect_feedback AS feedback
      INNER JOIN public.prospect_assessments AS assessment
              ON assessment.id = feedback.prospect_assessment_id
             AND assessment.tenant_id = feedback.tenant_id
     WHERE feedback.tenant_id = resolved_tenant_id
       AND assessment.targeting_profile_id = target_profile_id
     GROUP BY feedback.feedback_type
     ORDER BY max(feedback.created_at) DESC, feedback.feedback_type ASC
     LIMIT 9;
END;
$$;

-- Evidence starts pending. This is the only browser-facing path that can
-- record a human review; it derives the tenant and reviewer from auth rather
-- than accepting either from the caller. A same-decision retry is safe, while
-- a conflicting second decision is intentionally terminal.
CREATE OR REPLACE FUNCTION public.review_prospect_evidence(
    target_evidence_id UUID,
    decision_input TEXT
)
RETURNS TABLE (
    evidence_id UUID,
    evidence_status TEXT,
    assessment_id UUID,
    assessment_state TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    resolved_decision TEXT;
    saved_evidence public.prospect_evidence%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication is required to review target evidence'
            USING ERRCODE = '42501';
    END IF;

    resolved_decision = lower(btrim(COALESCE(decision_input, '')));
    IF resolved_decision NOT IN ('accepted', 'rejected') THEN
        RAISE EXCEPTION 'evidence review decision must be accepted or rejected'
            USING ERRCODE = '22023';
    END IF;

    -- Lock the item before deciding whether this is a first review, a
    -- retry, or a conflicting concurrent review. Membership is checked in
    -- the same lookup so an arbitrary UUID cannot cross workspace scope.
    SELECT evidence.*
      INTO saved_evidence
      FROM public.prospect_evidence AS evidence
     WHERE evidence.id = target_evidence_id
       AND EXISTS (
            SELECT 1
              FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = evidence.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
       )
     FOR UPDATE OF evidence;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'target evidence is not available in this workspace'
            USING ERRCODE = '42501';
    END IF;

    IF saved_evidence.evidence_status = 'pending' THEN
        UPDATE public.prospect_evidence AS evidence
           SET evidence_status = resolved_decision,
               verified_at = NOW(),
               verified_by = auth.uid()::TEXT,
               updated_at = NOW()
         WHERE evidence.id = saved_evidence.id
         RETURNING * INTO saved_evidence;
    ELSIF saved_evidence.evidence_status <> resolved_decision THEN
        RAISE EXCEPTION 'target evidence has already received a terminal review'
            USING ERRCODE = '23514';
    END IF;

    evidence_id = saved_evidence.id;
    evidence_status = saved_evidence.evidence_status;
    SELECT assessment.id, assessment.assessment_state
      INTO assessment_id, assessment_state
      FROM public.prospect_assessments AS assessment
     WHERE assessment.tenant_id = saved_evidence.tenant_id
       AND assessment.targeting_profile_id = saved_evidence.targeting_profile_id
       AND assessment.prospect_entity_id = saved_evidence.prospect_entity_id;
    RETURN NEXT;
END;
$$;

-- Feedback is an immutable event. Its narrow RPC derives both the tenant and
-- the acting user from authenticated membership, so a browser cannot attach a
-- feedback event to another workspace or impersonate a reviewer.
CREATE OR REPLACE FUNCTION public.submit_prospect_feedback(
    target_assessment_id UUID,
    feedback_type_input TEXT,
    reason_code_input TEXT DEFAULT NULL
)
RETURNS public.prospect_feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    resolved_tenant_id TEXT;
    resolved_feedback_type TEXT;
    resolved_reason_code TEXT;
    saved_feedback public.prospect_feedback%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication is required to submit target feedback'
            USING ERRCODE = '42501';
    END IF;
    resolved_feedback_type = lower(btrim(COALESCE(feedback_type_input, '')));
    resolved_reason_code = NULLIF(lower(btrim(COALESCE(reason_code_input, ''))), '');
    IF resolved_feedback_type NOT IN (
        'promote_to_opportunity', 'target', 'useful_not_now', 'not_relevant',
        'monitor', 'contacted', 'meeting', 'won', 'lost'
    ) OR (resolved_reason_code IS NOT NULL AND resolved_reason_code !~ '^[a-z0-9_:-]{1,80}$') THEN
        RAISE EXCEPTION 'prospect feedback input is invalid'
            USING ERRCODE = '22023';
    END IF;

    SELECT assessment.tenant_id
      INTO resolved_tenant_id
      FROM public.prospect_assessments AS assessment
      INNER JOIN public.tenant_users AS tenant_user
              ON tenant_user.tenant_id::TEXT = assessment.tenant_id::TEXT
             AND tenant_user.user_id::TEXT = auth.uid()::TEXT
     WHERE assessment.id = target_assessment_id
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'prospect assessment is not available in this workspace'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.prospect_feedback (
        tenant_id,
        prospect_assessment_id,
        user_id,
        feedback_type,
        reason_code
    ) VALUES (
        resolved_tenant_id,
        target_assessment_id,
        auth.uid()::TEXT,
        resolved_feedback_type,
        resolved_reason_code
    )
    ON CONFLICT (tenant_id, prospect_assessment_id, user_id, feedback_type)
    DO NOTHING
    RETURNING * INTO saved_feedback;

    IF NOT FOUND THEN
        SELECT *
          INTO saved_feedback
          FROM public.prospect_feedback AS feedback
         WHERE feedback.tenant_id = resolved_tenant_id
           AND feedback.prospect_assessment_id = target_assessment_id
           AND feedback.user_id = auth.uid()::TEXT
           AND feedback.feedback_type = resolved_feedback_type;
    END IF;

    RETURN saved_feedback;
END;
$$;

REVOKE ALL ON FUNCTION public.prospecting_is_bounded_text_array(JSONB, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prospecting_is_valid_public_http_url(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prospecting_is_bounded_url_array(JSONB, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prospecting_target_types_are_valid(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prospecting_public_evidence_sources_are_valid(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prospecting_is_safe_entity_title(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prospecting_is_safe_evidence_summary(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_entity_first_prospecting_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_targeting_profile_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_prospect_entity_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_prospect_entity_link_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_prospect_research_run_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_prospect_research_run_entity_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_prospect_evidence_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_prospect_assessment_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_prospect_feedback_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_prospect_assessment_after_evidence_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_targeting_profile(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_manual_prospect_entity(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_prospect_evidence_for_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_prospect_feedback_summary_for_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_prospect_evidence(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_prospect_feedback(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_targeting_profile(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_prospect_entity(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_prospect_evidence_for_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_prospect_feedback_summary_for_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_prospect_evidence(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_prospect_feedback(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
