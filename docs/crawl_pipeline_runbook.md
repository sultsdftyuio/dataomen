# Crawl Pipeline Reliability Runbook

Incident target: `https://www.arcli.tech/`

The onboarding path is:

1. Next.js submits the workspace website update and schedules a post-response trigger.
2. FastAPI `POST /api/crawl/trigger` enqueues `api.services.crawling.process_crawl_job`.
3. Dramatiq consumes queue `crawling` from Redis.
4. `WebsiteCrawler` calls Firecrawl for homepage, pricing, features, and use-case surfaces.
5. `ProfileExtractor` calls OpenAI with strict Pydantic schema parsing.
6. The worker persists `crawl_jobs`, `crawl_pages`, and the final `service_profiles` row.

## 1. Supabase State Isolation

Find the tenant and the exact crawl job row:

```sql
WITH target AS (
  SELECT 'https://www.arcli.tech/'::text AS website_url
)
SELECT ts.tenant_id,
       ts.website_url AS tenant_settings_url,
       cj.id AS crawl_job_id,
       cj.status,
       cj.phase,
       cj.message_id,
       cj.attempt_count,
       cj.pages_crawled,
       cj.content_chars,
       cj.failure_reason,
       cj.error_type,
       cj.error_message,
       cj.error_context,
       cj.queued_at,
       cj.started_at,
       cj.completed_at,
       cj.failed_at,
       cj.dead_lettered_at,
       cj.last_heartbeat_at,
       NOW() - cj.last_heartbeat_at AS heartbeat_age
FROM public.tenant_settings ts
LEFT JOIN public.crawl_jobs cj
  ON cj.tenant_id = ts.tenant_id::text
 AND cj.website_url IN ('https://www.arcli.tech/', 'https://www.arcli.tech')
WHERE ts.website_url ILIKE '%arcli.tech%'
ORDER BY cj.updated_at DESC NULLS LAST;
```

Check whether raw markdown was partially committed:

```sql
SELECT cj.id AS crawl_job_id,
       cj.status,
       cj.phase,
       cp.source_url,
       cp.content_chars,
       cp.content_sha256,
       cp.created_at,
       LEFT(cp.markdown, 500) AS markdown_preview
FROM public.crawl_jobs cj
LEFT JOIN public.crawl_pages cp ON cp.crawl_job_id = cj.id
WHERE cj.website_url IN ('https://www.arcli.tech/', 'https://www.arcli.tech')
ORDER BY cp.created_at DESC NULLS LAST;
```

Check for an empty or orphaned profile:

```sql
SELECT sp.id,
       sp.tenant_id,
       sp.website_url,
       sp.status,
       sp.extraction_status,
       sp.updated_at,
       COALESCE(array_length(sp.target_audience, 1), 0) AS target_audience_count,
       NULLIF(sp.core_problem, '') IS NOT NULL AS has_core_problem,
       sp.profile_json <> '{}'::jsonb AS has_profile_json,
       spe.id AS embedding_row_id,
       spe.status AS embedding_status,
       spe.embedding_model,
       spe.embedding_dimensions
FROM public.service_profiles sp
LEFT JOIN public.service_profile_embeddings spe
  ON spe.service_profile_id = sp.id
WHERE sp.website_url IN ('https://www.arcli.tech/', 'https://www.arcli.tech')
   OR sp.profile_json->>'website_url' IN ('https://www.arcli.tech/', 'https://www.arcli.tech')
ORDER BY sp.updated_at DESC;
```

If the standalone embedding table has not been deployed yet, use the embedded JSON fallback:

```sql
SELECT id,
       tenant_id,
       website_url,
       status,
       extraction_status,
       updated_at,
       profile_json ? 'profile_embedding' AS profile_json_has_embedding,
       profile ? 'profile_embedding' AS profile_has_embedding,
       data ? 'profile_embedding' AS data_has_embedding
FROM public.service_profiles
WHERE website_url IN ('https://www.arcli.tech/', 'https://www.arcli.tech')
   OR profile_json->>'website_url' IN ('https://www.arcli.tech/', 'https://www.arcli.tech');
```

Classify the state:

- `pending` with no Redis message: enqueue path died before broker send.
- `processing` with `last_heartbeat_at` older than 10 minutes: worker crash, OOM, or provider call exceeded guardrails.
- `failed`: inspect `failure_reason`, `error_type`, and `error_context.phase`.
- `dead_lettered`: all retries exhausted; replay only after the underlying provider/target issue is fixed.
- `completed` with no `service_profiles` row: profile persistence failed after crawl completion.

