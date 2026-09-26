-- Explicit opportunity handoff for entity-first prospecting.
--
-- Apply after:
--   * scripts/RLS_updates.sql
--   * scripts/entity_first_prospecting_contract.sql
--
-- A target is not silently converted into a legacy ``lead_matches`` row:
-- that table represents verifier-owned public-post matching. This additive
-- contract preserves the target's accepted evidence provenance and creates an
-- opportunity only after a tenant member explicitly chooses to do so. It never
-- fetches contacts, sends outreach, or invokes a CRM webhook by itself.

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.tenants') IS NULL
       OR to_regclass('public.tenant_users') IS NULL
       OR to_regclass('public.service_profiles') IS NULL
       OR to_regclass('public.targeting_profiles') IS NULL
       OR to_regclass('public.prospect_entities') IS NULL
       OR to_regclass('public.prospect_assessments') IS NULL
       OR to_regclass('public.prospect_evidence') IS NULL THEN
        RAISE EXCEPTION
            'prospect_target_opportunity_contract requires the entity-first prospecting contract';
    END IF;
END;
$$;

-- Exactly one human-created opportunity may exist for a target assessment.
-- Keeping the accepted evidence ID immutable makes the user-approved source
-- auditable and prevents a later worker result from silently changing what the
-- opportunity was based on. Evidence removal cascades to this row so retention
-- work is never blocked by a downstream sales record.
CREATE TABLE IF NOT EXISTS public.prospect_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    service_profile_id UUID NOT NULL,
    targeting_profile_id UUID NOT NULL,
    prospect_assessment_id UUID NOT NULL,
    prospect_entity_id UUID NOT NULL,
    prospect_evidence_id UUID NOT NULL,
    opportunity_status TEXT NOT NULL DEFAULT 'ready_for_review',
    created_by TEXT NOT NULL,
    qualified_by TEXT,
    qualified_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT prospect_opportunities_status_check
        CHECK (opportunity_status IN ('ready_for_review', 'qualified', 'invalidated')),
    CONSTRAINT prospect_opportunities_created_by_check
        CHECK (char_length(btrim(created_by)) BETWEEN 1 AND 128),
    CONSTRAINT prospect_opportunities_qualified_by_check
        CHECK (qualified_by IS NULL OR char_length(btrim(qualified_by)) BETWEEN 1 AND 128),
    CONSTRAINT prospect_opportunities_lifecycle_check
        CHECK (
            (opportunity_status = 'ready_for_review'
                AND qualified_by IS NULL
                AND qualified_at IS NULL
                AND invalidated_at IS NULL)
            OR (opportunity_status = 'qualified'
                AND qualified_by IS NOT NULL
                AND qualified_at IS NOT NULL
                AND invalidated_at IS NULL)
            OR (opportunity_status = 'invalidated'
                AND invalidated_at IS NOT NULL)
        ),
    CONSTRAINT uq_prospect_opportunities_tenant_assessment
        UNIQUE (tenant_id, prospect_assessment_id)
);

COMMENT ON TABLE public.prospect_opportunities IS
    'Human-created entity-first opportunity with one accepted cited evidence record. It is separate from verifier-owned lead_matches and never triggers outreach or CRM delivery automatically.';

-- Entity-first migration supplies the tenant + id uniqueness needed by these
-- composite relationships. Use cascades only for source/evidence retention:
-- an invalidated source must not be retained merely because it was promoted.
ALTER TABLE public.prospect_opportunities
    DROP CONSTRAINT IF EXISTS fk_prospect_opportunities_tenant_service_profile;
