-- Persistent scheduler for the automatic 24–48 hour website refresh cycle.
-- Apply after scripts/crawl_pipeline_reliability.sql and before deploying the
-- worker code that dispatches scheduled recrawls.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.website_recrawl_schedules (
    tenant_id TEXT NOT NULL,
    website_url TEXT NOT NULL,
    -- Initial rows are a durable admission backlog. Recurring rows are only
    -- dispatched while the tenant has active paid lead-discovery access.
    crawl_kind TEXT NOT NULL DEFAULT 'recurring',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'queued', 'paused')),
    last_completed_at TIMESTAMPTZ,
    last_dispatched_at TIMESTAMPTZ,
    next_crawl_at TIMESTAMPTZ NOT NULL,
    dispatch_lease_until TIMESTAMPTZ,
    consecutive_failures INTEGER NOT NULL DEFAULT 0
        CHECK (consecutive_failures >= 0),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, website_url)
);

-- ALTER statements make this migration safe for deployments that already ran
-- the first recurring-crawl version of this script.
ALTER TABLE public.website_recrawl_schedules
    ADD COLUMN IF NOT EXISTS crawl_kind TEXT NOT NULL DEFAULT 'recurring';

ALTER TABLE public.website_recrawl_schedules
    DROP CONSTRAINT IF EXISTS website_recrawl_schedules_crawl_kind_check;
ALTER TABLE public.website_recrawl_schedules
    ADD CONSTRAINT website_recrawl_schedules_crawl_kind_check
    CHECK (crawl_kind IN ('initial', 'recurring'));

CREATE INDEX IF NOT EXISTS idx_website_recrawl_schedules_due
    ON public.website_recrawl_schedules(next_crawl_at ASC)
    WHERE status IN ('active', 'queued');

CREATE INDEX IF NOT EXISTS idx_website_recrawl_schedules_kind_due
    ON public.website_recrawl_schedules(crawl_kind, next_crawl_at ASC)
    WHERE status IN ('active', 'queued');

CREATE TABLE IF NOT EXISTS public.website_recrawl_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    website_url TEXT NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    crawl_kind TEXT NOT NULL DEFAULT 'recurring',
    dispatch_priority TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL
        CHECK (status IN ('enqueued', 'deferred', 'failed')),
    message_id TEXT,
    error_message TEXT,
    enqueued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT website_recrawl_dispatches_once_per_due_window
        UNIQUE (tenant_id, website_url, scheduled_for)
);

ALTER TABLE public.website_recrawl_dispatches
    ADD COLUMN IF NOT EXISTS crawl_kind TEXT NOT NULL DEFAULT 'recurring';
ALTER TABLE public.website_recrawl_dispatches
    ADD COLUMN IF NOT EXISTS dispatch_priority TEXT NOT NULL DEFAULT 'free';

ALTER TABLE public.website_recrawl_dispatches
    DROP CONSTRAINT IF EXISTS website_recrawl_dispatches_crawl_kind_check;
ALTER TABLE public.website_recrawl_dispatches
    ADD CONSTRAINT website_recrawl_dispatches_crawl_kind_check
    CHECK (crawl_kind IN ('initial', 'recurring'));

ALTER TABLE public.website_recrawl_dispatches
    DROP CONSTRAINT IF EXISTS website_recrawl_dispatches_dispatch_priority_check;
ALTER TABLE public.website_recrawl_dispatches
    ADD CONSTRAINT website_recrawl_dispatches_dispatch_priority_check
    CHECK (dispatch_priority IN ('pro', 'free'));

-- A durable singleton heartbeat prevents every worker recycle from creating
-- another independently self-scheduling Dramatiq loop.  The backend service
-- is the only principal that needs this table; customers never read it.
CREATE TABLE IF NOT EXISTS public.website_recrawl_scheduler_state (
    scheduler_name TEXT PRIMARY KEY,
    next_tick_at TIMESTAMPTZ NOT NULL,
    last_tick_started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (scheduler_name = 'website_recrawl')
);

ALTER TABLE public.website_recrawl_scheduler_state
    ADD COLUMN IF NOT EXISTS last_tick_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_website_recrawl_scheduler_state_due
    ON public.website_recrawl_scheduler_state(next_tick_at ASC);

CREATE INDEX IF NOT EXISTS idx_website_recrawl_dispatches_daily_budget
    ON public.website_recrawl_dispatches(enqueued_at DESC)
    WHERE status = 'enqueued';

CREATE INDEX IF NOT EXISTS idx_website_recrawl_dispatches_daily_priority
    ON public.website_recrawl_dispatches(dispatch_priority, enqueued_at DESC)
    WHERE status = 'enqueued';

CREATE INDEX IF NOT EXISTS idx_website_recrawl_dispatches_tenant_created
    ON public.website_recrawl_dispatches(tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON TABLE public.website_recrawl_schedules TO authenticated;
GRANT SELECT ON TABLE public.website_recrawl_dispatches TO authenticated;

ALTER TABLE public.website_recrawl_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_recrawl_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_recrawl_scheduler_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "website_recrawl_schedules_tenant_isolation"
    ON public.website_recrawl_schedules;
CREATE POLICY "website_recrawl_schedules_tenant_isolation"
    ON public.website_recrawl_schedules
    AS PERMISSIVE
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tenant_user
            WHERE tenant_user.tenant_id::text = website_recrawl_schedules.tenant_id
              AND tenant_user.user_id::text = auth.uid()::text
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tenant_user
            WHERE tenant_user.tenant_id::text = website_recrawl_schedules.tenant_id
              AND tenant_user.user_id::text = auth.uid()::text
        )
    );

DROP POLICY IF EXISTS "website_recrawl_dispatches_tenant_isolation"
    ON public.website_recrawl_dispatches;
CREATE POLICY "website_recrawl_dispatches_tenant_isolation"
    ON public.website_recrawl_dispatches
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tenant_user
            WHERE tenant_user.tenant_id::text = website_recrawl_dispatches.tenant_id
              AND tenant_user.user_id::text = auth.uid()::text
        )
    );

-- Dispatch audit records bound scheduler-cost accounting. Keep enough history
-- for incident review, then purge them without retaining long-term URL data.
DO $$
BEGIN
    DELETE FROM cron.job WHERE jobname = 'arcli-cleanup-website-recrawl-dispatches';
    PERFORM cron.schedule(
        'arcli-cleanup-website-recrawl-dispatches',
        '0 4 * * *',
        $q$
            DELETE FROM public.website_recrawl_dispatches
             WHERE created_at < NOW() - INTERVAL '90 days';
        $q$
    );
EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron is unavailable; configure 90-day website recrawl dispatch retention externally. Error: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