## 2. Dramatiq and Redis Triage

Dramatiq RedisBroker defaults to namespace `dramatiq`. Queue keys for the crawl actor:

```bash
redis-cli -u "$REDIS_URL" LLEN dramatiq:crawling
redis-cli -u "$REDIS_URL" HLEN dramatiq:crawling.msgs
redis-cli -u "$REDIS_URL" HLEN dramatiq:crawling.DQ.msgs
redis-cli -u "$REDIS_URL" ZCARD dramatiq:crawling.XQ
redis-cli -u "$REDIS_URL" ZREVRANGE dramatiq:crawling.XQ 0 10 WITHSCORES
redis-cli -u "$REDIS_URL" ZRANGE dramatiq:__heartbeats__ 0 -1 WITHSCORES
redis-cli -u "$REDIS_URL" KEYS 'dramatiq:__acks__.*.crawling'
```

Inspect queued and delayed messages:

```bash
redis-cli -u "$REDIS_URL" LRANGE dramatiq:crawling 0 20
redis-cli -u "$REDIS_URL" HGETALL dramatiq:crawling.msgs
redis-cli -u "$REDIS_URL" HGETALL dramatiq:crawling.DQ.msgs
```

For profiles stuck at `embedding_status = 'pending'`, inspect the embedding
queue instead:

```bash
redis-cli -u "$REDIS_URL" LLEN dramatiq:embeddings
redis-cli -u "$REDIS_URL" HLEN dramatiq:embeddings.msgs
redis-cli -u "$REDIS_URL" HLEN dramatiq:embeddings.DQ.msgs
redis-cli -u "$REDIS_URL" ZCARD dramatiq:embeddings.XQ
redis-cli -u "$REDIS_URL" ZREVRANGE dramatiq:embeddings.XQ 0 10 WITHSCORES
redis-cli -u "$REDIS_URL" KEYS 'dramatiq:__acks__.*.embeddings'
```

Interpretation:

- Queue `LLEN > 0` and no fresh worker heartbeat means workers are down or cannot reach Redis.
- `dramatiq:crawling.DQ.msgs` growing means retry backoff is active.
- `dramatiq:crawling.XQ` growing means retries exhausted or workers are failing messages.
- `dramatiq:embeddings` growing while profiles remain `pending` means the
  embedding actor is not being consumed. Confirm the worker starts with
  `python scripts/start_worker.py` and `ARCLI_DRAMATIQ_MODULES=api.worker`.
- Ack keys with stale heartbeats suggest worker death while processing. Redis maintenance will eventually requeue, but the DB `crawl_jobs.last_heartbeat_at` is the operator source of truth.

Worker/log commands:

```bash
# Local/container process check
ps aux | grep -E 'dramatiq|start_worker|api.worker' | grep -v grep

# Docker
docker ps --filter name=worker
docker logs --since=45m <worker-container> \
  | grep -E 'crawl_job_|website_crawl_|firecrawl_|profile_extraction_|openai_profile_|service_profile_embedding_'

# Render/Fly/Railway style logs
grep -E 'crawl_job_id=.*|website_url=https://www.arcli.tech' worker.log
```

### Worker RAM growth

The worker declares five normal and five delayed queues.  Check delayed-message
backlog before treating rising RAM as an idle-process leak:

```bash
for queue in crawling embeddings ingestion system workspace-brain; do
  redis-cli -u "$REDIS_URL" HLEN "dramatiq:${queue}.DQ.msgs"
done

ps -eo pid,ppid,rss,command | grep -E 'dramatiq|start_worker' | grep -v grep
```

The deployment retains four execution threads and the original eight-message
normal prefetch window, so routine throughput is not serialized. It caps only
the delayed retry buffer at 64 messages per queue (rather than Dramatiq's
default of 1,000 per thread). It runs a lightweight `start_worker` supervisor
plus one embedded Dramatiq child, instead of the former wrapper + Dramatiq
master + worker tree.

After the 60-second warmup, confirm these log events:

- `starting_embedded_dramatiq_worker ... dramatiq_version=2.2.0`
- `embedded_dramatiq_worker_memory_baseline`

The supervisor requests a safe pause/stop/requeue recycle after either 384 MiB
RSS or two consecutive samples 64 MiB above the post-warmup baseline. It emits
`worker_memory_limit_exceeded` followed by
`embedded_dramatiq_worker_restart_completed`. If the version log is absent or
is not `2.2.0`, the deployed image is stale and must be rebuilt before memory
results are meaningful.

