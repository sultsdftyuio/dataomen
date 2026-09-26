# Entity-First Prospecting

Entity-first prospecting lets Arcli start from a likely customer shape instead
of waiting for somebody to state an explicit need in a public post. A target
can be an `account`, an independent `builder`, or a `project`; a registered
company is not required.

## Manual targets

The controlled manual entry point remains available regardless of whether
automated generation is deployed:

1. A workspace owner saves a targeting brief from **Targeting**.
2. The owner adds a public account, builder, or project URL in **Targets**.
3. Arcli stores it as a tenant-local `high_fit` target.
4. The target desk shows that no buyer signal has been observed until accepted
   evidence is reviewed from an explicit research request.

Saving a targeting brief or adding a manual target never starts a public-source
scan. This is intentional: it gives the owner control over the target universe
before variable-cost or privacy-sensitive enrichment begins.

## Bounded Phase 2 generation

The backend now supports an explicitly requested, feature-gated official-site
generation run. It is not exposed as a dashboard button until the migration,
FastAPI service, Redis producer, and Dramatiq worker have all been deployed.
The hidden trusted trigger records an idempotent request before it puts only a
tenant ID and run ID on the queue.

For one approved targeting-brief revision, the worker:

1. Rebuilds the pinned seed plan from the current approved brief and abandons
   the run if the brief changed.
2. Fetches only planned, same-origin official-site pages, with DNS
   revalidation, a pinned public IP connection, redirect restrictions, and
   byte/time/page caps.
3. Classifies only JSON-LD and OpenGraph metadata. Page text, HTML, social
   links, comments, profiles, history surfaces, and private sources cannot
   become candidates.
4. Writes a tenant-local `high_fit` account, builder, or project only under a
   live worker lease. An official-site candidate gets one cited, weak,
   `pending` **fit** observation—not a trigger, problem, evaluation, buyer
   signal, or lead.

The default plan is limited to 12 unique seeds, six pages per seed, and 48
candidate proposals in total. The worker additionally keeps a 150-second
lease-aware execution budget and a 12-second per-seed transport budget. Slow
or invalid sites make a run `partial`; they never expand crawl scope.

The licensed-provider adapter is a separate, pure boundary. It accepts only
authorized non-contact entity results with public canonical URLs, discards
contact results, and produces `high_fit` proposals without evidence. It is not
called by the default official-site worker until a provider-specific
authorization, billing, and result-contract integration is deployed.

## Assessment states

| State | Meaning |
| --- | --- |
| `high_fit` | Matches the approved targeting thesis; no buyer intent is claimed. |
| `triggered` | Has accepted public evidence of a relevant change. |
| `signal_backed` | Has accepted public problem or evaluation evidence. |
| `strong_buyer_signal` | Has sufficient fit plus fresh, accepted direct evaluation evidence. |
| `rejected` | Is bad fit, stale, or unreliable; it cannot be reopened in place. |

The score dimensions are relevance/evidence dimensions, not probabilities that
a person or company will buy. The browser withholds a strong-signal label if
the returned evidence does not contain cited, verified direct evaluation
evidence.

## Data boundary

`scripts/entity_first_prospecting_contract.sql` creates tenant-scoped tables
for targeting profiles, entities, entity links, evidence, assessments, runs,
and immutable feedback. It deliberately does not add email, phone, contact
name, direct-message, or private-profile fields.

Public-source evidence references the existing global `source_posts` row. Its
excerpt must be grounded in the preserved source text, and it is removed with
the underlying public post. Provider data and target assessments remain local
to the workspace; Arcli does not build a global people graph.

The browser receives a tenant-scoped evidence projection, not the global
source corpus. A citation can expose the original source permalink and its
grounded excerpt for review, but never source-post bodies, author metadata, or
arbitrary retained records.

Authenticated users have read-only table access. The only browser-callable
writes are narrowly scoped RPCs that derive the tenant from `auth.uid()`:

- `upsert_targeting_profile(...)`
- `create_manual_prospect_entity(...)`
- `review_prospect_evidence(...)`
- `submit_prospect_feedback(...)`

`list_prospect_evidence_for_profile(...)` is the corresponding read-only
evidence projection. A review can only move pending evidence to `accepted` or
`rejected`; an identical retry is safe and a conflicting second decision is
rejected. Only accepted, cited evidence can affect the target assessment. It
does not create a lead, a contact, or a CRM action.

The target desk can also record fixed human workflow outcomes—keep targeting,
not relevant, contacted, meeting, or won—through
`submit_prospect_feedback(...)`. These are immutable tenant-local feedback
events, not lead qualification, outreach, CRM export, or automatic score
changes. Calibration must remain aggregate, tenant-scoped, and opt-in once
enough real outcomes exist.

`list_prospect_feedback_summary_for_profile(...)` exposes only aggregate
counts and timestamps by outcome type for the active workspace. It omits
reviewer identities and individual target history, so it can show calibration
readiness without creating a people or contact dataset.

## Opt-in retained-public target monitoring

