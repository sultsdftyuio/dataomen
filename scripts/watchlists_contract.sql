-- Customer-defined Watchlists for prospect intelligence.
--
-- Apply after RLS_updates.sql and prospect_intelligence_contract.sql. A
-- Watchlist is an extra matching scope inside an existing workspace: it never
-- owns public posts and it never changes the workspace-wide matching brief.

BEGIN;

CREATE TABLE IF NOT EXISTS public.watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    service_profile_id UUID NOT NULL,
    name TEXT NOT NULL,
    target_buyer TEXT NOT NULL,
    problem_to_solve TEXT NOT NULL,
    include_terms JSONB NOT NULL DEFAULT '[]'::JSONB,
    exclude_terms JSONB NOT NULL DEFAULT '[]'::JSONB,
    source_preferences JSONB NOT NULL DEFAULT '["hackernews","bluesky","lemmy","stackexchange","github"]'::JSONB,
    suggested_places JSONB NOT NULL DEFAULT '[]'::JSONB,
    matching_brief JSONB NOT NULL DEFAULT '{}'::JSONB,
    embedding JSONB NOT NULL DEFAULT '[]'::JSONB,
    embedding_text TEXT,
    embedding_model TEXT,
    embedding_status TEXT NOT NULL DEFAULT 'pending',
    scan_status TEXT NOT NULL DEFAULT 'not_started',
    last_scan_at TIMESTAMPTZ,
    last_scan_error TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT watchlists_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
    CONSTRAINT watchlists_target_buyer_length CHECK (char_length(btrim(target_buyer)) BETWEEN 3 AND 500),
    CONSTRAINT watchlists_problem_length CHECK (char_length(btrim(problem_to_solve)) BETWEEN 3 AND 700),
    CONSTRAINT watchlists_json_arrays CHECK (
        jsonb_typeof(include_terms) = 'array'
        AND jsonb_typeof(exclude_terms) = 'array'
        AND jsonb_typeof(source_preferences) = 'array'
        AND jsonb_typeof(suggested_places) = 'array'
    ),
    CONSTRAINT watchlists_embedding_status CHECK (embedding_status IN ('pending', 'completed', 'failed')),
    CONSTRAINT watchlists_scan_status CHECK (scan_status IN ('not_started', 'queued', 'running', 'completed', 'partial', 'failed'))
);

-- Composite keys prevent a watchlist from ever being pointed at another
-- tenant's profile, even by a trusted worker with an accidental ID mix-up.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'uq_watchlists_tenant_id_id'
           AND conrelid = 'public.watchlists'::regclass
    ) THEN
        ALTER TABLE public.watchlists
            ADD CONSTRAINT uq_watchlists_tenant_id_id UNIQUE (tenant_id, id);
    END IF;
END;
$$;

ALTER TABLE public.watchlists
    DROP CONSTRAINT IF EXISTS fk_watchlists_tenant_service_profile;
ALTER TABLE public.watchlists
    ADD CONSTRAINT fk_watchlists_tenant_service_profile
    FOREIGN KEY (tenant_id, service_profile_id)
    REFERENCES public.service_profiles (tenant_id, id)
    ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.watchlist_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    watchlist_id UUID NOT NULL,
    service_profile_id UUID NOT NULL,
    source_post_id UUID REFERENCES public.source_posts(id) ON DELETE SET NULL,
    match_status TEXT NOT NULL DEFAULT 'rejected',
    verifier_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    similarity_score DOUBLE PRECISION,
    pain_detected TEXT,
    match_reason TEXT,
    suggested_reply TEXT,
    verification JSONB NOT NULL DEFAULT '{}'::JSONB,
    source_post JSONB NOT NULL DEFAULT '{}'::JSONB,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    matched_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT watchlist_matches_status CHECK (
        match_status IN ('ready_for_review', 'discovery_candidate', 'rejected')
    )
);

ALTER TABLE public.watchlist_matches
    DROP CONSTRAINT IF EXISTS fk_watchlist_matches_tenant_watchlist;
