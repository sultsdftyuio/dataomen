-- Buyer-language research evidence contract.
--
-- Apply after scripts/prospect_intelligence_contract.sql.  This migration
-- deliberately keeps research evidence separate from lead_matches: it is
-- tenant-owned source material for review and must never become a CRM action
-- or qualified opportunity without the normal verifier pipeline.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.discovery_runs') IS NULL
       OR to_regclass('public.service_profiles') IS NULL
       OR to_regclass('public.tenant_users') IS NULL THEN
        RAISE EXCEPTION
            'buyer_language_research_contract requires the prospect intelligence contract';
    END IF;
END;
$$;

-- Historical discovery runs were all opportunity searches.  Backfill them
-- before making the discriminator mandatory, so applying this migration does
-- not change their behaviour or discard their telemetry.
ALTER TABLE public.discovery_runs
    ADD COLUMN IF NOT EXISTS run_kind TEXT;

UPDATE public.discovery_runs
   SET run_kind = 'opportunity_leads'
 WHERE run_kind IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM public.discovery_runs
         WHERE run_kind NOT IN ('opportunity_leads', 'buyer_language_research')
    ) THEN
        RAISE EXCEPTION
            'discovery_runs.run_kind contains an unsupported value; map it before applying the buyer-language research contract';
    END IF;
END;
$$;

ALTER TABLE public.discovery_runs
    ALTER COLUMN run_kind SET DEFAULT 'opportunity_leads';
ALTER TABLE public.discovery_runs
    ALTER COLUMN run_kind SET NOT NULL;
ALTER TABLE public.discovery_runs
    DROP CONSTRAINT IF EXISTS discovery_runs_run_kind_check;
ALTER TABLE public.discovery_runs
    ADD CONSTRAINT discovery_runs_run_kind_check
    CHECK (run_kind IN ('opportunity_leads', 'buyer_language_research'));

-- Raw, tenant-local material discovered while learning how customers describe
-- their own problems.  There is intentionally no lead-match or CRM reference
-- here.  evidence_key is a stable SHA-256 fingerprint supplied by the worker,
-- which provides idempotency without exposing another tenant's evidence.
CREATE TABLE IF NOT EXISTS public.discovery_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    discovery_run_id UUID NOT NULL,
    service_profile_id UUID NOT NULL,
    source TEXT NOT NULL,
    source_post_id TEXT,
    source_url TEXT,
    query_type TEXT NOT NULL,
    query_phrase TEXT NOT NULL,
    title TEXT,
    source_text TEXT NOT NULL,
    evidence_excerpt TEXT,
    evidence_status TEXT NOT NULL DEFAULT 'pending',
    observed_at TIMESTAMPTZ,
    evidence_key TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT discovery_evidence_source_check
        CHECK (char_length(btrim(source)) BETWEEN 1 AND 120),
    CONSTRAINT discovery_evidence_source_post_id_check
        CHECK (source_post_id IS NULL OR char_length(btrim(source_post_id)) BETWEEN 1 AND 512),
    CONSTRAINT discovery_evidence_source_url_check
        CHECK (source_url IS NULL OR source_url ~* '^https?://[^[:space:]]+$'),
    CONSTRAINT discovery_evidence_query_type_check
        CHECK (query_type IN (
            'buyer_pain',
            'urgent_failure',
            'recommendation_request',
            'manual_workflow_frustration',
            'category_tool_search',
            'switching_trigger'
        )),
    CONSTRAINT discovery_evidence_query_phrase_check
        CHECK (char_length(btrim(query_phrase)) BETWEEN 1 AND 512),
    CONSTRAINT discovery_evidence_title_check
        CHECK (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 1000),
    CONSTRAINT discovery_evidence_source_text_check
        CHECK (char_length(source_text) BETWEEN 1 AND 16000),
    CONSTRAINT discovery_evidence_excerpt_check
        CHECK (evidence_excerpt IS NULL OR char_length(evidence_excerpt) BETWEEN 1 AND 2000),
    CONSTRAINT discovery_evidence_excerpt_grounded_check
        CHECK (evidence_excerpt IS NULL OR position(evidence_excerpt IN source_text) > 0),
    CONSTRAINT discovery_evidence_status_check
        CHECK (evidence_status IN ('pending', 'accepted', 'rejected')),
    CONSTRAINT discovery_evidence_accepted_excerpt_check
        CHECK (evidence_status <> 'accepted' OR evidence_excerpt IS NOT NULL),
    CONSTRAINT discovery_evidence_key_check
        CHECK (evidence_key ~ '^[0-9a-f]{64}$'),
    CONSTRAINT discovery_evidence_metadata_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE public.discovery_evidence IS
    'Tenant-scoped raw buyer-language research evidence; not a lead or CRM queue.';

-- The composite keys protect trusted worker/service writes as well as browser
-- access.  IDs happen to be globally unique, but tenant-scoped relationships
-- make accidental cross-tenant attachment impossible by construction.
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
END;
$$;

ALTER TABLE public.discovery_evidence
    DROP CONSTRAINT IF EXISTS fk_discovery_evidence_tenant_run;
