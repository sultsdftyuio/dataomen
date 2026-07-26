-- Browser-facing lead-qualification guard.
--
-- Apply this after scripts/RLS_updates.sql in existing workspaces. New
-- workspaces receive the same policy from RLS_updates.sql itself. Public HN/X
-- corpus writes continue through the worker's service/database role; this
-- policy only limits authenticated browser clients.

BEGIN;

-- Global HN/X rows are not tenant-owned, so the matching worker stores a
-- source snapshot on each tenant-owned match. Older workspaces may not yet
-- have these fields even when the table itself exists.
ALTER TABLE public.lead_matches
    ADD COLUMN IF NOT EXISTS source_post JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS source_post_data JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS source_post_json JSONB NOT NULL DEFAULT '{}'::JSONB;

GRANT SELECT, UPDATE ON TABLE public.lead_matches TO authenticated;
REVOKE INSERT, DELETE ON TABLE public.lead_matches FROM authenticated;

DROP POLICY IF EXISTS "lead_matches_select_tenant" ON public.lead_matches;
DROP POLICY IF EXISTS "lead_matches_insert_tenant" ON public.lead_matches;
DROP POLICY IF EXISTS "lead_matches_update_tenant" ON public.lead_matches;
DROP POLICY IF EXISTS "lead_matches_delete_tenant" ON public.lead_matches;
DROP POLICY IF EXISTS "lead_matches_tenant_isolation" ON public.lead_matches;
DROP POLICY IF EXISTS "lead_matches_qualify_tenant" ON public.lead_matches;

CREATE POLICY "lead_matches_select_tenant" ON public.lead_matches
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = lead_matches.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "lead_matches_qualify_tenant" ON public.lead_matches
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = lead_matches.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
        AND lead_matches.match_status IN ('ready_for_review', 'discovery_candidate')
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id::text = lead_matches.tenant_id::text
              AND tu.user_id::text = auth.uid()::text
        )
        AND lead_matches.match_status = 'qualified'
    );

NOTIFY pgrst, 'reload schema';

COMMIT;
