# Database contract guide

Arcli's SQL scripts are manual, idempotent database contracts. Apply them in
the listed order to a new workspace; do not run every file in `scripts/` just
because it exists.

## Current Arcli product contracts

1. `scripts/functions0.sql` — base tenants, users, settings, API-key support,
   and safe workspace provisioning.
2. `scripts/some_fixing.sql` — upgrades older tenant, API-key, and subscription
   columns to the current free/pro model.
3. `scripts/settings_profile_update_fix.sql` — the settings fields and policies
   used by website discovery.
4. `scripts/RLS_security3.sql` — base tenant isolation and API-key protection.
5. `scripts/RLS_updates.sql` — service profiles, lead matches, source posts,
   current billing fields, and dashboard RLS.
6. `scripts/event_ingestion_compat.sql` — properties and idempotency protection
   used by the active event-ingestion service.
7. `scripts/crawl_pipeline_reliability.sql` — website-crawl jobs, pages, and
   service-profile embeddings.
8. `scripts/hn_source_posts_global_contract.sql`
9. `scripts/lead_match_qualification_guard.sql`
10. `scripts/prospect_intelligence_contract.sql`
11. `scripts/buyer_language_research_contract.sql`
12. `scripts/watchlists_contract.sql`
13. `scripts/service_profile_website_scope.sql`
14. `scripts/enforce-free-plan-limits.sql`
15. `scripts/stripe.sql` — only when Stripe Connect is enabled.
16. `scripts/public_data_compliance_contract.sql`
17. `scripts/recovery_unsubscribe_compat.sql` — only while the retained
    recovery-unsubscribe route remains enabled.

The detailed dependency order for steps 8–12 is also in
[`prospect-intelligence-production.md`](prospect-intelligence-production.md).

## Retained recovery-unsubscribe compatibility

The previous recovery-email campaign and outbox migrations were removed. The
current lead-discovery workers do not run recovery campaigns, queues, or
outbound recovery workers.

In particular, `app/api/recovery/unsubscribe` still reads
`recovery_emails` and writes `recovery_suppressions` to honour old unsubscribe
links. Do not drop those two tables or delete the base `functions0.sql` contract
unless that route is deliberately retired in application code too.

`functions0.sql` and `RLS_security3.sql` remain because they contain active
tenant, API-key, and security requirements. They should be treated as database
baseline history, not files to run blindly against an unknown production schema.

## Removed duplicate/obsolete scripts

- `fetchuser.sql` and `validate_constraints.sql` were identical copies of the
  user-provisioning trigger already defined in `functions0.sql`.
- `assisted_outreach.sql` duplicated fields and defaults already created by
  `RLS_updates.sql`.
- `payments.sql` created unused customer-subscription and payment-event tables
  from the prior churn product. The current tenant billing fields are supplied
  by `some_fixing.sql` and `RLS_updates.sql`.
- `foundtions1.sql`, `Outbox_infuctcure2.sql`, `email_templates.sql`, and
  `recovery_campaign_contract_fixes.sql` were recovery-campaign/outbox
  migrations with no active application caller. The two still-required pieces
  were preserved in `event_ingestion_compat.sql` and
  `recovery_unsubscribe_compat.sql`.
