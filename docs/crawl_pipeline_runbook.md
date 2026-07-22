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
