-- Compatibility contract for recovery-unsubscribe links sent by older Arcli
-- deployments. The current lead-discovery product does not run recovery
-- campaigns, queues, or outbound recovery workers.
--
-- functions0.sql creates recovery_emails and recovery_suppressions. This
-- small additive migration keeps the only additional field the retained
-- /api/recovery/unsubscribe route writes. It is safe on databases that ran
-- the previous recovery campaign migration already.

BEGIN;

ALTER TABLE public.recovery_emails
    ADD COLUMN IF NOT EXISTS last_error TEXT;

-- The public unsubscribe endpoint resolves a previous delivery by its opaque
-- token. This is an index, not a uniqueness constraint, so an older database
-- with duplicate historical rows can still be upgraded safely.
CREATE INDEX IF NOT EXISTS idx_recovery_emails_dispatch_token_lookup
    ON public.recovery_emails(dispatch_token)
    WHERE dispatch_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recovery_suppressions_tenant_email_lookup
    ON public.recovery_suppressions(tenant_id, email);

NOTIFY pgrst, 'reload schema';

COMMIT;