ALTER TABLE public.prospect_opportunities
    ADD CONSTRAINT fk_prospect_opportunities_tenant_service_profile
    FOREIGN KEY (tenant_id, service_profile_id)
    REFERENCES public.service_profiles (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_opportunities
    DROP CONSTRAINT IF EXISTS fk_prospect_opportunities_tenant_targeting_profile;
ALTER TABLE public.prospect_opportunities
    ADD CONSTRAINT fk_prospect_opportunities_tenant_targeting_profile
    FOREIGN KEY (tenant_id, targeting_profile_id)
    REFERENCES public.targeting_profiles (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_opportunities
    DROP CONSTRAINT IF EXISTS fk_prospect_opportunities_tenant_assessment;
ALTER TABLE public.prospect_opportunities
    ADD CONSTRAINT fk_prospect_opportunities_tenant_assessment
    FOREIGN KEY (tenant_id, prospect_assessment_id)
    REFERENCES public.prospect_assessments (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_opportunities
    DROP CONSTRAINT IF EXISTS fk_prospect_opportunities_tenant_entity;
ALTER TABLE public.prospect_opportunities
    ADD CONSTRAINT fk_prospect_opportunities_tenant_entity
    FOREIGN KEY (tenant_id, prospect_entity_id)
    REFERENCES public.prospect_entities (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.prospect_opportunities
    DROP CONSTRAINT IF EXISTS fk_prospect_opportunities_tenant_evidence;
ALTER TABLE public.prospect_opportunities
    ADD CONSTRAINT fk_prospect_opportunities_tenant_evidence
    FOREIGN KEY (tenant_id, prospect_evidence_id)
    REFERENCES public.prospect_evidence (tenant_id, id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_prospect_opportunities_tenant_profile_status
    ON public.prospect_opportunities(
        tenant_id,
        targeting_profile_id,
        opportunity_status,
        updated_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_prospect_opportunities_tenant_service_status
    ON public.prospect_opportunities(
        tenant_id,
        service_profile_id,
        opportunity_status,
        updated_at DESC
    );

-- A low-level guard protects service-side writes as well as browser RPCs.
-- It intentionally allows accepted trigger/problem/evaluation evidence rather
-- than only a strong buyer signal: the human promotion is what enables the
-- colder end of the cold-to-hot workflow. Fit-only or relationship-only facts
-- are deliberately insufficient.
CREATE OR REPLACE FUNCTION public.guard_prospect_opportunity_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    evidence_status TEXT;
    evidence_type TEXT;
    evidence_source_url TEXT;
    assessment_state TEXT;
    target_profile_service_profile_id UUID;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.service_profile_id IS DISTINCT FROM OLD.service_profile_id
           OR NEW.targeting_profile_id IS DISTINCT FROM OLD.targeting_profile_id
           OR NEW.prospect_assessment_id IS DISTINCT FROM OLD.prospect_assessment_id
           OR NEW.prospect_entity_id IS DISTINCT FROM OLD.prospect_entity_id
           OR NEW.prospect_evidence_id IS DISTINCT FROM OLD.prospect_evidence_id
           OR NEW.created_by IS DISTINCT FROM OLD.created_by
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
       ) THEN
        RAISE EXCEPTION 'prospect opportunity tenant, provenance, and creator are immutable'
            USING ERRCODE = '23514';
    END IF;

    SELECT profile.service_profile_id
      INTO target_profile_service_profile_id
      FROM public.targeting_profiles AS profile
     WHERE profile.tenant_id = NEW.tenant_id
       AND profile.id = NEW.targeting_profile_id;
    IF NOT FOUND OR target_profile_service_profile_id IS DISTINCT FROM NEW.service_profile_id THEN
        RAISE EXCEPTION 'prospect opportunity targeting profile does not belong to service profile tenant'
            USING ERRCODE = '23503';
    END IF;

    SELECT assessment.assessment_state
      INTO assessment_state
      FROM public.prospect_assessments AS assessment
     WHERE assessment.tenant_id = NEW.tenant_id
       AND assessment.id = NEW.prospect_assessment_id
       AND assessment.targeting_profile_id = NEW.targeting_profile_id
       AND assessment.prospect_entity_id = NEW.prospect_entity_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'prospect opportunity assessment crosses tenant or target scope'
            USING ERRCODE = '23503';
    END IF;

    SELECT evidence.evidence_status,
           evidence.evidence_type,
           evidence.source_url
      INTO evidence_status,
           evidence_type,
           evidence_source_url
      FROM public.prospect_evidence AS evidence
     WHERE evidence.tenant_id = NEW.tenant_id
       AND evidence.id = NEW.prospect_evidence_id
       AND evidence.targeting_profile_id = NEW.targeting_profile_id
       AND evidence.prospect_entity_id = NEW.prospect_entity_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'prospect opportunity evidence crosses tenant or target scope'
            USING ERRCODE = '23503';
    END IF;

    IF NEW.opportunity_status <> 'invalidated'
       AND (
           assessment_state = 'rejected'
           OR evidence_status <> 'accepted'
           OR evidence_type NOT IN ('trigger', 'problem', 'evaluation')
           OR evidence_source_url IS NULL
       ) THEN
        RAISE EXCEPTION 'prospect opportunity requires accepted cited trigger, problem, or evaluation evidence'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.opportunity_status = 'qualified'
       AND NEW.opportunity_status = 'ready_for_review' THEN
        RAISE EXCEPTION 'qualified prospect opportunity cannot be reopened in place'
            USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.opportunity_status = 'invalidated'
       AND NEW.opportunity_status <> 'invalidated' THEN
        RAISE EXCEPTION 'invalidated prospect opportunity cannot be reopened in place'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

-- A target rejection must remove it from the actionable opportunity state.
-- The row remains as a local audit record until ordinary evidence retention
-- removes the cited source; it cannot be requalified or exported afterward.
CREATE OR REPLACE FUNCTION public.invalidate_prospect_opportunity_after_assessment_rejection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.assessment_state = 'rejected'
       AND OLD.assessment_state IS DISTINCT FROM NEW.assessment_state THEN
        UPDATE public.prospect_opportunities AS opportunity
           SET opportunity_status = 'invalidated',
               invalidated_at = NOW(),
               updated_at = NOW()
         WHERE opportunity.tenant_id = NEW.tenant_id
           AND opportunity.targeting_profile_id = NEW.targeting_profile_id
           AND opportunity.prospect_assessment_id = NEW.id
           AND opportunity.opportunity_status <> 'invalidated';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prospect_opportunities_scope_guard ON public.prospect_opportunities;
CREATE TRIGGER prospect_opportunities_scope_guard
    BEFORE INSERT OR UPDATE ON public.prospect_opportunities
    FOR EACH ROW EXECUTE FUNCTION public.guard_prospect_opportunity_tenant_scope();

DROP TRIGGER IF EXISTS prospect_opportunities_updated_at ON public.prospect_opportunities;
CREATE TRIGGER prospect_opportunities_updated_at
    BEFORE UPDATE ON public.prospect_opportunities
    FOR EACH ROW EXECUTE FUNCTION public.set_entity_first_prospecting_updated_at();

DROP TRIGGER IF EXISTS prospect_assessments_invalidate_opportunity_after_rejection
    ON public.prospect_assessments;
CREATE TRIGGER prospect_assessments_invalidate_opportunity_after_rejection
    AFTER UPDATE OF assessment_state ON public.prospect_assessments
    FOR EACH ROW EXECUTE FUNCTION public.invalidate_prospect_opportunity_after_assessment_rejection();

ALTER TABLE public.prospect_opportunities ENABLE ROW LEVEL SECURITY;

-- The table includes audit identity and a precise evidence linkage. The target
-- desk only needs a narrow status projection, so direct browser reads/writes
-- are intentionally unavailable.
REVOKE ALL ON TABLE public.prospect_opportunities FROM authenticated;
REVOKE ALL ON TABLE public.prospect_opportunities FROM PUBLIC;

-- Create one opportunity only after a user explicitly chooses an accepted,
-- cited evidence item already visible in their target desk. Neither tenant,
-- profile, entity, service profile, source URL, contact, nor score is accepted
-- from the browser.
CREATE OR REPLACE FUNCTION public.create_prospect_opportunity(
    target_assessment_id UUID,
    target_evidence_id UUID
)
RETURNS TABLE (
    opportunity_id UUID,
    opportunity_status TEXT,
    created BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    resolved_tenant_id TEXT;
    resolved_service_profile_id UUID;
    resolved_targeting_profile_id UUID;
    resolved_entity_id UUID;
    resolved_assessment_state TEXT;
    resolved_evidence_status TEXT;
    resolved_evidence_type TEXT;
    resolved_evidence_source_url TEXT;
    saved_opportunity public.prospect_opportunities%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication is required to create an opportunity'
            USING ERRCODE = '42501';
    END IF;

    SELECT assessment.tenant_id,
           profile.service_profile_id,
           assessment.targeting_profile_id,
           assessment.prospect_entity_id,
           assessment.assessment_state,
           evidence.evidence_status,
           evidence.evidence_type,
           evidence.source_url
      INTO resolved_tenant_id,
           resolved_service_profile_id,
           resolved_targeting_profile_id,
           resolved_entity_id,
           resolved_assessment_state,
           resolved_evidence_status,
           resolved_evidence_type,
           resolved_evidence_source_url
      FROM public.prospect_assessments AS assessment
      INNER JOIN public.targeting_profiles AS profile
              ON profile.tenant_id = assessment.tenant_id
             AND profile.id = assessment.targeting_profile_id
      INNER JOIN public.prospect_evidence AS evidence
              ON evidence.tenant_id = assessment.tenant_id
             AND evidence.id = target_evidence_id
             AND evidence.targeting_profile_id = assessment.targeting_profile_id
             AND evidence.prospect_entity_id = assessment.prospect_entity_id
      INNER JOIN public.tenant_users AS tenant_user
              ON tenant_user.tenant_id::TEXT = assessment.tenant_id::TEXT
             AND tenant_user.user_id::TEXT = auth.uid()::TEXT
     WHERE assessment.id = target_assessment_id
     FOR UPDATE OF assessment, evidence;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'accepted target evidence is not available in this workspace'
            USING ERRCODE = '42501';
    END IF;
    IF resolved_assessment_state = 'rejected'
       OR resolved_evidence_status <> 'accepted'
       OR resolved_evidence_type NOT IN ('trigger', 'problem', 'evaluation')
       OR resolved_evidence_source_url IS NULL THEN
        RAISE EXCEPTION 'choose accepted cited trigger, problem, or evaluation evidence before creating an opportunity'
            USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.prospect_opportunities (
        tenant_id,
        service_profile_id,
        targeting_profile_id,
        prospect_assessment_id,
        prospect_entity_id,
        prospect_evidence_id,
        opportunity_status,
        created_by
    ) VALUES (
        resolved_tenant_id,
        resolved_service_profile_id,
        resolved_targeting_profile_id,
        target_assessment_id,
        resolved_entity_id,
        target_evidence_id,
        'ready_for_review',
        auth.uid()::TEXT
    )
    ON CONFLICT (tenant_id, prospect_assessment_id)
    DO NOTHING
    RETURNING * INTO saved_opportunity;

    IF FOUND THEN
        opportunity_id = saved_opportunity.id;
        opportunity_status = saved_opportunity.opportunity_status;
        created = TRUE;
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT *
      INTO saved_opportunity
      FROM public.prospect_opportunities AS opportunity
     WHERE opportunity.tenant_id = resolved_tenant_id
       AND opportunity.prospect_assessment_id = target_assessment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'could not resolve the existing prospect opportunity'
            USING ERRCODE = '40001';
    END IF;

    opportunity_id = saved_opportunity.id;
    opportunity_status = saved_opportunity.opportunity_status;
    created = FALSE;
    RETURN NEXT;
END;
$$;

-- The browser needs only a target-to-opportunity status mapping. Evidence,
-- source locator, reviewer identity, service profile, and CRM delivery state
-- stay server-owned.
CREATE OR REPLACE FUNCTION public.list_prospect_opportunity_status_for_profile(
    target_profile_id UUID
)
RETURNS TABLE (
    prospect_assessment_id UUID,
    opportunity_id UUID,
    opportunity_status TEXT,
    created_at TIMESTAMPTZ,
    qualified_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    resolved_tenant_id TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication is required to list target opportunities'
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
    SELECT opportunity.prospect_assessment_id,
           opportunity.id,
           opportunity.opportunity_status,
           opportunity.created_at,
           opportunity.qualified_at
      FROM public.prospect_opportunities AS opportunity
     WHERE opportunity.tenant_id = resolved_tenant_id
       AND opportunity.targeting_profile_id = target_profile_id
     ORDER BY opportunity.updated_at DESC, opportunity.id ASC
     LIMIT 100;
END;
$$;

-- This is deliberately a distinct second user decision. It mirrors the legacy
-- ready_for_review -> qualified boundary, but returns only the safe, accepted
-- citation fields required by the server action's optional CRM webhook. The
-- conditional update plus row lock prevents concurrent requests from both
-- claiming a delivery. No webhook is called from SQL.
CREATE OR REPLACE FUNCTION public.qualify_prospect_opportunity(
    target_opportunity_id UUID
)
RETURNS TABLE (
    opportunity_id UUID,
    opportunity_status TEXT,
    already_qualified BOOLEAN,
    evidence_source TEXT,
    evidence_source_url TEXT,
    evidence_summary TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    saved_opportunity public.prospect_opportunities%ROWTYPE;
    current_assessment_state TEXT;
    current_evidence_status TEXT;
    current_evidence_type TEXT;
    current_evidence_source_url TEXT;
    current_evidence_source TEXT;
    current_evidence_summary TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication is required to qualify an opportunity'
            USING ERRCODE = '42501';
    END IF;

    SELECT opportunity.*
      INTO saved_opportunity
      FROM public.prospect_opportunities AS opportunity
      INNER JOIN public.prospect_assessments AS assessment
              ON assessment.tenant_id = opportunity.tenant_id
             AND assessment.id = opportunity.prospect_assessment_id
             AND assessment.targeting_profile_id = opportunity.targeting_profile_id
             AND assessment.prospect_entity_id = opportunity.prospect_entity_id
      INNER JOIN public.prospect_evidence AS evidence
              ON evidence.tenant_id = opportunity.tenant_id
             AND evidence.id = opportunity.prospect_evidence_id
             AND evidence.targeting_profile_id = opportunity.targeting_profile_id
             AND evidence.prospect_entity_id = opportunity.prospect_entity_id
      INNER JOIN public.tenant_users AS tenant_user
              ON tenant_user.tenant_id::TEXT = opportunity.tenant_id::TEXT
             AND tenant_user.user_id::TEXT = auth.uid()::TEXT
     WHERE opportunity.id = target_opportunity_id
     FOR UPDATE OF opportunity;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'prospect opportunity is not available in this workspace'
            USING ERRCODE = '42501';
    END IF;

    SELECT assessment.assessment_state,
           evidence.evidence_status,
           evidence.evidence_type,
           evidence.source_url,
           evidence.source,
           evidence.summary
      INTO current_assessment_state,
           current_evidence_status,
           current_evidence_type,
           current_evidence_source_url,
           current_evidence_source,
           current_evidence_summary
      FROM public.prospect_assessments AS assessment
      INNER JOIN public.prospect_evidence AS evidence
              ON evidence.tenant_id = assessment.tenant_id
             AND evidence.id = saved_opportunity.prospect_evidence_id
             AND evidence.targeting_profile_id = assessment.targeting_profile_id
             AND evidence.prospect_entity_id = assessment.prospect_entity_id
     WHERE assessment.tenant_id = saved_opportunity.tenant_id
       AND assessment.id = saved_opportunity.prospect_assessment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'prospect opportunity evidence is no longer available'
            USING ERRCODE = '23503';
    END IF;
    IF saved_opportunity.opportunity_status = 'qualified' THEN
        opportunity_id = saved_opportunity.id;
        opportunity_status = saved_opportunity.opportunity_status;
        already_qualified = TRUE;
        evidence_source = current_evidence_source;
        evidence_source_url = current_evidence_source_url;
        evidence_summary = current_evidence_summary;
        RETURN NEXT;
        RETURN;
    END IF;
    IF saved_opportunity.opportunity_status <> 'ready_for_review'
       OR current_assessment_state = 'rejected'
       OR current_evidence_status <> 'accepted'
       OR current_evidence_type NOT IN ('trigger', 'problem', 'evaluation')
       OR current_evidence_source_url IS NULL THEN
        RAISE EXCEPTION 'only an active opportunity with accepted cited evidence can be qualified'
            USING ERRCODE = '23514';
    END IF;

    UPDATE public.prospect_opportunities AS opportunity
       SET opportunity_status = 'qualified',
           qualified_by = auth.uid()::TEXT,
           qualified_at = NOW(),
           updated_at = NOW()
     WHERE opportunity.id = saved_opportunity.id
       AND opportunity.tenant_id = saved_opportunity.tenant_id
       AND opportunity.opportunity_status = 'ready_for_review'
    RETURNING * INTO saved_opportunity;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'could not claim the prospect opportunity qualification'
            USING ERRCODE = '40001';
    END IF;

    opportunity_id = saved_opportunity.id;
    opportunity_status = saved_opportunity.opportunity_status;
    already_qualified = FALSE;
    evidence_source = current_evidence_source;
    evidence_source_url = current_evidence_source_url;
    evidence_summary = current_evidence_summary;
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_prospect_opportunity_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invalidate_prospect_opportunity_after_assessment_rejection() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_prospect_opportunity(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_prospect_opportunity_status_for_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qualify_prospect_opportunity(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_prospect_opportunity(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_prospect_opportunity_status_for_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qualify_prospect_opportunity(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