### Capacity and provider backpressure

For approximately 100 active users, deploy **two worker service instances**.
Each instance must use `python scripts/start_worker.py`, which runs one
Dramatiq process with four execution threads. This gives eight concurrent jobs
without the memory, Redis-connection, and provider-call multiplication caused
by eight local Dramatiq processes.

Set that command in the deployment platform's **Worker service Start Command**
(not the web/API service). Initial discovery runs HN first, then searches
Bluesky, Stack Exchange, public GitHub issues, and Lemmy. Those five free
sources share a short global query cache and write only to the global corpus.
Every fetched post is still passed through the existing embedding similarity
filter and verifier before it can appear for a tenant. Only after the complete
free phase has fewer than the configured plausible phrase-level signals may
the system use one cost-controlled, single-page X fallback per activation. A
raw unrelated HN result—or one plausible HN result—does not suppress X.
X is skipped cleanly when no bearer token is configured. Global-source hits
already present in the corpus are re-matched to the new profile, and a separate
bounded cached-corpus rematch is also queued for each activation. `REDIS_URL`
makes source-query caching, the activation X cap, and tenant spend cap atomic
across all workers.

Outbound requests are coordinated through Redis across both instances. The
defaults below are intentionally conservative and can be raised only after
checking the limits for the project's Firecrawl, X, and OpenAI accounts:

```text
ARCLI_FIRECRAWL_CRAWLS_PER_MINUTE=4
ARCLI_HN_REQUESTS_PER_MINUTE=60
ARCLI_BLUESKY_REQUESTS_PER_MINUTE=30
ARCLI_STACKEXCHANGE_REQUESTS_PER_MINUTE=15
ARCLI_GITHUB_ANONYMOUS_REQUESTS_PER_MINUTE=5
ARCLI_GITHUB_AUTH_REQUESTS_PER_MINUTE=20
ARCLI_LEMMY_REQUESTS_PER_MINUTE=15
ARCLI_X_REQUESTS_PER_MINUTE=10
ARCLI_OPENAI_CHAT_REQUESTS_PER_MINUTE=20
ARCLI_OPENAI_EMBEDDING_REQUESTS_PER_MINUTE=60
```

Discovery and spend settings are intentionally bounded by default:

```text
# One typed phrase for each of the six matching-brief query types.
ARCLI_INITIAL_PUBLIC_INGESTION_QUERY_LIMIT=6

# Suppress the paid fallback only after this many plausible signals across the
# complete free phase (HN + the four added sources). The prior HN-named env
# remains supported for compatibility if this new value is not set.
ARCLI_INITIAL_PUBLIC_FREE_MIN_PLAUSIBLE_HITS_FOR_X_SUPPRESSION=2

# Four added public sources are on by default. Set any to false to disable it.
ARCLI_BLUESKY_INGESTION_ENABLED=true
ARCLI_STACKEXCHANGE_INGESTION_ENABLED=true
ARCLI_GITHUB_INGESTION_ENABLED=true
ARCLI_LEMMY_INGESTION_ENABLED=true

# One page per phrase/source by default; do not raise casually. Redis shares
# this 15-minute query dedupe window across workers and tenants. To raise the
# global cap, also raise the relevant provider cap (for example,
# ARCLI_BLUESKY_MAX_PAGES) because provider caps remain the hard safety limit.
ARCLI_ADDITIONAL_PUBLIC_SOURCE_MAX_PAGES=1
ARCLI_ADDITIONAL_PUBLIC_SOURCE_QUERY_CACHE_TTL_SECONDS=900

# Optional credentials improve free API quotas; never expose them to clients.
ARCLI_STACKEXCHANGE_API_KEY=...
ARCLI_GITHUB_TOKEN=... # read-only public-data token; no private repo access

# Lemmy is an allowlisted public v4 instance, not a global Fediverse search.
ARCLI_LEMMY_SEARCH_URL=https://lemmy.world/api/v4/search

# Tenant X spend budget for activation fallbacks / explicit X-only mode.
ARCLI_INITIAL_PUBLIC_X_FALLBACK_TENANT_LIMIT=5
ARCLI_INITIAL_PUBLIC_X_FALLBACK_TENANT_WINDOW_SECONDS=86400

# Historical global-corpus re-match for a newly activated profile. Only rows
# with cached completed embeddings are used, so this does not re-embed them.
ARCLI_INITIAL_PUBLIC_GLOBAL_REMATCH_LIMIT=100
ARCLI_INITIAL_PUBLIC_GLOBAL_REMATCH_MAX_CANDIDATES=15

# A conservative verifier-confirmed signal below the normal review threshold
# is stored as discovery_candidate, never as qualified.
LEAD_DISCOVERY_CANDIDATE_SCORE_THRESHOLD=0.50
LEAD_VERIFIER_SCORE_THRESHOLD=0.70
```

