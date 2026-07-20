-- Assisted Outreach data contract
-- Safe to apply to existing Supabase workspaces after scripts/RLS_updates.sql.

BEGIN;

-- The verifier persists a human-editable, public-reply draft for each match.
ALTER TABLE public.lead_matches
    ADD COLUMN IF NOT EXISTS suggested_reply TEXT;

-- This is intentionally server-only: do not include it in client-facing
-- settings selects or snapshots.
ALTER TABLE public.tenant_settings
    ADD COLUMN IF NOT EXISTS crm_webhook_url TEXT;

-- LLM-approved leads wait for a human decision. The server action is the only
-- path that transitions them to `qualified` and dispatches the CRM webhook.
ALTER TABLE public.lead_matches
    ALTER COLUMN match_status SET DEFAULT 'ready_for_review';

NOTIFY pgrst, 'reload schema';

COMMIT;
