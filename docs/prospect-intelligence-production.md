# Prospect-intelligence production checklist

## Deploy order

Apply the database contracts in this order, using the normal production migration process:

1. `scripts/RLS_updates.sql`
2. `scripts/hn_source_posts_global_contract.sql`
3. `scripts/lead_match_qualification_guard.sql`
4. `scripts/prospect_intelligence_contract.sql`
5. `scripts/discovery_candidate_pool_contract.sql`
6. `scripts/buyer_language_research_contract.sql`
7. `scripts/watchlists_contract.sql`
8. `scripts/entity_first_prospecting_contract.sql`

The candidate-pool migration is required for candidate-first discovery. Do not
enable the discovery worker until it has completed successfully: otherwise the
worker can retrieve posts but cannot retain raw or plausible candidates.

The entity-first migration is additive and may be deployed before its research
workers. It enables the **Targeting** and **Targets** workflows, including
user-approved target briefs and manual account, builder, or project URLs. A
manual target starts as `high_fit`; it does not trigger source crawling, create
a lead, or claim buyer intent. Apply it before deploying a worker that writes
target evidence or assessments. The same contract also creates the durable
`prospect_research_run_entities` selection mapping and the evidence-review
RPCs used by retained-public evidence collection. Existing pre-lease running
entity-first jobs are deliberately made reclaimable by the migration; deploy a
token-aware worker with the migration rather than treating an old running job
as completed.

## Entity-first candidate generation

Official-site target generation is disabled by default. Enable it only after
the entity-first migration, FastAPI API, Redis broker, and Dramatiq process
that imports `api.workers.actors` are deployed together:

```text
ARCLI_ENTITY_CANDIDATE_GENERATION_ENABLED=true
ARCLI_ENTITY_CANDIDATE_GENERATION_QUEUE_NAME=ingestion
ARCLI_ENTITY_CANDIDATE_GENERATION_TENANT_LIMIT=2
ARCLI_ENTITY_CANDIDATE_GENERATION_TENANT_WINDOW_SECONDS=86400
ARCLI_ENTITY_CANDIDATE_GENERATION_LEASE_SECONDS=180
ARCLI_ENTITY_CANDIDATE_GENERATION_JOB_MAX_RETRIES=2
ARCLI_ENTITY_CANDIDATE_GENERATION_JOB_TIME_LIMIT_MS=180000
```

The trusted internal route is
`POST /api/prospecting/candidate-generation/trigger`. It requires the normal
internal secret, a tenant-owned service profile, and an `Idempotency-Key`
header. A `queued` response means only that a bounded request was recorded;
`running` and `terminal` are idempotent replays of the same durable request.
It never promises a target, a lead, a contact, or a buyer signal.

The worker uses only explicit approved official-site seeds. It revalidates DNS
on every request, pins the chosen public IP connection, permits same-origin
pages and redirects only, and classifies structured metadata only. It does not
call social search, profile/history discovery, public comments, private
sources, CRM delivery, or a contact provider. Default limits are 12 seeds, six
pages per seed, 48 candidate proposals, 150 seconds total execution time, and
12 seconds per seed. Do not add a dashboard control until this complete path
is deployed and the feature flag has been verified in the target environment.

## Retained-public target evidence

Retained-public target evidence is a distinct, disabled-by-default worker. It
is not a social crawler and must not be enabled simply because candidate
generation or public-source ingestion is live.

```text
ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_ENABLED=true
ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_TENANT_LIMIT=10
ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_TENANT_WINDOW_SECONDS=86400
ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_LEASE_SECONDS=90
ARCLI_RETAINED_PUBLIC_EVIDENCE_COLLECTION_QUEUE_NAME=ingestion
ARCLI_RETAINED_PUBLIC_EVIDENCE_COLLECTION_JOB_MAX_RETRIES=2
ARCLI_RETAINED_PUBLIC_EVIDENCE_COLLECTION_JOB_TIME_LIMIT_MS=75000
```

The tenant limit applies to durable explicit requests, not evidence rows. The
default is ten requests per rolling day. The lease is clamped to 30--900
seconds; an expired claim can be reclaimed, while a stale claim token cannot
persist or terminalize a run. Keep the flag unset or `false` until all of the
following are live together:

1. `scripts/entity_first_prospecting_contract.sql`, including the
   `prospect_research_run_entities` mapping and evidence-review functions.
2. The FastAPI trusted trigger and the Dramatiq consumer for retained evidence.
3. The shared database connection, Redis broker, and the global
   `source_posts` retention contract.

