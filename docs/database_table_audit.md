# Database table audit, 2026-10-02

This is a repository audit, not a claim about what is installed or populated in
Supabase. The SQL contracts declare **71 distinct public tables** (72
`CREATE TABLE` statements because `email_templates` appears twice). The
repository has no connection to the deployed database, so row counts,
external integrations, live RPC use, and scheduled jobs are unverified.

## Decision

**Keep** means the current application or worker names the table, or a current
database RPC requires it. **Conditional** means code exists for a separable
feature; keep the table when that feature is enabled. **Retirement candidate**
means no current application or worker path was found. The user authorized
deletion of those tables; `scripts/retire_legacy_tables.sql` now performs
it in one transaction with `RESTRICT` guards. Existing data and external
clients remain unverified because this workspace has no database connection.

| Contract | Table | Decision | Reason |
| --- | --- | --- | --- |
| `functions0.sql` | `tenants` | Keep | Workspace, auth, billing, and worker access |
| | `tenant_users` | Keep | Workspace membership and authorization |
| | `tenant_settings` | Keep | Settings, plans, and source configuration |
| | `api_keys` | Keep | API authentication and settings |
| | `events` | Keep | Event ingestion uses the configured `EVENTS_TABLE` default |
| | `recovery_emails` | Keep | Live unsubscribe route reads and updates it |
| | `recovery_suppressions` | Keep | Live unsubscribe route writes it |
| | `tenant_billing` | Retirement candidate | No repository runtime access; current billing uses `tenants` |
| | `api_idempotency_keys` | Retirement candidate | No repository runtime access; old cleanup job references it |
| | `alerts` | Retirement candidate | Legacy churn alert path and realtime publication |
| | `anomaly_alerts` | Retirement candidate | Legacy anomaly path and realtime publication |
| | `alert_dispatch_logs` | Retirement candidate | Legacy alert dispatch |
| | `churn_risk_state` | Retirement candidate | Legacy churn views and RPCs |
| | `risk_score_explanations` | Retirement candidate | Legacy churn scoring |
| | `campaign_events` | Retirement candidate | Legacy recovery campaign |
| | `manual_interventions` | Retirement candidate | Legacy intervention RPCs |
| | `churn_risk_history` | Retirement candidate | Legacy churn history |
| | `churn_scoring_runs` | Retirement candidate | Legacy scoring jobs |
| | `metric_configs` | Retirement candidate | Legacy metric configuration |
| | `metric_values_daily` | Retirement candidate | Legacy metric history |
| | `metric_values_segmented` | Retirement candidate | Legacy metric history |
| | `anomaly_detector_logs` | Retirement candidate | Legacy anomaly jobs |
| | `user_activity_daily` | Retirement candidate | Legacy activity summaries |
| | `email_templates` | Retirement candidate | Defined twice; no current runtime access |
| | `recovery_quota_usage` | Retirement candidate | Legacy recovery dispatch RPCs |
| | `recovery_dispatch_dedup` | Retirement candidate | Legacy dispatch token RPCs |
| | `recovery_email_dlq` | Retirement candidate | Legacy dead-letter RPCs |
| | `recovery_email_events` | Retirement candidate | Legacy email event history |
| | `recovery_attributions` | Retirement candidate | Legacy recovery attribution |
| | `billing_webhook_events` | Retirement candidate | No current webhook runtime access |
| `RLS_updates.sql` | `email_templates` | Retirement candidate | Second declaration of the same table above |
| | `service_profiles` | Keep | Website brief, crawl, and discovery |
| | `source_posts` | Keep | Public conversation evidence and leads |
| | `lead_matches` | Keep | Current dashboard lead queue |
| `crawl_pipeline_reliability.sql` | `crawl_jobs` | Keep | Crawl trigger, worker, and dashboard |
| | `crawl_pages` | Keep | Stored pages used during website processing |
| | `service_profile_embeddings` | Keep | Website matching and embedding status |
| `website_recrawl_scheduler.sql` | `website_recrawl_schedules` | Keep | Recrawl worker |
| | `website_recrawl_dispatches` | Keep | Recrawl worker dedupe |
| | `website_recrawl_scheduler_state` | Keep | Recrawl lease |
| `crawl_result_notifications.sql` | `crawl_notification_preferences` | Keep | User settings and notification worker |
| | `crawl_notification_suppressions` | Keep | Notification suppression |
| | `crawl_notification_outbox` | Keep | Notification delivery queue |
| `prospect_intelligence_contract.sql` | `discovery_runs` | Keep | Discovery worker and dashboard |
| | `discovery_run_events` | Keep | Discovery status and dashboard |
| | `lead_feedback` | Keep | Lead quality feedback |
| `discovery_candidate_pool_contract.sql` | `discovery_candidates` | Keep | Candidate discovery and matching |
| | `discovery_candidate_observations` | Keep | Candidate source evidence |
| `buyer_language_research_contract.sql` | `discovery_evidence` | Keep | Buyer language research and dashboard |
| `watchlists_contract.sql` | `watchlists` | Keep | Watchlist UI and worker |
| | `watchlist_matches` | Keep | Watchlist results |
| `entity_first_prospecting_contract.sql` | `targeting_profiles` | Keep | Approved targeting brief |
| | `prospect_entities` | Keep | Account and target identity |
| | `prospect_entity_links` | Retirement candidate | No runtime path found; only its own schema, triggers, and policies reference it |
| | `prospect_research_runs` | Keep | Candidate and evidence runs |
| | `prospect_research_run_entities` | Keep | Run-to-entity selection and persistence |
| | `prospect_evidence` | Keep | Source evidence |
| | `prospect_assessments` | Keep | Prospect review and monitoring |
| | `prospect_feedback` | Keep | Target feedback RPCs use it indirectly |
| `prospect_target_monitoring_contract.sql` | `prospect_target_monitors` | Conditional | Target-monitor feature flag and worker |
| | `prospect_target_monitor_scheduler_state` | Conditional | Target-monitor worker lease |
| `prospect_target_opportunity_contract.sql` | `prospect_opportunities` | Conditional | Target promotion and qualification RPCs |
| `assisted_prospect_delivery_contract.sql` | `assisted_prospect_pilots` | Conditional | Reviewed pilot cohort enrollment |
| | `assisted_prospect_deliveries` | Conditional | Reviewed cards and customer RPC |
| | `assisted_prospect_feedback` | Conditional | Customer verdict RPC and reports |
| | `assisted_prospect_rejections` | Conditional | Pilot yield and cost report |
| `assisted_candidate_intake_contract.sql` | `assisted_account_suppressions` | Conditional | Assisted pilot suppression |
| | `assisted_source_approvals` | Conditional | Assisted pilot source governance |
| | `assisted_prospect_candidates` | Conditional | Assisted pilot private research queue |
| | `assisted_candidate_observations` | Conditional | Assisted pilot source observations |
| `pilot_application_contract.sql` | `pilot_applications` | Keep | Landing page application and operator queue |
| `public_data_compliance_contract.sql` | `public_data_removal_requests` | Keep | Privacy removal route and processing |

