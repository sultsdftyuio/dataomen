-- Global Hacker News source-post contract.
--
-- Run this after RLS_updates.sql.  It keeps the legacy tenant-scoped columns
-- available for the existing social ingestion path while allowing the new
-- public corpus contract to store rows without a tenant ID.

BEGIN;

ALTER TABLE public.source_posts
    ALTER COLUMN tenant_id DROP NOT NULL,
    ALTER COLUMN external_id DROP NOT NULL,
    ALTER COLUMN title DROP NOT NULL,
    ALTER COLUMN text DROP NOT NULL;

ALTER TABLE public.source_posts
    ADD COLUMN IF NOT EXISTS source_post_id TEXT,
    ADD COLUMN IF NOT EXISTS author_handle TEXT,
    ADD COLUMN IF NOT EXISTS body TEXT,
    ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
    ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'pending';

-- Existing tenant rows retain a NULL source_post_id and continue using their
-- legacy (tenant_id, source, external_id) uniqueness guarantee.  PostgreSQL
-- unique indexes permit multiple NULL values, so this new key is dedicated to
-- the public corpus and has no tenant hardcoded into it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_source_posts_source_source_post_id
    ON public.source_posts(source, source_post_id);

CREATE INDEX IF NOT EXISTS idx_source_posts_embedding_pending
    ON public.source_posts(embedding_status, posted_at DESC)
    WHERE embedding_status = 'pending';

ALTER TABLE public.source_posts
    DROP CONSTRAINT IF EXISTS source_posts_embedding_status_check;
ALTER TABLE public.source_posts
    ADD CONSTRAINT source_posts_embedding_status_check
    CHECK (embedding_status IN ('pending', 'completed', 'failed'));

NOTIFY pgrst, 'reload schema';

COMMIT;