The trigger must receive a tenant-owned service profile plus an explicit list
of existing target IDs. The durable mapping pins that exact list, the approved
targeting-brief revision, allocation caps, and allowed public-source names. It
never persists URLs, handles, query text, source text, or contact data. An
idempotent replay returns the original run rather than consuming another quota
unit or expanding to a target's current state.

The hidden trusted route is `POST /api/prospecting/evidence-collection/trigger`.
It requires the normal internal secret and `Idempotency-Key`, accepts only a
tenant-owned service profile plus one to 25 existing target IDs, and queues
only the durable tenant/run IDs. A `queued`, `running`, or `terminal` response
describes durable work state only; it never claims a buyer signal or lead.

The current executor reads the database only. It supports only builders with
an exact GitHub, Bluesky, or Hacker News public-profile URL, and it reads at
most ten matching records from the already-retained global corpus for that
exact source-native locator. Accounts and projects are not used to infer a
person. It never calls source APIs, fetches profiles, crawls a target URL,
searches broadly, enumerates a remote posting history, expands the exact
retained slice, retrieves thread context, or uses private sources. It may
create pending cited evaluation evidence only;
it cannot create a lead, contact, CRM record, or buyer-signal label.

Keep this as a trusted server-side operation while rolling it out. Do not add
a dashboard research button until the migration, trigger, broker, and worker
have been verified in the target environment. A queued run is an auditable,
bounded request, not a promise that an account or builder will produce buyer
intent.

## Opt-in retained-public target monitoring

Target monitoring is a separate, disabled-by-default extension of
retained-public evidence. It is not a social crawler and does not use the
general Buyer Groups watchlist pipeline. A workspace member must explicitly
turn on monitoring for one eligible target in the Target desk.

Use ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_ENABLED=true together with
ARCLI_RETAINED_PUBLIC_EVIDENCE_RESEARCH_ENABLED=true. Production defaults are
ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_INTERVAL_HOURS=24,
ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_TENANT_LIMIT=5,
ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_TENANT_WINDOW_SECONDS=86400,
ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_TICK_SECONDS=300,
ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_MAX_DISPATCHES_PER_TICK=8,
ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_DISPATCH_LEASE_SECONDS=300,
ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_RETRY_SECONDS=3600, and
ARCLI_RETAINED_PUBLIC_EVIDENCE_MONITORING_SCHEDULER_TIME_LIMIT_MS=120000.

Apply prospect_target_monitoring_contract.sql after the entity-first contract,
deploy the web app and worker that imports api.workers.actors, then enable both
the retained-evidence and monitoring flags together. The worker bootstrap seeds
a singleton system-queue tick only after the scheduler-state table exists. On
startup it also places one bounded recovery check behind an already-recorded
future tick, so a lost delayed broker message can be repaired without a second
active scheduler loop. Keep monitoring disabled while any of those pieces are
partially deployed; the browser hides the watch control until both flags are
enabled and its display-safe monitor RPC is available.

The cadence is clamped to 24 hours through seven days. A targeting profile can
have at most five active monitors, and a tenant's monitor runs have their own
default five-per-24-hour quota. That quota is distinct from the explicit
retained-evidence request quota, so background watches cannot crowd out a
human-requested investigation.

The current monitor is available only for a builder with one exact supported
public profile URL: a GitHub handle page, a Bluesky profile page, or a Hacker
News user page. Each due monitor submits one existing entity ID through the
regular durable retained-evidence dispatcher. It reads only the finite matching
slice already held in the global source-post corpus. It never fetches a
profile, calls a source API, crawls the target URL, performs a broad search,
enumerates history, opens thread context, retrieves private data, creates a
lead, sends outreach, or exports a CRM record. Rejected targets pause
automatically. Any new observation remains pending until a human accepts it in
the target desk.

## Required worker configuration

- `DATABASE_URL` (or `SUPABASE_DB_URL` / `POSTGRES_URL`): worker storage and
  tenant-scope checks.
- `SUPABASE_URL`: validates Supabase-issued browser tokens through the new
  project's JWKS endpoint.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only public-source storage and trusted
  worker writes. Never expose this key to the browser.
- `REDIS_URL`: Dramatiq, tenant quotas, and the optional source-query cache.
- `INTERNAL_WORKER_SECRET`: trusted handoffs from the Next.js server to the
  Python API.
- `OPENAI_API_KEY`: website profile extraction, embeddings, and the lead
  verifier. Buyer-language research does not call OpenAI.

