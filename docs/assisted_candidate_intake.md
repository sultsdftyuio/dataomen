# Assisted account candidate intake

The customer's website helps draft their targeting brief. The customer approves that brief. Candidate accounts come from a separate, rights-approved account source; merely importing one never creates a customer-facing prospect or a buyer-intent claim.

## Source boundary

The first intake accepts a customer-owned target list, an approved directory export, an approved licensed provider export, or operator research with reviewable listing links. It does not fetch or scrape a platform. A staff migration session must register the tenant/source in `assisted_source_approvals` with its kind, external approval reference, maximum retention days, and expiry. The service-role importer has read access to that registry but cannot grant itself source approval. Public discussion posts stay in the existing governed discovery path; this private account intake does not copy their text or claim a poster represents a company.

One tenant-domain identity merges `www`, path, query string, URL case and HTTP/HTTPS variations. Different subdomains, domains, brands and subsidiaries still need human alias review. The import keeps distinct source listing links as separate observations of the same account. It stores no contact name, email, phone, raw source body, or inferred interest.

## Operator sequence

1. Apply `assisted_prospect_delivery_contract.sql`, then `assisted_candidate_intake_contract.sql` in staging. Test tenant isolation, suppressions inserted before and after candidates, repeat import, brief edit, concurrent duplicate attempts, delivery of a queued candidate, rejection status, source revocation, and expired observation purge before enabling the pilot. Before enrolling a paying pilot, use local dry runs and manual sampling to assess source coverage; dry runs require no service key or pilot enrollment.
2. Import the customer's existing customers, active opportunities, do-not-contact and excluded account domains first. Prepare an exclusions JSON file using the shape below. Run `pnpm exec tsx scripts/import_assisted_suppressions.ts exclusions.json`, inspect the unique-domain count, then add `--commit` in a trusted operator environment.
3. Register each source approval after a real rights review. An example staff migration is `INSERT INTO public.assisted_source_approvals (tenant_id, source_key, source_kind, approval_ref, max_retention_days, valid_until) VALUES ('<tenant>', 'directory_software_01', 'approved_directory', '<approval record>', 29, '<approved expiry>');`. Use actual reviewed values, not these placeholders. Keep the source key stable across batches. Set `approval_status='revoked'` when permission ends; the queue hides its observations and the purge removes them.
4. Prepare a candidate batch of at most 200 rows from one approved source. Run `pnpm exec tsx scripts/import_assisted_candidates.ts batch.json` to validate and count distinct domains locally. Add `--commit` to import. The script verifies the current approved brief, active pilot, source approval and retention limit, skips suppressed or recently delivered accounts, reuses one account identity, and upserts source observations. Imports are resumable; a failed commit may have written earlier rows, so correct the problem and rerun the same file.
   For a larger approved export, use `pnpm exec tsx scripts/import_assisted_export.ts manifest.json companies.csv` and then `--commit`. The export adapter accepts at most 5,000 rows or 5 MiB and splits them into 200-row intake batches. It validates the whole file before any writes, merges repeated domain/listing pairs, and reports both raw rows and unique domains. Earlier batches may be saved when a later batch fails; rerun the same export after correction.
5. Run `pnpm exec tsx scripts/list_assisted_candidates.ts TENANT_ID PROFILE_UUID REVISION [LIMIT] [OFFSET] [STATUS]` to review the private queue. `STATUS` defaults to `active`; use `rejected` to audit missed positives. Inspect source rights, fit, exclusions, likely buyer and action route. When a candidate fails, include its `candidateId` in `record_assisted_rejection.ts`; the queue marks terminal reasons rejected and research gaps as researching. When a reviewed candidate passes, `deliver_assisted_prospect.ts` uses the same domain identity and marks it delivered. Neither action is automatic. A previously rejected candidate requires a documented operator decision to reset its status to `researching` before delivery.
6. Run `pnpm exec tsx scripts/report_assisted_source_yield.ts TENANT_ID PROFILE_UUID REVISION FROM_UTC TO_UTC` for each weekly intake cohort. It shows candidate, review, delivery, and customer acceptance counts by source key, with overlap called out. Source rows are not additive when the same account appears in multiple sources. Save the report before source observations reach their retention deadline; purged observations cannot be attributed later. Use it alongside the pilot cost report to decide whether a source deserves recurring automation.
7. Run `pnpm exec tsx scripts/purge_assisted_observations.ts --commit` on a daily operator schedule and repeat while `moreMayRemain` is true. The queue omits expired or revoked observations immediately, even before purge. Account cards stop appearing when no approved, unexpired candidate source remains or a new suppression applies; new cards cannot outlive their supporting approval and retention window. Withdraw affected deliveries for the audit record when rights end or the source is removed. The weekly pilot report includes new candidate domains, observation sources, rejections, deliveries, customer verdicts, and fulfillment cost.

