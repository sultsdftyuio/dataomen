-- Read-only check after scripts/retire_legacy_tables.sql.
WITH retired(table_name) AS (
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
    count(*) AS expected_retired_tables,
    count(*) FILTER (
        WHERE to_regclass('public.' || retired.table_name) IS NOT NULL
    ) AS tables_still_present,
    array_agg(retired.table_name ORDER BY retired.table_name) FILTER (
        WHERE to_regclass('public.' || retired.table_name) IS NOT NULL
    ) AS remaining_names
FROM retired;