The other SQL files modify these tables, functions, policies, or indexes; they
do not declare additional tables. In particular, `some_fixing.sql` and
`RLS_security3.sql` still depend on legacy churn/recovery tables. Omitting
those tables while continuing to apply those old scripts would fail.

The old dependency surface includes `vw_risk_queue_radar`,
`vw_customer_operations`, `vw_customer_operations_metrics`, recovery
dispatch and intervention RPCs in `functions0.sql` and `some_fixing.sql`,
three realtime publication members in `RLS_security3.sql`, and five cleanup
jobs there for idempotency keys, billing webhooks, recovery email events,
recovery dead letters, and anomaly logs. The separate terminal
`recovery_emails` cleanup still protects a table used by the unsubscribe
route. A retirement migration must handle these objects individually.

## Optimized v1 boundary

For the **public pilot application form**, the complete table migration is
`scripts/pilot_application_contract.sql`. It is independent of the assisted
pilot's eight tables. For the full existing app, 36 tables are on current
paths and 11 are conditional feature tables. The remaining 24 are retirement
candidates covered by the retirement migration. Reducing the full schema
further without changing application code would break a named table or RPC.

Do not use the historical full-install list as a command to apply every
optional contract. On an existing database, first run
`scripts/audit_public_tables.sql` and
`scripts/audit_legacy_dependencies.sql` in the Supabase SQL editor. Review
the 24 candidates for rows, size, old views/functions, inbound foreign keys,
realtime publications, scheduled jobs, and any external clients. The
dependency query cannot see external clients or dynamic SQL, and it does not
inspect `cron.job`; check the scheduled jobs in Supabase separately. Scan
statistics are cumulative estimates and do not establish that a table is
unused. Back up the database, then run
`scripts/retire_legacy_tables.sql` after all historical contracts. The
migration removes the known legacy functions, views, cron jobs, and realtime
members, then drops the 24 tables with `RESTRICT`. It aborts on an
unexpected retained dependency instead of using `CASCADE`. Run
`scripts/verify_legacy_retirement.sql` afterward; it should report
`expected_retired_tables = 24` and `tables_still_present = 0`.

In Supabase, paste and execute the full retirement file as one SQL editor
query; its `BEGIN`/`COMMIT` block is atomic. Apply it to a staging copy
first, verify the result, and smoke-test sign-up, website crawl, discovery,
lead review, unsubscribe, the pilot application, and assisted delivery if
enabled. Then back up and apply it to production. If a guard raises an
exception, the transaction rolls back; inspect the named dependency instead
of removing `RESTRICT`. Do not reapply the historical contracts after this
migration because they can recreate retired tables and jobs.

The table count itself is not the lead-volume bottleneck. Source coverage,
research yield, review capacity, and quality govern whether Arcli can deliver
enough outreach-worthy prospects.
