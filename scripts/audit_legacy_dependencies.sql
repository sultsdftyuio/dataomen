-- Read-only follow-up for the 24 retirement candidates in
-- docs/database_table_audit.md. Names found in function bodies are heuristic;
-- dynamic SQL and external clients are not discoverable from this query.
WITH candidates(table_name) AS (
    VALUES
        ('alert_dispatch_logs'), ('alerts'), ('anomaly_alerts'),
        ('anomaly_detector_logs'), ('api_idempotency_keys'),
        ('billing_webhook_events'), ('campaign_events'),
        ('churn_risk_history'), ('churn_risk_state'), ('churn_scoring_runs'),
        ('email_templates'), ('manual_interventions'), ('metric_configs'),
        ('metric_values_daily'), ('metric_values_segmented'),
        ('prospect_entity_links'), ('recovery_attributions'),
        ('recovery_dispatch_dedup'), ('recovery_email_dlq'),
        ('recovery_email_events'), ('recovery_quota_usage'),
        ('risk_score_explanations'), ('tenant_billing'),
        ('user_activity_daily')
)
SELECT
    candidates.table_name,
    to_regclass('public.' || candidates.table_name) IS NOT NULL AS installed,
    COALESCE((
        SELECT array_agg(DISTINCT fk.conrelid::regclass::text ORDER BY fk.conrelid::regclass::text)
        FROM pg_constraint AS fk
        WHERE fk.contype = 'f'
          AND fk.confrelid = to_regclass('public.' || candidates.table_name)
    ), '{}'::text[]) AS referencing_tables,
    COALESCE((
        SELECT array_agg(DISTINCT view_name ORDER BY view_name)
        FROM (
            SELECT views.schemaname || '.' || views.viewname AS view_name
            FROM pg_views AS views
            WHERE views.schemaname = 'public'
              AND position(candidates.table_name IN views.definition) > 0
        ) AS matching_views
    ), '{}'::text[]) AS views_mentioning_table,
    COALESCE((
        SELECT array_agg(DISTINCT function_name ORDER BY function_name)
        FROM (
            SELECT functions.proname || '(' ||
                pg_get_function_identity_arguments(functions.oid) || ')' AS function_name
            FROM pg_proc AS functions
            JOIN pg_namespace AS schemas ON schemas.oid = functions.pronamespace
            WHERE schemas.nspname = 'public'
              AND position(candidates.table_name IN functions.prosrc) > 0
        ) AS matching_functions
    ), '{}'::text[]) AS functions_mentioning_table,
    COALESCE((
        SELECT array_agg(DISTINCT publication.pubname ORDER BY publication.pubname)
        FROM pg_publication_tables AS publication
        WHERE publication.schemaname = 'public'
          AND publication.tablename = candidates.table_name
    ), '{}'::text[]) AS publications
FROM candidates
ORDER BY candidates.table_name;
