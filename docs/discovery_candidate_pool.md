# Candidate-First Discovery

The discovery pipeline now preserves useful public conversations before they
become verified leads. This makes an empty verified-lead queue diagnosable:
operators can distinguish no source coverage, no buyer-language matches, a
limited embedding budget, and verifier rejection.

## What happens first

1. The website crawl prioritizes the homepage plus pricing, product, customer,
   integration, solution, and use-case pages. It records a compact quality
   report alongside the service profile.
2. Profile extraction converts that evidence into one phrase for each buyer
   intent: buyer pain, urgent failure, recommendation request, manual
   frustration, category/tool search, and switching trigger.
3. A demand-acquisition profile also receives one compact alternate wording
   per intent. The default fallback wording is:

   - `need more paying customers`
   - `free users not converting`
   - `how to get paying customers`
   - `manual prospecting takes too long`
   - `looking for lead generation tools`
   - `outbound is not working`

   The extractor can use the broader `need more customers` form when the site
   supports it. The alternate query deliberately switches between customer and
   paying-user wording when the website favors one of those terms. A bare
   persona label is still not enough.
4. Public-source searches collect query-grounded posts into
   `discovery_candidates` immediately. Each observation stores the source,
   query type, and query hash. A candidate is then advanced through
   `raw -> plausible -> review -> qualified/rejected` by semantic matching
   and the verifier.

The dashboard labels the raw/plausible/review records as **not qualified
leads**. They have no CRM or outreach action until the existing verifier-owned
lead workflow creates a reviewable lead.

## Deploy the storage contract

Apply these database contracts in order for an existing environment:

1. `scripts/RLS_updates.sql`
2. `scripts/hn_source_posts_global_contract.sql`
3. `scripts/prospect_intelligence_contract.sql`
4. `scripts/discovery_candidate_pool_contract.sql`

The last contract is additive. It gives authenticated workspace users
read-only candidate access through RLS; worker/service code retains lifecycle
writes. Public-post candidates point to the global `source_posts` row, so an
existing public-data removal or retention deletion cascades to the tenant's
candidate snapshot.

## Empty-result behavior

The first activation searches a 90-day window by default (up to 180 days),
uses six typed phrases plus one alternate phrase each for demand-acquisition
profiles, and checks Hacker News, Bluesky, Stack Exchange, public GitHub,
and Lemmy concurrently. A cost-controlled X fallback remains available only
when free-source coverage is insufficient and credentials are configured.

Source-query cache claims are released after a provider failure **or zero
hits**. This prevents a transient empty response from hiding newly indexed
posts for the cache TTL.

## Account and contact extension

`api.services.prospecting.account_candidates` is a provider-neutral intake
boundary for a separately licensed account/contact-data adapter. It is off by
default (`ARCLI_ACCOUNT_CANDIDATE_INGESTION_ENABLED=false`) and does not call
any provider on its own. An adapter must have explicit credentials and a
lawful data-use basis before passing results to the intake functions.

Account snapshots contain company context only. Contact candidates retain the
provider's internal external ID for dedupe but persist only role/company
context—never a name, email address, or phone number. A future consented
enrichment flow should resolve direct contact details at use time rather than
copying them into discovery storage.
