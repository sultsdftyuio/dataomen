-- Retire the 24 repository-unused tables listed in
-- docs/database_table_audit.md. Run after all historical contracts.
--
-- This permanently deletes rows in those tables. Take a database backup
-- before applying it to an existing project. RESTRICT aborts the whole
-- transaction if a retained object depends on a table or view.
-- Do not rerun functions0.sql, some_fixing.sql, RLS_security3.sql,
-- RLS_updates.sql, or entity_first_prospecting_contract.sql afterward;
-- those historical contracts recreate the retired objects.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- PL/pgSQL function bodies do not reliably create table dependencies in the
-- Postgres catalog. Refuse to proceed if a public function outside the known
-- legacy set mentions one of the tables.
DO $preflight$
DECLARE
    retired_tables TEXT[] := ARRAY[
        'alert_dispatch_logs', 'alerts', 'anomaly_alerts',
        'anomaly_detector_logs', 'api_idempotency_keys',
        'billing_webhook_events', 'campaign_events',
        'churn_risk_history', 'churn_risk_state', 'churn_scoring_runs',
        'email_templates', 'manual_interventions', 'metric_configs',
        'metric_values_daily', 'metric_values_segmented',
        'prospect_entity_links', 'recovery_attributions',
        'recovery_dispatch_dedup', 'recovery_email_dlq',
        'recovery_email_events', 'recovery_quota_usage',
        'risk_score_explanations', 'tenant_billing', 'user_activity_daily'
    ];
    unexpected_functions TEXT;
    unexpected_jobs TEXT;
BEGIN
    SELECT string_agg(
        format('%I.%I(%s)', ns.nspname, fn.proname,
               pg_get_function_identity_arguments(fn.oid)),
        ', ' ORDER BY fn.proname
    )
    INTO unexpected_functions
    FROM pg_proc AS fn
    JOIN pg_namespace AS ns ON ns.oid = fn.pronamespace
    WHERE ns.nspname = 'public'
      AND EXISTS (
          SELECT 1
          FROM unnest(retired_tables) AS retired(table_name)
          WHERE position(retired.table_name IN fn.prosrc) > 0
      )
      AND NOT EXISTS (
          SELECT 1
          FROM unnest(ARRAY[
              to_regprocedure('public.apply_manual_intervention(text,text,text,integer,text,text)'),
              to_regprocedure('public.apply_queue_intervention(uuid,text,text,integer,text,text,uuid)'),
              to_regprocedure('public.claim_account_intervention(uuid,uuid,uuid,text)'),
              to_regprocedure('public.requeue_dead_letter_intervention(uuid,uuid,text)'),
              to_regprocedure('public.dispatch_campaign_atomic(text,text,text,text,jsonb)'),
              to_regprocedure('public.bulk_dispatch_recovery_candidates(text,jsonb,integer,integer,integer,text)'),
              to_regprocedure('public.claim_dispatch_token(text,text,uuid)'),
              to_regprocedure('public.guard_prospect_entity_link_tenant_scope()')
          ]) AS reviewed(routine_oid)
          WHERE reviewed.routine_oid::oid = fn.oid
      );
    IF unexpected_functions IS NOT NULL THEN
        RAISE EXCEPTION 'Retired tables are mentioned by unreviewed functions: %',
            unexpected_functions;
    END IF;

    IF to_regclass('cron.job') IS NOT NULL THEN
        EXECUTE $jobs$
            SELECT string_agg(jobname, ', ' ORDER BY jobname)
            FROM cron.job
            WHERE (
                command ~* '(api_idempotency_keys|billing_webhook_events|recovery_email_events|recovery_email_dlq|anomaly_detector_logs)'
            )
              AND jobname NOT IN (
                  'arcli-cleanup-idempotency-keys',
                  'arcli-cleanup-billing-webhooks',
                  'arcli-cleanup-recovery-email-events',
                  'arcli-cleanup-recovery-dlq',
                  'arcli-cleanup-anomaly-logs'
              )
        $jobs$ INTO unexpected_jobs;
        IF unexpected_jobs IS NOT NULL THEN
            RAISE EXCEPTION 'Retired tables are mentioned by unreviewed cron jobs: %',
                unexpected_jobs;
        END IF;
        DELETE FROM cron.job WHERE jobname IN (
            'arcli-cleanup-idempotency-keys',
            'arcli-cleanup-billing-webhooks',
            'arcli-cleanup-recovery-email-events',
            'arcli-cleanup-recovery-dlq',
            'arcli-cleanup-anomaly-logs'
        );
    END IF;
