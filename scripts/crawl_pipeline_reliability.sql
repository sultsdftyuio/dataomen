-- Crawl pipeline reliability ledger for Arcli onboarding.
-- Apply in Supabase before deploying the guarded Dramatiq actor.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.crawl_jobs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    website_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_lettered')),
    phase TEXT NOT NULL DEFAULT 'queued',
    message_id TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    pages_crawled INTEGER NOT NULL DEFAULT 0 CHECK (pages_crawled >= 0),
    content_chars INTEGER NOT NULL DEFAULT 0 CHECK (content_chars >= 0),
    service_profile_id TEXT,
    failure_reason TEXT,
    error_type TEXT,
    error_message TEXT,
    error_context JSONB NOT NULL DEFAULT '{}'::JSONB,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    dead_lettered_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_jobs_tenant_website
    ON public.crawl_jobs(tenant_id, website_url);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status_heartbeat
    ON public.crawl_jobs(status, last_heartbeat_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_tenant_updated
    ON public.crawl_jobs(tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.crawl_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crawl_job_id TEXT NOT NULL REFERENCES public.crawl_jobs(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    website_url TEXT NOT NULL,
    source_url TEXT NOT NULL,
    markdown TEXT NOT NULL,
    content_chars INTEGER NOT NULL DEFAULT 0 CHECK (content_chars >= 0),
    content_sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_pages_job_source
    ON public.crawl_pages(crawl_job_id, source_url);

CREATE INDEX IF NOT EXISTS idx_crawl_pages_tenant_job
    ON public.crawl_pages(tenant_id, crawl_job_id);

CREATE TABLE IF NOT EXISTS public.service_profile_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    service_profile_id UUID NOT NULL REFERENCES public.service_profiles(id) ON DELETE CASCADE,
    embedding_json JSONB NOT NULL DEFAULT '{}'::JSONB,
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    embedding_dimensions INTEGER,
    source_text TEXT,
    source_text_sha256 TEXT,
    status TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    failure_reason TEXT,
    error_context JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_profile_embeddings_profile_model
    ON public.service_profile_embeddings(service_profile_id, embedding_model);

ALTER TABLE public.service_profile_embeddings
    ADD COLUMN IF NOT EXISTS source_text_sha256 TEXT;

CREATE INDEX IF NOT EXISTS idx_service_profile_embeddings_tenant_status
    ON public.service_profile_embeddings(tenant_id, status, updated_at DESC);

DO $$
DECLARE
    vector_type regtype;
BEGIN
    vector_type := COALESCE(
        to_regtype('extensions.vector'),
        to_regtype('public.vector'),
        to_regtype('vector')
    );

    IF vector_type IS NULL THEN
        RAISE NOTICE 'pgvector type was not found; service_profile_embeddings.embedding column was skipped. embedding_json remains available.';
    ELSIF NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'service_profile_embeddings'
           AND column_name = 'embedding'
    ) THEN
        EXECUTE format(
            'ALTER TABLE public.service_profile_embeddings ADD COLUMN embedding %s(1536)',
            vector_type
        );
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crawl_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crawl_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_profile_embeddings TO authenticated;

ALTER TABLE public.crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_profile_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crawl_jobs_tenant_isolation" ON public.crawl_jobs;
CREATE POLICY "crawl_jobs_tenant_isolation" ON public.crawl_jobs
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = crawl_jobs.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = crawl_jobs.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "crawl_pages_tenant_isolation" ON public.crawl_pages;
CREATE POLICY "crawl_pages_tenant_isolation" ON public.crawl_pages
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = crawl_pages.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = crawl_pages.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "service_profile_embeddings_tenant_isolation"
    ON public.service_profile_embeddings;
CREATE POLICY "service_profile_embeddings_tenant_isolation"
    ON public.service_profile_embeddings
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = service_profile_embeddings.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = service_profile_embeddings.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
    );

NOTIFY pgrst, 'reload schema';

COMMIT;