Monitoring is a separate Phase 6 extension and is off by default. It is
available only after prospect_target_monitoring_contract.sql, the web app,
Redis, and the system-queue worker are deployed with both retained-evidence and
monitoring flags enabled.

A workspace member can explicitly watch at most five eligible targets per
targeting profile. The initial executor supports only builders whose canonical
URL is an exact GitHub, Bluesky, or Hacker News public profile locator. It
rechecks a small retained-public-source slice once per day or less often; it
does not fetch profiles, crawl target URLs, call source APIs, broadly search,
enumerate posting history, read thread context, or access private sources.
Accounts, projects, repositories, company URLs, and ambiguous social links are
not silently treated as a person.

Each monitor has its own bounded quota, separate from the explicit
retained-evidence request quota. The browser can read only active/paused state
and next-check timing. It cannot read scheduler leases, run IDs, errors,
locators, or retained source records, and it supplies only an assessment ID
plus enable/disable boolean. Rejected targets pause automatically. A monitor
produces only pending cited evidence; it never makes a lead, sends outreach,
changes a score automatically, or exports to a CRM.

## Deployment

Apply the migration after the prospect intelligence and candidate-pool
contracts:

```text
scripts/entity_first_prospecting_contract.sql
```

Then redeploy the API, web application, and Dramatiq worker. Keep
`ARCLI_ENTITY_CANDIDATE_GENERATION_ENABLED` unset or `false` until all three
are live and `REDIS_URL` is configured. The Targeting page fails safely when
the additive contract is not yet present; it does not affect existing
public-post lead discovery.

If enabling opt-in target monitoring, apply
prospect_target_monitoring_contract.sql after this base contract and deploy its
system-queue scheduler before enabling the monitoring flag. The retained
evidence and monitoring flags must be enabled together; leave both monitoring
surfaces disabled during a partial rollout.

## Retained-public evidence collection

Retained-public evidence collection is a separate, opt-in operation. It is
disabled by default with
`ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_ENABLED=false`. Adding a target,
saving a targeting brief, accepting an official-site candidate, or ingesting a
new public post never starts it.

An explicit server-side request selects existing targets only. The run pins the
approved targeting-brief revision and persists the selection in
`prospect_research_run_entities`; the mapping contains target IDs and bounded
policy values, never a URL, handle, query, source text, or contact data. A
retry reloads that original scope under a lease rather than rebuilding it from
the target's current state. A changed brief, a malformed target, or a target
rejected since selection is skipped safely instead of widening the work.

The default policy permits at most 25 selected targets, eight evidence items
per target, 50 items per run, and ten retained records examined per target.
Run creation is idempotent and tenant-budgeted (default: ten requests in a
rolling 24-hour window). A claimed worker lease defaults to 90 seconds and is
bounded to 30--900 seconds; a stale worker cannot write after its claim is
replaced. Run summaries contain counters and reason codes, not source content
or search terms.

The current executor is intentionally narrower than the general planning
contract. It performs database reads only, and only for a `builder` whose
canonical URL is an exact GitHub, Bluesky, or Hacker News public profile URL.
It then reads at most the retained global `source_posts` rows for that exact
source-native author locator. It does not infer a person from an account,
project, company, repository, or website. It does not fetch a profile, call a
source API, run a keyword search, enumerate a remote posting history, expand
the exact retained slice, read thread context, crawl a target URL, or access
private sources.

Matching direct tool-evaluation language produces only a pending, cited
observation. A human must accept or reject it in the target desk. `strong` on
an observation describes evidence strength, not predicted purchase intent;
the database's assessment rules still require sufficient fit and fresh,
accepted direct-evaluation evidence before showing `strong_buyer_signal`.

Before enabling this path, apply
`scripts/entity_first_prospecting_contract.sql` and deploy the matching API,
database worker, and broker configuration together. Verify that the global
public-source retention contract is already live. Keep the flag unset or
`false` during a partial rollout; no dashboard control should imply that
research is active before the trusted dispatch path is deployed.

Typical production settings are:

```text
ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_ENABLED=true
ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_TENANT_LIMIT=10
ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_TENANT_WINDOW_SECONDS=86400
ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_LEASE_SECONDS=90
ARCLI_RETAINED_PUBLIC_EVIDENCE_COLLECTION_QUEUE_NAME=ingestion
ARCLI_RETAINED_PUBLIC_EVIDENCE_COLLECTION_JOB_MAX_RETRIES=2
ARCLI_RETAINED_PUBLIC_EVIDENCE_COLLECTION_JOB_TIME_LIMIT_MS=75000
```

The hidden trusted trigger is `POST /api/prospecting/evidence-collection/trigger`.
It requires the normal internal secret, an `Idempotency-Key`, a tenant-owned
service profile, and one to 25 existing target IDs. It accepts no URL, handle,
query, source text, or contact field. A `queued`, `running`, or `terminal`
response reports only durable work state; it does not claim that evidence,
intent, or a buyer was found. Reusing an idempotency key replays the original
selected-target run even if a caller later sends a different target list.
