-- Durable website-refresh result notifications.
--
-- Apply after crawl_pipeline_reliability.sql and prospect_intelligence_contract.sql.
-- The outbox stores only recipient snapshots and aggregate counts; it never
-- stores lead details, source-post content, or raw crawl content.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.tenant_settings
    ADD COLUMN IF NOT EXISTS crawl_completion_email_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.crawl_notification_preferences (
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.crawl_notification_suppressions (
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, email),
    CONSTRAINT crawl_notification_suppressions_email_not_blank
        CHECK (length(trim(email)) > 3),
    CONSTRAINT crawl_notification_suppressions_reason_not_blank
        CHECK (length(trim(reason)) > 0)
);

CREATE TABLE IF NOT EXISTS public.crawl_notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- A snapshot ensures that an email-address change cannot redirect an old
    -- event after it has been queued. It is removed with the user/tenant.
    recipient_email TEXT NOT NULL,
    event_key TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    discovery_run_id UUID REFERENCES public.discovery_runs(id) ON DELETE SET NULL,
    crawl_job_id TEXT,
    result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    claim_token TEXT,
    claimed_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    provider_id TEXT,
    error_code TEXT,
    suppression_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT crawl_notification_outbox_event_key_not_blank
        CHECK (length(trim(event_key)) BETWEEN 1 AND 160),
    CONSTRAINT crawl_notification_outbox_recipient_email_not_blank
        CHECK (length(trim(recipient_email)) > 3),
    CONSTRAINT crawl_notification_outbox_notification_type_check
        CHECK (notification_type IN (
            'crawl_completed',
            'discovery_completed',
            'discovery_partial',
            'crawl_failed'
        )),
    CONSTRAINT crawl_notification_outbox_status_check
        CHECK (status IN ('pending', 'dispatching', 'sent', 'suppressed', 'failed')),
    CONSTRAINT crawl_notification_outbox_result_summary_object_check
        CHECK (jsonb_typeof(result_summary) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crawl_notification_outbox_tenant_user_event
    ON public.crawl_notification_outbox(tenant_id, user_id, event_key);
CREATE INDEX IF NOT EXISTS idx_crawl_notification_outbox_recovery
    ON public.crawl_notification_outbox(status, last_attempt_at, created_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_crawl_notification_outbox_tenant_created
    ON public.crawl_notification_outbox(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_notification_outbox_expiry
    ON public.crawl_notification_outbox(expires_at)
    WHERE status IN ('pending', 'dispatching');
CREATE INDEX IF NOT EXISTS idx_crawl_notification_outbox_terminal_retention
    ON public.crawl_notification_outbox(updated_at)
    WHERE status IN ('sent', 'suppressed', 'failed');

ALTER TABLE public.crawl_notification_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_notification_preferences ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.crawl_notification_preferences TO authenticated;

DROP POLICY IF EXISTS "crawl_notification_preferences_self_service"
    ON public.crawl_notification_preferences;
CREATE POLICY "crawl_notification_preferences_self_service"
    ON public.crawl_notification_preferences
    FOR ALL
    TO authenticated
    USING (
        user_id::text = auth.uid()::text
        AND EXISTS (
            SELECT 1
              FROM public.tenant_users AS membership
             WHERE membership.tenant_id = crawl_notification_preferences.tenant_id
               AND membership.user_id::text = auth.uid()::text
        )
    )
    WITH CHECK (
        user_id::text = auth.uid()::text
        AND EXISTS (
            SELECT 1
              FROM public.tenant_users AS membership
             WHERE membership.tenant_id = crawl_notification_preferences.tenant_id
               AND membership.user_id::text = auth.uid()::text
        )
    );

-- No browser grants or policies are added for the operational outbox. Product
-- workers use the trusted server database role. Authenticated users can change
-- only their own preference through the authorization-checked Next route.

COMMIT;