ALTER TABLE public.watchlist_matches
    ADD CONSTRAINT fk_watchlist_matches_tenant_watchlist
    FOREIGN KEY (tenant_id, watchlist_id)
    REFERENCES public.watchlists (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.watchlist_matches
    DROP CONSTRAINT IF EXISTS fk_watchlist_matches_tenant_service_profile;
ALTER TABLE public.watchlist_matches
    ADD CONSTRAINT fk_watchlist_matches_tenant_service_profile
    FOREIGN KEY (tenant_id, service_profile_id)
    REFERENCES public.service_profiles (tenant_id, id)
    ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_watchlist_matches_tenant_watchlist_source_post
    ON public.watchlist_matches(tenant_id, watchlist_id, source_post_id)
    WHERE source_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_watchlists_tenant_active_updated
    ON public.watchlists(tenant_id, is_active, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchlist_matches_tenant_watchlist_status_score
    ON public.watchlist_matches(tenant_id, watchlist_id, match_status, verifier_score DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_watchlist_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.service_profile_id IS DISTINCT FROM OLD.service_profile_id) THEN
        RAISE EXCEPTION 'watchlist tenant and service profile are immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.service_profiles profile
         WHERE profile.id = NEW.service_profile_id
           AND profile.tenant_id = NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'service profile does not belong to watchlist tenant'
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_watchlist_match_tenant_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.watchlist_id IS DISTINCT FROM OLD.watchlist_id
            OR NEW.service_profile_id IS DISTINCT FROM OLD.service_profile_id
            OR NEW.source_post_id IS DISTINCT FROM OLD.source_post_id) THEN
        RAISE EXCEPTION 'watchlist match scope is immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.watchlists watchlist
         WHERE watchlist.id = NEW.watchlist_id
           AND watchlist.tenant_id = NEW.tenant_id
           AND watchlist.service_profile_id = NEW.service_profile_id
    ) THEN
        RAISE EXCEPTION 'watchlist match does not belong to tenant and profile'
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS watchlists_scope_guard ON public.watchlists;
CREATE TRIGGER watchlists_scope_guard
    BEFORE INSERT OR UPDATE ON public.watchlists
    FOR EACH ROW EXECUTE FUNCTION public.guard_watchlist_tenant_scope();

DROP TRIGGER IF EXISTS watchlists_updated_at ON public.watchlists;
CREATE TRIGGER watchlists_updated_at
    BEFORE UPDATE ON public.watchlists
    FOR EACH ROW EXECUTE FUNCTION public.set_prospect_intelligence_updated_at();

DROP TRIGGER IF EXISTS watchlist_matches_scope_guard ON public.watchlist_matches;
CREATE TRIGGER watchlist_matches_scope_guard
    BEFORE INSERT OR UPDATE ON public.watchlist_matches
    FOR EACH ROW EXECUTE FUNCTION public.guard_watchlist_match_tenant_scope();

DROP TRIGGER IF EXISTS watchlist_matches_updated_at ON public.watchlist_matches;
CREATE TRIGGER watchlist_matches_updated_at
    BEFORE UPDATE ON public.watchlist_matches
    FOR EACH ROW EXECUTE FUNCTION public.set_prospect_intelligence_updated_at();

ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_matches ENABLE ROW LEVEL SECURITY;

-- Browser users create, read, pause, and delete their own Watchlists. The
-- worker alone owns derived embeddings, matching briefs, and scan state, so a
-- signed-in user cannot turn an edited vector into extra verifier spend.
GRANT SELECT, INSERT, DELETE ON TABLE public.watchlists TO authenticated;
REVOKE UPDATE ON TABLE public.watchlists FROM authenticated;
GRANT UPDATE (is_active) ON TABLE public.watchlists TO authenticated;
GRANT SELECT ON TABLE public.watchlist_matches TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.watchlist_matches FROM authenticated;

DROP POLICY IF EXISTS watchlists_tenant_isolation ON public.watchlists;
CREATE POLICY watchlists_tenant_isolation ON public.watchlists
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tenant_user
             WHERE tenant_user.tenant_id::TEXT = watchlists.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tenant_user
             WHERE tenant_user.tenant_id::TEXT = watchlists.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
        AND (watchlists.created_by IS NULL OR watchlists.created_by::TEXT = auth.uid()::TEXT)
    );

DROP POLICY IF EXISTS watchlist_matches_select_tenant ON public.watchlist_matches;
CREATE POLICY watchlist_matches_select_tenant ON public.watchlist_matches
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tenant_user
             WHERE tenant_user.tenant_id::TEXT = watchlist_matches.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

REVOKE ALL ON FUNCTION public.guard_watchlist_tenant_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_watchlist_match_tenant_scope() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
