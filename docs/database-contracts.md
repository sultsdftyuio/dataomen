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
11. `scripts/discovery_candidate_pool_contract.sql` - apply after steps 5,
    8, and 10; it stores raw and plausible discovery candidates before they
    become verified leads.
12. `scripts/buyer_language_research_contract.sql`
13. `scripts/watchlists_contract.sql`
14. `scripts/entity_first_prospecting_contract.sql` — tenant-scoped target
    briefs, accounts, builders, projects, evidence, assessments, feedback, and
    lease-safe candidate-generation and retained-public evidence runs pinned to
    an approved brief revision. It also defines the immutable
    `prospect_research_run_entities` selection mapping and tenant-scoped
    evidence listing/review RPCs.
15. `scripts/service_profile_website_scope.sql`
16. `scripts/enforce-free-plan-limits.sql`
17. `scripts/stripe.sql` — only when Stripe Connect is enabled.
18. `scripts/public_data_compliance_contract.sql`
19. `scripts/recovery_unsubscribe_compat.sql` — only while the retained
    recovery-unsubscribe route remains enabled.

The detailed dependency order for steps 8–14 is also in
[`prospect-intelligence-production.md`](prospect-intelligence-production.md).

The optional target-monitoring contract follows the entity-first contract; it
is not needed for manual targets, candidate generation, or one-off
retained-evidence review.

## Entity-first retained-public evidence migration

Apply `entity_first_prospecting_contract.sql` through the normal production
migration path before enabling retained-public target evidence. The script
depends on the global `source_posts` contract, extends the shared research-run
lease invariant to `evidence_collection`, and creates the durable selected
target mapping. That mapping is service-only: it stores target IDs, immutable
policy caps, and source names, but no canonical URL, author locator, query,
source text, or contact field.

The same migration exposes narrow browser-facing evidence functions:
`list_prospect_evidence_for_profile(UUID)` returns the tenant's reviewable
projection, `review_prospect_evidence(UUID, TEXT)` records an
`accepted`/`rejected` human decision, and
`list_prospect_feedback_summary_for_profile(UUID)` returns aggregate outcome
counts only. They do not grant browser access to the global source corpus, the
mapping table, reviewer identities, or per-target feedback history.

The migration makes legacy running entity-first generation/evidence jobs
reclaimable rather than preserving an unsafe pre-token claim. Deploy the
lease-aware API and worker with it, leave
`ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_ENABLED` disabled during a partial
rollout, and do not run the retained-evidence consumer against a database that
has not applied the full contract.

## Opt-in retained-public target monitoring

prospect_target_monitoring_contract.sql is a separate additive migration. Apply
it only after the entity-first retained-evidence contract and before enabling
target monitoring. It creates an opt-in monitor table, a singleton
scheduler-state table, a display-safe monitoring-status RPC, and a narrow
enable/disable RPC that accepts only an assessment ID plus a boolean.

Only exact GitHub, Bluesky, and Hacker News builder profile locators are
eligible. The contract stores target IDs and scheduler state, never URLs,
handles, queries, source text, contacts, profile history, or browser-supplied
cadence. A targeting profile may have at most five active monitors. Rejected
targets are paused automatically.

Authenticated users have no direct monitor-table access. The status projection
omits leases, run IDs, error details, source locators, and retained records.
The worker reuses the retained-public evidence collection boundary and has a
separate bounded monitor quota, so it cannot consume the explicit-research
budget.

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