The Next.js deployment needs the same `INTERNAL_WORKER_SECRET` and a reachable
worker API URL. Prefer `ARCLI_WORKER_API_URL` (or `PYTHON_BACKEND_URL`) when
the worker is on a different service; explicit route URLs take precedence and
`INTERNAL_API_URL` remains a legacy fallback:

```text
ARCLI_WORKER_API_URL=https://api.example.com
ARCLI_CRAWLER_TRIGGER_URL=https://api.example.com/api/crawl/trigger
ARCLI_PROFILE_EMBEDDING_TRIGGER_URL=https://api.example.com/api/service-profile/embed/trigger
INTERNAL_WORKER_SECRET=<the same value configured on the Python API>
```

For the Vercel frontend, point `ARCLI_WORKER_API_URL` at the **FastAPI
service** (for example, `https://api.arcli.tech`), not at the `arcli-worker`
or `crawl4ai-worker` processes. Those processes consume Redis queues and do
not expose the trigger HTTP routes. `BACKEND_API_URL` and
`NEXT_PUBLIC_API_URL` are also accepted as fallbacks so the trusted handoff
uses the same backend setting as the frontend rewrite. Set the same
`INTERNAL_WORKER_SECRET` in both Vercel and DigitalOcean, then redeploy the
Next.js frontend after changing either value.

Saving a website or matching brief now reports an explicit warning when that
handoff is not accepted. Treat that warning as a deployment issue: settings
were saved, but no discovery work was queued.

Public sources are enabled independently with
`ARCLI_HN_INGESTION_ENABLED`, `ARCLI_BLUESKY_INGESTION_ENABLED`,
`ARCLI_STACKEXCHANGE_INGESTION_ENABLED`, `ARCLI_GITHUB_INGESTION_ENABLED`, and
`ARCLI_LEMMY_INGESTION_ENABLED`. GitHub and Stack Exchange work with their
public limits; set `ARCLI_GITHUB_TOKEN` / `GITHUB_TOKEN` and
`ARCLI_STACKEXCHANGE_API_KEY` for more headroom.

X is a bounded fallback only. Set `ARCLI_X_INGESTION_ENABLED=true` and one of
`X_BEARER_TOKEN`, `TWITTER_BEARER_TOKEN`, or `ARCLI_X_BEARER_TOKEN` only after
reviewing cost. The activation path permits at most one single-page fallback
and observes the tenant quota. It is suppressed only after sufficiently varied
plausible free-source coverage (default: three query types).

### Pro discovery cost controls

Pro is limited by the work that creates variable cost, not by a number of
leads. Enable the rolling 30-day guard only when `REDIS_URL` is available:

```text
ARCLI_DISCOVERY_USAGE_GUARD_ENABLED=true
ARCLI_DISCOVERY_USAGE_WINDOW_SECONDS=2592000
ARCLI_PRO_MONTHLY_SOURCE_REQUEST_LIMIT=480
ARCLI_PRO_MONTHLY_FRESH_EMBEDDING_POST_LIMIT=600
ARCLI_PRO_MONTHLY_VERIFIER_CALL_LIMIT=300
ARCLI_PRO_MONTHLY_PAID_SOURCE_REQUEST_LIMIT=20
```

The system records each accepted or limited reservation in the tenant-scoped
discovery report. Recalibrate these values from the 95th-percentile run after
the first operating month; do not replace them with a customer-visible lead
volume promise.

## Customer Watchlists

Watchlists let a workspace owner define a specific buyer group, its real-world
problem, and the public sources to scan. They do not create a second tenant or
copy the global source corpus: the worker first re-matches a bounded set of
already embedded global public posts, then performs an HN-first source scan
using natural buyer-language queries. Results live in the tenant-scoped
`watchlist_matches` table and remain verifier-gated.

The default Watchlist sources are Hacker News, Bluesky, Lemmy, Stack Exchange,
and GitHub. X is off unless the user explicitly selects it and the deployment
has its existing X credentials and enablement flag. Explicit public selectors
such as `github:owner/repository` and `stackexchange:stackoverflow` now become
source-native retrieval boundaries; supported Lemmy and Bluesky selectors are
filtered before a post enters embedding. Free-text places remain notes rather
than brittle filters. This release does not access private groups or unsupported
communities.

Configure the trusted Next.js-to-worker handoff in addition to the standard
worker settings:

```text
# Optional explicit URL. Otherwise ARCLI_WORKER_API_URL,
# PYTHON_BACKEND_URL, or INTERNAL_API_URL is used.
ARCLI_WATCHLIST_TRIGGER_URL=https://api.example.com/api/watchlists/trigger

# Bounded production defaults.
ARCLI_WATCHLIST_GLOBAL_MATCH_LIMIT=100
ARCLI_WATCHLIST_INITIAL_REMATCH_LIMIT=100
ARCLI_WATCHLIST_DISCOVERY_TENANT_LIMIT=12
ARCLI_WATCHLIST_DISCOVERY_TENANT_WINDOW_SECONDS=3600
ARCLI_WATCHLIST_DISCOVERY_COOLOFF_SECONDS=300
ARCLI_WATCHLIST_JOB_TIME_LIMIT_MS=180000
```

`ARCLI_MATCHING_SIMILARITY_THRESHOLD` now defaults to `0.20` to admit more
buyer-language and adjacent-need paraphrases to the verifier. It is a recall
prefilter, not a qualification score; `LEAD_VERIFIER_SCORE_THRESHOLD` still
controls Ready for review and `LEAD_DISCOVERY_CANDIDATE_SCORE_THRESHOLD` still
controls review-only signals. Keep the verifier enabled and do not set a higher
`ARCLI_VERIFIER_MIN_SIMILARITY_THRESHOLD` unless intentionally reducing recall.

## Optional buyer-language research

This customer-facing research mode is off by default:

```text
ARCLI_BUYER_LANGUAGE_RESEARCH_ENABLED=true
```

It is manually requested from the dashboard, is limited by default to two runs
per tenant per day, and only writes tenant-owned `discovery_evidence`. It has
no lead, qualification, or CRM path. Keep X disabled for research unless there
is a separate approved budget:

```text
ARCLI_BUYER_LANGUAGE_RESEARCH_X_ENABLED=false
```

If enabled, research X also uses one tenant-scoped fallback quota and one page.
Useful controls include `ARCLI_BUYER_LANGUAGE_RESEARCH_QUERY_LIMIT`,
`ARCLI_BUYER_LANGUAGE_RESEARCH_POSTS_PER_QUERY`,
`ARCLI_BUYER_LANGUAGE_RESEARCH_EVIDENCE_LIMIT`, and
`ARCLI_BUYER_LANGUAGE_RESEARCH_TENANT_LIMIT`.

## Safety invariants

- Only `ready_for_review` lead matches can become `qualified`; Watch items and
  buyer-language evidence cannot reach the CRM webhook.
- The browser can read only its tenant's research evidence. It never reads the
  global `source_posts` corpus.
- A displayed research excerpt must be an exact substring of captured source
  text and have `evidence_status = 'accepted'`.
- Retained-public evidence starts `pending`. The browser can list only its
  tenant's review projection and may accept or reject that evidence through
  `review_prospect_evidence`; it cannot query the global source corpus or
  supply an arbitrary source URL, author, or excerpt.
- A retained-evidence run is bound to its selected target IDs and approved
  brief revision. A retry, current-profile change, rejected target, expired
  lease, or malformed mapping must not expand the target scope or turn into a
  profile/history crawl.
- `strong_buyer_signal` is a database assessment outcome based on sufficient
  fit and fresh accepted direct-evaluation evidence. A retained row,
  collection run, or pending observation alone is never a buyer signal.
- Target-desk outcomes (`target`, `not_relevant`, `contacted`, `meeting`, and
  `won`) are immutable tenant-local feedback events. They do not create a
  lead, send outreach, export a CRM record, or automatically change a target
  assessment. The desk's feedback readiness view uses only aggregate
  tenant-scoped outcome counts; any later calibration must use those aggregate
  outcomes rather than reviewer identities or source-post content.
- Watchlist source controls only reduce the enabled public-source set. They
  cannot enable an operator-disabled connector, bypass the X fallback budget,
  or access private groups.
- Watchlist matches are read-only in the browser. A verifier-confirmed
  review-only item cannot be promoted to the CRM from this surface.
- Discovery telemetry is fail-open. It records operational hashes/aggregates,
  not raw source posts or event query text.
- CRM webhook destinations must be public HTTPS in production.

## Verification

```text
.venv\Scripts\pytest.exe -q
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\tsx.cmd --test test\buyer-demand-report.test.ts test\buyer-language-research.test.ts test\lead-qualification-gate.test.ts test\crm-webhook-safety.test.ts test\og-image.test.ts
```

The current `npm run lint` script requires ESLint, but the repository does not
declare or install an `eslint` executable. Add a pinned ESLint configuration
and dependency before making that command a CI gate; do not treat its current
failure as a source-code lint result.
