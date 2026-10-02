# Prospect discovery baseline: 1 October 2026

**Status:** code and configuration baseline captured. Production yield remains **unmeasured** from this workspace. This is not evidence that Arcli delivers any particular number of outreach-worthy prospects.

## Verified in the repository

- The existing paid discovery path is website profile → public source queries → early admission → global post persistence → embedding/semantic match → verifier → `lead_matches` → paid dashboard. The customer-reported experience is usually zero relevant opportunities and occasionally up to three in a week; no production tenant sample was available here to independently verify the rate.
- `.do/app.yaml` configures six initial queries, two variants per type, 15 posts/query, one additional-source page, a 90-day initial lookback, 60 fresh embeddings/run and 20/source. Pro usage limits include 480 source requests, 600 fresh embeddings, 300 verifier calls and 20 paid source requests per rolling 30 days. These are checked-in values, **not confirmed live settings**.
- HN, Bluesky, GitHub, Stack Exchange and Lemmy have adapters. X is disabled in the checked-in deployment manifest. The provider-neutral account intake has no active licensed provider client. Official-site target generation and retained target monitoring are bounded and feature gated.
- `discovery_runs`, `discovery_run_events`, `discovery_candidates`, `lead_matches` and feedback tables can provide part of a funnel. The previous event schema recorded hits and plausible hits but did not say why early admission rejected hits. The first implementation change adds rejection reason and governance-exclusion counts for HN and the four additional public sources to query/source events and the run summary.
- No database, Supabase service role, Redis or OpenAI environment variables are present in this shell. There is no authenticated production connection in this checkout. A local test or checked-in deployment file cannot replace read-only production measurement.

### First independent source-supply probe

On 1 October 2026 at 15:17 UTC, `scripts/probe_hn_show_supply.py --limit 100` read the [official HN Show list](https://github.com/HackerNews/API#ask-show-and-job-stories) without storing story content. All 100 requested items were readable; 89 had timestamps within seven days, 99 had external URLs, and those URLs covered 73 distinct domains. The oldest item in this **rolling, ranking-dependent sample** was 218 hours old. This is evidence of raw software-launch supply, **not** 89 weekly B2B prospects, contactable accounts, buyer-intent signals, or permission to use the data commercially. A reviewer must verify fit, identity, source rights and a route; a single rolling list may omit other stories and is not a complete weekly count.

## Production read-only baseline to collect

Use an authorized read-only/operator connection. Review the last **four complete Monday–Sunday weeks** for each pilot-eligible paid workspace, and include failed and zero-result runs. Never export raw source text or contact data into a shared report.

1. Confirm deployed web/API/worker version, environment flag values **without exposing secrets**, SQL contract versions, paid entitlement, worker queues/scheduler, provider egress and quota balances.
2. For each active profile and week: approved ICP, number of scheduled/started/completed/partial/failed runs, source requests/hits, source failures, admission pass and rejection reasons, governance exclusions, distinct persisted posts, candidate-pool states, embedding selected/deferred, verifier executed/skipped/failed, `lead_matches` by status, and signed-in dashboard-visible rows.
3. For each delivered item: distinct entity, tier supported by evidence, reviewer outcome, customer explicit acceptance, contact and meeting. The current tables do **not** provide all of these distinctions; label missing fields `unknown`, not zero.
4. Reconcile gaps: raw hits minus admission rejects minus governance exclusions; admitted posts minus persisted/deduped refs; candidates minus embedding budget; embeddings minus verifier; verified matches minus dashboard visibility. Sample real rejected hits under source governance to estimate false-negative rate.
5. Calculate costs by source and stage, including failed/repeated work. Compare week-one backfill with recurring weeks so an initial 90-day search is not mistaken for daily supply.

### Example aggregate queries

Run these against the actual deployed schema after confirming contracts. Replace the tenant placeholder privately. Results are *pipeline counts*, not qualified prospect counts. A `lead_matches` row may have been updated after creation, and runs/events can include repeated observations, so do not sum them into distinct delivered leads.

```sql
-- Use one authorized tenant at a time; aggregate only.
SELECT date_trunc('week', started_at) AS week_start_utc,
       count(*) AS runs,
       count(*) FILTER (WHERE status = 'completed') AS completed_runs,
       count(*) FILTER (WHERE status IN ('partial', 'failed')) AS troubled_runs,
       sum(COALESCE(NULLIF(summary->>'hits_found', '')::integer, 0)) AS search_hits,
       sum(COALESCE(NULLIF(summary->>'plausible_hits', '')::integer, 0)) AS admission_passes,
       sum(COALESCE(NULLIF(summary->>'matching_source_posts', '')::integer, 0)) AS matchable_refs
FROM public.discovery_runs
WHERE tenant_id = 'REPLACE_WITH_TENANT_ID'
  AND started_at >= now() - interval '35 days'
  AND run_kind = 'opportunity_leads'
GROUP BY 1
ORDER BY 1;
```

```sql
-- New rejection diagnostics appear only for runs after the instrumentation deploy.
SELECT source,
       reason.key AS rejection_reason,
       sum(reason.value::integer) AS rejected_hits
FROM public.discovery_run_events AS event
CROSS JOIN LATERAL jsonb_each_text(
    CASE WHEN jsonb_typeof(event.details->'admission_rejections') = 'object'
         THEN event.details->'admission_rejections'
         ELSE '{}'::jsonb END
) AS reason(key, value)
WHERE event.tenant_id = 'REPLACE_WITH_TENANT_ID'
  AND event.occurred_at >= now() - interval '35 days'
  AND event.phase = 'search'
  AND event.outcome = 'completed'
GROUP BY source, reason.key
ORDER BY rejected_hits DESC;
```

For older contracts without `run_kind`, remove that predicate only after confirming every historical run is an opportunity run. Verify the exact week boundary in the customer's time zone outside these UTC aggregate examples. A source result can be repeated across queries, so inspect unique canonical IDs before estimating supply.

## Required baseline result sheet

| Workspace / segment | Four weekly eligible days | Source hits | Admission passes | Unique candidates | Verified matches | Dashboard-visible | Reviewer-approved | Customer accepted | Contacted | Cost per accepted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Awaiting authorized production data | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown |

The working segment is founder-led B2B SaaS sellers targeting software companies. This is a build assumption, not a proven market choice. Compare it with an account-rich alternative after initial customer reviews, using **accepted yield, repeatability and willingness to pay**, rather than raw source-hit volume. Lack of production database access does not block source experiments or local reliability work.
