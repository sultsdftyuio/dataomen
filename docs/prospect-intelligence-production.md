# Prospect-intelligence production checklist

## Deploy order

Apply the database contracts in this order, using the normal production migration process:

1. `scripts/RLS_updates.sql`
2. `scripts/hn_source_posts_global_contract.sql`
3. `scripts/lead_match_qualification_guard.sql`
4. `scripts/prospect_intelligence_contract.sql`
5. `scripts/buyer_language_research_contract.sql`

The final migration is additive and keeps buyer-language research separate from
`lead_matches`. Do not enable its worker until it has completed successfully.

## Required worker configuration

- `DATABASE_URL` (or `SUPABASE_DB_URL` / `POSTGRES_URL`): worker storage and
  tenant-scope checks.
- `REDIS_URL`: Dramatiq, source-query cache, and tenant quotas.
- `INTERNAL_WORKER_SECRET`: trusted handoffs from the Next.js server to the
  Python API.
- `OPENAI_API_KEY`: website profile extraction, embeddings, and the lead
  verifier. Buyer-language research does not call OpenAI.

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
plausible free-source coverage (default: two query types).

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