The strict one-page setting bounds a successful X fallback to one X search
page. The added sources also default to one page per buyer phrase and have
their own Redis-coordinated request caps. Provider retries can still occur
after a timeout or retryable error, so no system can honestly guarantee that
an upstream provider received exactly one network attempt in those failure
cases.

Stack Exchange content must retain its visible source attribution and original
link in the review UI. GitHub results are public-context review signals only:
do not enrich handles into contact data or automate outreach. Reddit remains
disabled until its developer API integration is ready.

For an existing database, apply
`scripts/hn_source_posts_global_contract.sql` after `scripts/RLS_updates.sql`,
then apply `scripts/lead_match_qualification_guard.sql`. The public-source
contract uses `(source, source_post_id)` as its global identity, which matters
now that different providers can use the same external IDs.
It keeps tenant-scoped reads while allowing an authenticated user to promote
only a `ready_for_review` or `discovery_candidate` row to `qualified`; workers
must continue using their existing service/database role for pipeline writes.

The limiter delays worker work instead of increasing provider concurrency.
Pass 1 is the exception: it immediately falls back to the asynchronous deep
crawl when the shared OpenAI chat budget is full, so onboarding requests stay
responsive. Keep `REDIS_URL` configured; without it, limiting is only local to
each process.

Trace failure signatures:

- `firecrawl_crawl_timeout`: Firecrawl did not complete within the crawl phase deadline.
- `firecrawl_scrape_skipped` or `no_usable_content`: likely bot protection, protected routing, or empty rendered page.
- `crawl_markdown_payload_clipped`: payload bloat guard fired; inspect `content_chars`.
- `openai_profile_extraction_failed`: provider timeout, rate limit, or schema parsing failure.
- `crawl_job_dead_lettered`: retry cap hit; query `error_context` and dead-letter queue.

## 3. Firecrawl Target Audit

For `https://www.arcli.tech/`, check these in order:

1. Bot protection: Firecrawl returns no markdown, an interstitial, 403/429, or timeout. Confirm in `crawl_pages.markdown_preview` and Firecrawl dashboard logs.
2. Scope creep: `crawl_pages.source_url` should be homepage, pricing, features/product/platform, about/company, or use-case/solutions/customer paths only. Any legal archive, blog archive, sitemap expansion, or app route means include-path rules are wrong.
3. Payload bloat: `content_chars` should stay comfortably below `ARCLI_CRAWL_MARKDOWN_MAX_CHARS` (default `500000`). Clipping is acceptable; memory growth is not.

## 4. LLM and Schema Triage

If pages exist but no service profile:

```sql
SELECT status,
       phase,
       failure_reason,
       error_type,
       error_message,
       error_context
FROM public.crawl_jobs
WHERE website_url IN ('https://www.arcli.tech/', 'https://www.arcli.tech')
ORDER BY updated_at DESC
LIMIT 5;
```

Expected LLM failure classes:

- `APITimeoutError` or `APIConnectionError`: provider timeout or dropped connection.
- `RateLimitError`: backpressure/rate limiting; retry will run with capped exponential backoff.
- `ValidationError`: OpenAI returned a response that did not satisfy `ServiceProfileDraft`.
- `missing_parsed_profile` in logs: parser returned no structured object.

## 5. Recovery

1. Apply `scripts/crawl_pipeline_reliability.sql`.
2. Deploy the guarded worker code.
3. Restart workers so the new actor options and retry-exhaustion actor are registered.
4. Re-submit the same website URL. The deterministic `crawl_job_id` makes this retry-safe.
5. Watch:

```sql
SELECT id, status, phase, attempt_count, pages_crawled, content_chars,
       failure_reason, error_type, last_heartbeat_at, updated_at
FROM public.crawl_jobs
WHERE website_url = 'https://www.arcli.tech/'
ORDER BY updated_at DESC;
```