END
$preflight$;

-- These three tables were published by the old churn dashboard. Leave any
-- all-tables publication alone; dropping a table handles that case.
DO $publications$
DECLARE
    retired_table TEXT;
BEGIN
    FOR retired_table IN
        SELECT relation.relname
        FROM pg_publication_rel AS membership
        JOIN pg_publication AS publication
          ON publication.oid = membership.prpubid
        JOIN pg_class AS relation ON relation.oid = membership.prrelid
        JOIN pg_namespace AS schema_name ON schema_name.oid = relation.relnamespace
        WHERE publication.pubname = 'supabase_realtime'
          AND schema_name.nspname = 'public'
          AND relation.relname IN ('alerts', 'anomaly_alerts', 'churn_risk_state')
    LOOP
        EXECUTE format(
            'ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',
            retired_table
        );
    END LOOP;
END
$publications$;

DROP VIEW IF EXISTS public.vw_customer_operations_metrics RESTRICT;
DROP VIEW IF EXISTS public.vw_customer_operations RESTRICT;
DROP VIEW IF EXISTS public.vw_risk_queue_radar RESTRICT;

DROP FUNCTION IF EXISTS public.apply_manual_intervention(
    TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT
) RESTRICT;
DROP FUNCTION IF EXISTS public.apply_queue_intervention(
    UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, UUID
) RESTRICT;
DROP FUNCTION IF EXISTS public.claim_account_intervention(
    UUID, UUID, UUID, TEXT
) RESTRICT;
DROP FUNCTION IF EXISTS public.requeue_dead_letter_intervention(
    UUID, UUID, TEXT
) RESTRICT;
DROP FUNCTION IF EXISTS public.dispatch_campaign_atomic(
    TEXT, TEXT, TEXT, TEXT, JSONB
) RESTRICT;
DROP FUNCTION IF EXISTS public.bulk_dispatch_recovery_candidates(
    TEXT, JSONB, INTEGER, INTEGER, INTEGER, TEXT
) RESTRICT;
DROP FUNCTION IF EXISTS public.claim_dispatch_token(
    TEXT, TEXT, UUID
) RESTRICT;

-- A single DROP resolves foreign keys between retired tables as one unit.
-- Foreign keys and views from retained tables still block the transaction.
DROP TABLE IF EXISTS
    public.alert_dispatch_logs,
    public.alerts,
    public.anomaly_alerts,
    public.anomaly_detector_logs,
    public.api_idempotency_keys,
    public.billing_webhook_events,
    public.campaign_events,
    public.churn_risk_history,
    public.churn_risk_state,
    public.churn_scoring_runs,
    public.email_templates,
    public.manual_interventions,
    public.metric_configs,
    public.metric_values_daily,
    public.metric_values_segmented,
    public.prospect_entity_links,
    public.recovery_attributions,
    public.recovery_dispatch_dedup,
    public.recovery_email_dlq,
    public.recovery_email_events,
    public.recovery_quota_usage,
    public.risk_score_explanations,
    public.tenant_billing,
    public.user_activity_daily
RESTRICT;

DROP FUNCTION IF EXISTS public.guard_prospect_entity_link_tenant_scope() RESTRICT;

COMMIT;
