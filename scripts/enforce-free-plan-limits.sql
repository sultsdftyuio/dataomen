-- Free plan policy: one discovery domain; paid subscriptions have no trial.
-- Run this before deploying the application changes so existing workspaces are
-- normalized and direct/concurrent database writes cannot bypass the policy.

UPDATE public.tenants
SET
  subscription_status = 'active',
  billing_status = 'active',
  trial_ends_at = NULL,
  updated_at = NOW()
WHERE plan_tier = 'pro'
  AND subscription_status = 'trialing';

CREATE OR REPLACE FUNCTION public.enforce_free_plan_website_domain_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  workspace_plan TEXT;
  previous_domain TEXT;
  next_domain TEXT;
BEGIN
  SELECT LOWER(COALESCE(plan_tier, 'free'))
  INTO workspace_plan
  FROM public.tenants
  WHERE tenant_id = NEW.tenant_id;

  IF workspace_plan <> 'free' OR TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  previous_domain := LOWER(REGEXP_REPLACE(
    REGEXP_REPLACE(COALESCE(OLD.website_url, ''), '^https?://(www\.)?', '', 'i'),
    '[:/?#].*$',
    ''
  ));
  next_domain := LOWER(REGEXP_REPLACE(
    REGEXP_REPLACE(COALESCE(NEW.website_url, ''), '^https?://(www\.)?', '', 'i'),
    '[:/?#].*$',
    ''
  ));

  IF previous_domain <> '' AND next_domain IS DISTINCT FROM previous_domain THEN
    RAISE EXCEPTION 'Free workspaces can use one website domain. Upgrade to Pro to change it.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_free_plan_website_domain_limit
  ON public.tenant_settings;

CREATE TRIGGER trg_enforce_free_plan_website_domain_limit
BEFORE UPDATE OF website_url ON public.tenant_settings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_free_plan_website_domain_limit();

-- Free users may see aggregate progress, never individual lead rows. The
-- security-definer function supplies only two tenant-scoped counts for the
-- locked dashboard preview; direct reads remain available to active Pro only.
CREATE OR REPLACE FUNCTION public.free_plan_lead_queue_counts(
  p_service_profile_id TEXT,
  p_minimum_verifier_score NUMERIC,
  p_active_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  ready_to_review BIGINT,
  discovery_candidates BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_tenant AS (
    SELECT tenant_id
    FROM public.tenant_users
    WHERE user_id::TEXT = auth.uid()::TEXT
    LIMIT 1
  )
  SELECT
    COUNT(*) FILTER (
      WHERE lead_match.match_status IN ('ready_for_review', 'qualified')
        AND lead_match.verifier_score >= p_minimum_verifier_score
    ) AS ready_to_review,
    COUNT(*) FILTER (
      WHERE lead_match.match_status = 'discovery_candidate'
    ) AS discovery_candidates
  FROM public.lead_matches AS lead_match
  INNER JOIN current_tenant
    ON current_tenant.tenant_id::TEXT = lead_match.tenant_id::TEXT
  WHERE lead_match.service_profile_id::TEXT = p_service_profile_id
    AND (p_active_since IS NULL OR lead_match.updated_at >= p_active_since);
$$;

REVOKE ALL ON FUNCTION public.free_plan_lead_queue_counts(TEXT, NUMERIC, TIMESTAMPTZ)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.free_plan_lead_queue_counts(TEXT, NUMERIC, TIMESTAMPTZ)
  TO authenticated;

DROP POLICY IF EXISTS "lead_matches_select_tenant" ON public.lead_matches;
CREATE POLICY "lead_matches_select_tenant" ON public.lead_matches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_users AS tenant_user
      INNER JOIN public.tenants AS tenant
        ON tenant.tenant_id::TEXT = tenant_user.tenant_id::TEXT
      WHERE tenant_user.tenant_id::TEXT = lead_matches.tenant_id::TEXT
        AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        AND LOWER(COALESCE(tenant.plan_tier, 'free')) IN ('pro', 'enterprise')
        AND LOWER(COALESCE(tenant.subscription_status, '')) IN ('active', 'canceling')
        AND (
          LOWER(COALESCE(tenant.subscription_status, '')) <> 'canceling'
          OR tenant.current_period_end IS NULL
          OR tenant.current_period_end >= NOW()
        )
    )
  );

DROP POLICY IF EXISTS "lead_matches_qualify_tenant" ON public.lead_matches;
CREATE POLICY "lead_matches_qualify_tenant" ON public.lead_matches
  FOR UPDATE TO authenticated
  USING (
    lead_matches.match_status = 'ready_for_review'
    AND EXISTS (
      SELECT 1
      FROM public.tenant_users AS tenant_user
      INNER JOIN public.tenants AS tenant
        ON tenant.tenant_id::TEXT = tenant_user.tenant_id::TEXT
      WHERE tenant_user.tenant_id::TEXT = lead_matches.tenant_id::TEXT
        AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        AND LOWER(COALESCE(tenant.plan_tier, 'free')) IN ('pro', 'enterprise')
        AND LOWER(COALESCE(tenant.subscription_status, '')) IN ('active', 'canceling')
    )
  )
  WITH CHECK (
    lead_matches.match_status = 'qualified'
    AND EXISTS (
      SELECT 1
      FROM public.tenant_users AS tenant_user
      INNER JOIN public.tenants AS tenant
        ON tenant.tenant_id::TEXT = tenant_user.tenant_id::TEXT
      WHERE tenant_user.tenant_id::TEXT = lead_matches.tenant_id::TEXT
        AND tenant_user.user_id::TEXT = auth.uid()::TEXT
        AND LOWER(COALESCE(tenant.plan_tier, 'free')) IN ('pro', 'enterprise')
        AND LOWER(COALESCE(tenant.subscription_status, '')) IN ('active', 'canceling')
    )
  );

DO $$
BEGIN
  IF to_regclass('public.watchlist_matches') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS watchlist_matches_select_tenant ON public.watchlist_matches';
    EXECUTE $policy$
      CREATE POLICY watchlist_matches_select_tenant ON public.watchlist_matches
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.tenant_users AS tenant_user
            INNER JOIN public.tenants AS tenant
              ON tenant.tenant_id::TEXT = tenant_user.tenant_id::TEXT
            WHERE tenant_user.tenant_id::TEXT = watchlist_matches.tenant_id::TEXT
              AND tenant_user.user_id::TEXT = auth.uid()::TEXT
              AND LOWER(COALESCE(tenant.plan_tier, 'free')) IN ('pro', 'enterprise')
              AND LOWER(COALESCE(tenant.subscription_status, '')) IN ('active', 'canceling')
              AND (
                LOWER(COALESCE(tenant.subscription_status, '')) <> 'canceling'
                OR tenant.current_period_end IS NULL
                OR tenant.current_period_end >= NOW()
              )
          )
        )
    $policy$;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
