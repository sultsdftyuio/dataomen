-- Per-lead "done" state so the prospect inbox can reach zero.
--
-- Apply after prospect_intelligence_contract.sql. This is a separate table on
-- purpose: lead_matches is owned by the verifier worker, guarded by the
-- qualification trigger, and filtered by updated_at for replacement-site
-- safety. Writing human review state there would risk hiding or resurfacing
-- leads. Deleting a row here simply moves the lead back to the inbox.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lead_match_reviews (
    tenant_id TEXT NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    lead_match_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    handled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, lead_match_id)
);

-- Tenant-scoped FK: a review can never point at another tenant's match.
-- Relies on uq_lead_matches_tenant_id_id from prospect_intelligence_contract.sql.
ALTER TABLE public.lead_match_reviews
    DROP CONSTRAINT IF EXISTS fk_lead_match_reviews_tenant_lead_match;
ALTER TABLE public.lead_match_reviews
    ADD CONSTRAINT fk_lead_match_reviews_tenant_lead_match
    FOREIGN KEY (tenant_id, lead_match_id)
    REFERENCES public.lead_matches (tenant_id, id)
    ON DELETE CASCADE;

ALTER TABLE public.lead_match_reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON TABLE public.lead_match_reviews TO authenticated;
REVOKE UPDATE ON TABLE public.lead_match_reviews FROM authenticated;

DROP POLICY IF EXISTS lead_match_reviews_select_tenant ON public.lead_match_reviews;
CREATE POLICY lead_match_reviews_select_tenant ON public.lead_match_reviews
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = lead_match_reviews.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

DROP POLICY IF EXISTS lead_match_reviews_insert_tenant ON public.lead_match_reviews;
CREATE POLICY lead_match_reviews_insert_tenant ON public.lead_match_reviews
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
              FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = lead_match_reviews.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
        AND lead_match_reviews.user_id::TEXT = auth.uid()::TEXT
    );

-- Any workspace member may move a lead back to the inbox, not only the person
-- who marked it done; the inbox is shared workspace state.
DROP POLICY IF EXISTS lead_match_reviews_delete_tenant ON public.lead_match_reviews;
CREATE POLICY lead_match_reviews_delete_tenant ON public.lead_match_reviews
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1
              FROM public.tenant_users AS tenant_user
             WHERE tenant_user.tenant_id::TEXT = lead_match_reviews.tenant_id::TEXT
               AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        )
    );

NOTIFY pgrst, 'reload schema';

COMMIT;
