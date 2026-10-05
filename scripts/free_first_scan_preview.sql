-- Free first-scan preview: one real lead, everything else counted only.
--
-- Apply after enforce-free-plan-limits.sql. Free users still cannot read
-- lead_matches directly (that RLS policy is unchanged). This SECURITY DEFINER
-- function returns, for the caller's own tenant only:
--   * the latest discovery run status for the profile (to show "scanning"),
--   * lead / maybe counts,
--   * the single highest-scoring lead as JSON, with the suggested reply
--     removed so drafting replies remains a Pro feature.
-- The worker side only runs this scan when ARCLI_FREE_FIRST_SCAN_ENABLED is
-- set, so applying this function has no cost on its own.

BEGIN;

CREATE OR REPLACE FUNCTION public.free_plan_first_scan_preview(
  p_service_profile_id TEXT,
  p_active_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  run_status TEXT,
  lead_count BIGINT,
  maybe_count BIGINT,
  top_lead JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_tenant AS (
    -- Mirrors free_plan_lead_queue_counts: scope strictly to the caller.
    SELECT tenant_id
      FROM public.tenant_users
     WHERE user_id::TEXT = auth.uid()::TEXT
     LIMIT 1
  ),
  scoped_matches AS (
    SELECT lead_match.*
      FROM public.lead_matches AS lead_match
      JOIN current_tenant
        ON current_tenant.tenant_id::TEXT = lead_match.tenant_id::TEXT
     WHERE lead_match.service_profile_id::TEXT = p_service_profile_id
       AND lead_match.match_status IN ('ready_for_review', 'qualified', 'discovery_candidate')
       AND (p_active_since IS NULL OR lead_match.updated_at >= p_active_since)
  ),
  best_match AS (
    SELECT scoped_matches.*
      FROM scoped_matches
     ORDER BY (scoped_matches.match_status <> 'discovery_candidate') DESC,
              scoped_matches.verifier_score DESC NULLS LAST,
              scoped_matches.created_at DESC
     LIMIT 1
  )
  SELECT
    (
      SELECT run.status
        FROM public.discovery_runs AS run
        JOIN current_tenant
          ON current_tenant.tenant_id::TEXT = run.tenant_id::TEXT
       WHERE run.service_profile_id::TEXT = p_service_profile_id
       ORDER BY run.created_at DESC
       LIMIT 1
    ) AS run_status,
    (SELECT COUNT(*) FROM scoped_matches WHERE match_status <> 'discovery_candidate') AS lead_count,
    (SELECT COUNT(*) FROM scoped_matches WHERE match_status = 'discovery_candidate') AS maybe_count,
    (
      SELECT (to_jsonb(best_match) - 'suggested_reply' - 'verification')
             || jsonb_build_object(
                  'verification',
                  COALESCE(to_jsonb(best_match) -> 'verification', '{}'::JSONB) - 'suggested_reply',
                  'source_posts',
                  to_jsonb(source_post)
                )
        FROM best_match
        LEFT JOIN public.source_posts AS source_post
          ON source_post.id = best_match.source_post_id
    ) AS top_lead;
$$;

REVOKE ALL ON FUNCTION public.free_plan_first_scan_preview(TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.free_plan_first_scan_preview(TEXT, TIMESTAMPTZ) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
