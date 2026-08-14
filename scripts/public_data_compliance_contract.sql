-- Public-source data governance contract for Arcli.
--
-- Apply after RLS_updates.sql, hn_source_posts_global_contract.sql, and
-- buyer_language_research_contract.sql. It provides a verified public-data
-- removal workflow and indexes used by the worker's 30-day retention pass.

BEGIN;

CREATE TABLE IF NOT EXISTS public.public_data_removal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_email TEXT NOT NULL,
    requester_fingerprint TEXT NOT NULL,
    source TEXT NOT NULL,
    source_post_id TEXT,
    author_handle TEXT,
    source_url TEXT,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    verified_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    matched_post_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT public_data_removal_request_email_check
        CHECK (char_length(btrim(requester_email)) BETWEEN 3 AND 320),
    CONSTRAINT public_data_removal_request_fingerprint_check
        CHECK (requester_fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT public_data_removal_request_source_check
        CHECK (source IN ('hackernews', 'bluesky', 'stackexchange', 'github', 'lemmy', 'twitter')),
    CONSTRAINT public_data_removal_request_identity_check
        CHECK (
            source_post_id IS NOT NULL
            OR author_handle IS NOT NULL
            OR source_url IS NOT NULL
        ),
    CONSTRAINT public_data_removal_request_source_post_id_check
        CHECK (source_post_id IS NULL OR char_length(btrim(source_post_id)) BETWEEN 1 AND 1024),
    CONSTRAINT public_data_removal_request_author_handle_check
        CHECK (author_handle IS NULL OR char_length(btrim(author_handle)) BETWEEN 1 AND 512),
    CONSTRAINT public_data_removal_request_source_url_check
        CHECK (source_url IS NULL OR source_url ~* '^https?://[^[:space:]]+$'),
    CONSTRAINT public_data_removal_request_details_check
        CHECK (details IS NULL OR char_length(details) <= 2000),
    CONSTRAINT public_data_removal_request_status_check
        CHECK (status IN ('pending', 'verified', 'completed', 'rejected')),
    CONSTRAINT public_data_removal_request_match_count_check
        CHECK (matched_post_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_public_data_removal_requests_pending
    ON public.public_data_removal_requests(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_public_data_removal_requests_suppression
    ON public.public_data_removal_requests(source, source_post_id, author_handle)
    WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_public_data_removal_requests_fingerprint_created
    ON public.public_data_removal_requests(requester_fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_posts_public_retention
    ON public.source_posts(posted_at ASC)
    WHERE tenant_id IS NULL AND source_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discovery_evidence_retention
    ON public.discovery_evidence(observed_at ASC, created_at ASC);

CREATE OR REPLACE FUNCTION public.set_public_data_removal_request_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_data_removal_request_updated_at
    ON public.public_data_removal_requests;
CREATE TRIGGER public_data_removal_request_updated_at
    BEFORE UPDATE ON public.public_data_removal_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_public_data_removal_request_updated_at();

-- An operator must verify a requester before calling this function. The
-- function deletes the global original and all lead snapshots before recording
-- the completed suppression, which stops future collection of the same post,
-- account, or URL.
CREATE OR REPLACE FUNCTION public.complete_public_data_removal_request(
    request_id UUID
)
RETURNS TABLE (
    request_id UUID,
    deleted_source_posts INTEGER,
    deleted_lead_matches INTEGER,
    deleted_discovery_evidence INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    request_row public.public_data_removal_requests%ROWTYPE;
    source_post_ids UUID[];
    source_post_count INTEGER := 0;
    lead_match_count INTEGER := 0;
    discovery_evidence_count INTEGER := 0;
BEGIN
    SELECT * INTO request_row
      FROM public.public_data_removal_requests
     WHERE id = request_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'public data removal request not found'
            USING ERRCODE = 'P0002';
    END IF;
    IF request_row.status = 'completed' THEN
        RETURN QUERY SELECT request_row.id, 0, 0, 0;
        RETURN;
    END IF;
    IF request_row.status = 'rejected' THEN
        RAISE EXCEPTION 'rejected public data removal request cannot be completed'
            USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
      INTO source_post_ids
      FROM public.source_posts
     WHERE tenant_id IS NULL
       AND source = request_row.source
       AND (
           (request_row.source_post_id IS NOT NULL AND source_post_id = request_row.source_post_id)
           OR (request_row.author_handle IS NOT NULL AND lower(author_handle) = lower(request_row.author_handle))
           OR (request_row.source_url IS NOT NULL AND url = request_row.source_url)
       );

    DELETE FROM public.lead_matches
     WHERE source_post_id = ANY(source_post_ids);
    GET DIAGNOSTICS lead_match_count = ROW_COUNT;

    DELETE FROM public.source_posts
     WHERE id = ANY(source_post_ids);
    GET DIAGNOSTICS source_post_count = ROW_COUNT;

    DELETE FROM public.discovery_evidence
     WHERE source = request_row.source
       AND (
           (request_row.source_post_id IS NOT NULL AND source_post_id = request_row.source_post_id)
           OR (request_row.source_url IS NOT NULL AND source_url = request_row.source_url)
       );
    GET DIAGNOSTICS discovery_evidence_count = ROW_COUNT;

    UPDATE public.public_data_removal_requests
       SET status = 'completed',
           verified_at = COALESCE(verified_at, NOW()),
           completed_at = NOW(),
           matched_post_count = source_post_count
     WHERE id = request_row.id;

    RETURN QUERY SELECT request_row.id, source_post_count, lead_match_count, discovery_evidence_count;
END;
$$;

ALTER TABLE public.public_data_removal_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_data_removal_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_data_removal_requests TO service_role;
REVOKE ALL ON FUNCTION public.complete_public_data_removal_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_public_data_removal_request_updated_at() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