ALTER TABLE public.discovery_evidence
    ADD CONSTRAINT fk_discovery_evidence_tenant_run
    FOREIGN KEY (tenant_id, discovery_run_id)
    REFERENCES public.discovery_runs (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.discovery_evidence
    DROP CONSTRAINT IF EXISTS fk_discovery_evidence_tenant_service_profile;
ALTER TABLE public.discovery_evidence
    ADD CONSTRAINT fk_discovery_evidence_tenant_service_profile
    FOREIGN KEY (tenant_id, service_profile_id)
    REFERENCES public.service_profiles (tenant_id, id)
    ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_discovery_evidence_tenant_profile_created_at
    ON public.discovery_evidence(tenant_id, service_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_evidence_tenant_run_created_at
    ON public.discovery_evidence(tenant_id, discovery_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_evidence_tenant_source_observed_at
    ON public.discovery_evidence(tenant_id, source, observed_at DESC NULLS LAST);
CREATE UNIQUE INDEX IF NOT EXISTS uq_discovery_evidence_tenant_profile_key
    ON public.discovery_evidence(tenant_id, service_profile_id, evidence_key);

CREATE OR REPLACE FUNCTION public.set_buyer_language_research_updated_at()
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

-- This is deliberately a second guard rather than a replacement for the
-- prospect-intelligence scope guard, so the original opportunity pipeline
-- retains its tenant/profile checks unchanged.
CREATE OR REPLACE FUNCTION public.guard_discovery_run_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.run_kind IS NULL
       OR NEW.run_kind NOT IN ('opportunity_leads', 'buyer_language_research') THEN
        RAISE EXCEPTION 'unsupported discovery run kind'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.run_kind IS DISTINCT FROM OLD.run_kind THEN
        RAISE EXCEPTION 'discovery run kind is immutable'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

-- Research rows must stay attached to the exact tenant/profile/run that
-- created them.  In particular, normal opportunity runs cannot write raw
-- research evidence, which keeps this mode outside the lead workflow.
CREATE OR REPLACE FUNCTION public.guard_discovery_evidence_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    run_profile_id UUID;
    run_kind_value TEXT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.discovery_run_id IS DISTINCT FROM OLD.discovery_run_id
           OR NEW.service_profile_id IS DISTINCT FROM OLD.service_profile_id
           OR NEW.source IS DISTINCT FROM OLD.source
           OR NEW.source_post_id IS DISTINCT FROM OLD.source_post_id
           OR NEW.source_url IS DISTINCT FROM OLD.source_url
           OR NEW.query_type IS DISTINCT FROM OLD.query_type
           OR NEW.query_phrase IS DISTINCT FROM OLD.query_phrase
           OR NEW.title IS DISTINCT FROM OLD.title
           OR NEW.source_text IS DISTINCT FROM OLD.source_text
           OR NEW.evidence_excerpt IS DISTINCT FROM OLD.evidence_excerpt
           OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
           OR NEW.evidence_key IS DISTINCT FROM OLD.evidence_key
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       ) THEN
        RAISE EXCEPTION 'research evidence identity and source material are immutable'
            USING ERRCODE = '23514';
    END IF;

    SELECT run.service_profile_id, run.run_kind
      INTO run_profile_id, run_kind_value
      FROM public.discovery_runs AS run
     WHERE run.id = NEW.discovery_run_id
       AND run.tenant_id = NEW.tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'discovery run does not belong to research evidence tenant'
            USING ERRCODE = '23503';
    END IF;

    IF run_kind_value <> 'buyer_language_research' THEN
        RAISE EXCEPTION 'research evidence requires a buyer_language_research discovery run'
            USING ERRCODE = '23514';
    END IF;

    IF run_profile_id IS DISTINCT FROM NEW.service_profile_id THEN
        RAISE EXCEPTION 'service profile does not belong to research discovery run'
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS discovery_runs_kind_guard ON public.discovery_runs;
CREATE TRIGGER discovery_runs_kind_guard
    BEFORE INSERT OR UPDATE ON public.discovery_runs
    FOR EACH ROW EXECUTE FUNCTION public.guard_discovery_run_kind();

DROP TRIGGER IF EXISTS discovery_evidence_scope_guard ON public.discovery_evidence;
CREATE TRIGGER discovery_evidence_scope_guard
    BEFORE INSERT OR UPDATE ON public.discovery_evidence
    FOR EACH ROW EXECUTE FUNCTION public.guard_discovery_evidence_tenant_scope();

DROP TRIGGER IF EXISTS discovery_evidence_updated_at ON public.discovery_evidence;
CREATE TRIGGER discovery_evidence_updated_at
    BEFORE UPDATE ON public.discovery_evidence
    FOR EACH ROW EXECUTE FUNCTION public.set_buyer_language_research_updated_at();

-- Browser clients receive read-only tenant-scoped evidence.  Workers use a
-- trusted service role and retain responsibility for validation and retention;
-- customers cannot write, mutate, or erase raw research from the browser.
ALTER TABLE public.discovery_evidence ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.discovery_evidence TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.discovery_evidence FROM authenticated;

DROP POLICY IF EXISTS discovery_evidence_select_tenant ON public.discovery_evidence;
CREATE POLICY discovery_evidence_select_tenant ON public.discovery_evidence
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = discovery_evidence.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

REVOKE ALL ON FUNCTION public.guard_discovery_run_kind() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_discovery_evidence_tenant_scope() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