## Exclusions file

```json
{
  "tenantId": "workspace-tenant-id",
  "sourceKey": "customer_exclusions_20261001",
  "accounts": [
    { "websiteUrl": "https://customer.example/", "reasonCode": "existing_customer" },
    { "websiteUrl": "https://blocked.example/", "reasonCode": "do_not_contact" }
  ]
}
```

Allowed reasons: `existing_customer`, `active_opportunity`, `do_not_contact`, `competitor`, `already_contacted`, `customer_excluded`. This file is a placeholder. Keep real customer lists only in approved operator storage. Do not put them in the repository or general logs.

## Candidate batch file

```json
{
  "tenantId": "workspace-tenant-id",
  "targetingProfileId": "00000000-0000-4000-8000-000000000001",
  "targetingProfileVersion": 1,
  "source": {
    "kind": "approved_directory",
    "key": "directory_software_01",
    "rightsApprovalRef": "Approval recorded in the source governance register.",
    "observedAt": "2026-10-01T08:00:00.000Z",
    "retentionDays": 29
  },
  "accounts": [
    {
      "websiteUrl": "https://example.com/",
      "companyName": "Example Software",
      "sourceUrl": "https://directory.example/listing/example"
    }
  ]
}
```

The example URLs are placeholders and must never be published as prospects. `retentionDays` is at most 89 and must be no longer than the source's registered approved limit. Directory and manual-research rows require a listing URL; customer-owned and licensed-provider rows may use `null` when their source record has no lawful public URL. The `rightsApprovalRef` must exactly match the staff-registered approval record. That record is an audit pointer; the underlying review must actually cover this use.

## Approved export format

The manifest is the candidate batch file without `accounts`. The CSV must have exactly these three columns, in this order:

```csv
website_url,company_name,source_url
https://example.com/,Example Software,https://directory.example/listing/example
```

Extra columns are rejected so names, emails, phone numbers, and other provider contact fields cannot enter this queue. Use an export with company website URLs; the adapter cannot turn a company name alone into a verified domain. A licensed or customer-owned source may leave `source_url` empty only when its approved source record has no lawful public listing URL. Keep real export files in approved operator storage, not in the repository. The adapter consumes a rights-approved export; it does not fetch from or confer permission to use a provider.

## Measurement and limits

Track raw rows, unique domains, suppressed, recently delivered, already delivered in this brief revision, new candidates, existing candidates and distinct source observations at import. The weekly report separates candidate intake from delivered and accepted prospects. A fresh batch of 100 domains is **100 research candidates**, not 100 leads. Review yield and source exhaustion before adding another provider.

The current database intake makes several service-role calls per unique domain and processes at most 200 rows per batch. The export adapter can feed several batches, but it remains an operator-run path suitable for an assisted cohort, not a large automated source feed. The weekly cost report does not include a source subscription or batch fee unless the operator allocates it into reviewed-card and rejection `sourceCostUsd`; record that allocation to avoid understated cost or double counting. Live provider adapters, pagination, alias resolution, rate budgets, deletion feeds and a durable worker queue belong in the later account-supply phase after real yield and rights are measured.

On a dedicated staging database, run `scripts/verify_assisted_candidate_contract.sql` after both assisted migrations. It creates fixture tenants and rolls all writes back while checking duplicate, tenant, approval, retention, delivery, rejection, suppression, and revocation gates. This is a database integration check; local TypeScript tests and CSV dry runs do not substitute for it.

Applying the candidate contract hides any older account deliveries that have no imported `candidateId`; review and republish them through the new queue where possible. Historical delivery counts in the staff report are still counts of delivery events, not a count of cards currently visible to customers.
