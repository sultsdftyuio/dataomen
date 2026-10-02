# Arcli roadmap: 15 outreach-worthy prospects per week

**Status:** approved by the founder on 1 October 2026; implementation in progress. The first milestone is tracked in [the baseline](prospect_baseline_2026-10-01.md), [pilot review rubric](prospect_pilot_rubric.md), and [assisted pilot intake](prospect_pilot_intake.md).  
**Prepared:** 1 October 2026.  
**Planning basis:** repository inspection and the [lead discovery audit](lead-discovery-audit-2026-09-29.md). Live production yield, provider contracts, customer acceptance, and unit costs still need measurement.

**1 October implementation checkpoint:** the initial review rubric and read-only baseline procedure are written. HN and the four additional public-source adapters now report primary early-rejection reasons and governance exclusions through existing tenant-scoped run telemetry. A bounded official HN Show probe found a nontrivial raw launch pool; fit and commercial-use rights remain unverified. A feature-gated, separately enrolled assisted delivery path is implemented in code, with reviewer intake, tiered evidence cards and explicit customer verdicts. The SQL contract and app have not been deployed; no delivery or pricing claim has been validated with live customers.

**2 October source checkpoint:** [live account-source checks](account_source_evaluation_2026-10-02.md) found a broad CC0 Wikidata software-company pool, but its sample included historical companies and many out-of-segment game studios. The current HN Show sample also contains many hobby/consumer projects. A bounded Wikidata research adapter is coded for reviewer intake; neither source has passed the first-segment supply gate. No phase exit gate is complete, and Arcli cannot yet claim 15 outreach-worthy prospects per week.

## 1. The decision we are making

Build Arcli around a narrow, repeatable **prospect recommendation** workflow. The target is **15 distinct outreach-worthy prospects per active paid workspace per week**, typically about three on each business day. This is a product hypothesis and launch gate, not a current result or a volume guarantee. A prospect may be useful without a fresh event. Every recommendation needs verifiable fit, a specific reason to approach that account or person, and a usable, lawful contact or public reply route.

The product must distinguish:

| Tier | What the evidence establishes | Customer-facing wording |
| --- | --- | --- |
| Direct buyer intent | A linked, attributable request, evaluation, or problem statement relevant to the offer | **Buyer-intent signal** |
| Timely opportunity | A dated, linked company or market event that creates a credible outreach angle but does not prove buying intent | **Timely prospect** |
| High-fit prospect | Current, cited company/product facts match the customer's targeting brief; no recent event is required | **High-fit prospect**; explicitly state that no recent buying signal was observed |

All three can count toward the 15 if a human reviewer would reasonably contact them. Only the first can be sold as a buyer-intent lead. The customer-facing promise should become **“evidence-backed prospect discovery, with buyer-intent signals when available.”** We should not describe 15 high-fit accounts as 15 buyer-intent leads.

### The outreach-worthy acceptance contract

An item counts only when all of these are true:

1. **Fit:** the entity is inside the approved customer segment, geography, size/stage and exclusions; the likely buyer role or public discussion participant is relevant. Fit must cite the source facts, not an AI guess.
2. **Identity and novelty:** one real account, builder, or project with a stable canonical URL; no duplicate entity, prior delivered recommendation, customer-owned account, or already-contacted record within the agreed cooldown.
3. **Evidence:** at least one working source link and a factual, source-grounded “why this prospect.” Record when it was observed or checked. A current company page can establish fit; its check date must not be presented as a recent company event.
4. **Action route:** a public reply route, company contact page, customer CRM route, or permitted provider-resolved business contact. A company homepage alone is insufficient if it offers no plausible next step.
5. **Angle and uncertainty:** one specific, defensible reason to approach, plus what remains unknown. No inferred budget, purchase authority, personal intent, or fabricated urgency.
6. **Review:** an operator or calibrated quality gate confirms the above before delivery. A model score, database row, or queued job cannot count by itself.

“Why now” is optional. If present, it must link to a dated source. If absent, the card should say **“No recent buying signal observed”** and rely on the fit-based angle. A generic account list without useful context and a route does not count.

## 2. Why this needs substantial change

### Confirmed in this checkout

- The current paid path starts with a website crawl and service-profile embedding, searches bounded public conversations, applies early buyer-language admission, embeds and verifies a limited subset, then shows only particular match states in the dashboard. The configured first pass has six queries, two variants per type, 15 posts per query, one additional-source page, and 60 fresh embeddings per run. Paid monthly work is also capped. See [the existing audit](lead-discovery-audit-2026-09-29.md) and `.do/app.yaml`.
- Early filters discard many source hits before they can become stored candidates. The existing “Relevant opportunities” lane requires verified public-post matches. Broadening only a score or search term cannot create enough appropriate accounts in segments with few public buyer conversations.
- There is an entity-first path for targeting briefs and manual targets, but automated official-site generation is bounded and gated. The licensed account-provider boundary has no active provider client. Retained-evidence monitoring is narrow and opt-in. See [entity-first prospecting](entity_first_prospecting.md) and [candidate pool](discovery_candidate_pool.md).
- Crawl completion can precede discovery completion; verifier skips and dashboard filters can hide otherwise useful work. Current dashboard queues, target desk, and feedback are separate experiences. The current $35/month Pro presentation cannot be assumed to fund 60 manually reviewed, possibly provider-backed recommendations per month.

### Still unverified

- Actual production funnel counts, worker configuration, source coverage and outages, contactability, prospect acceptance, or cost per accepted item. The checked-in deployment manifest contains desired settings and placeholders, not proof of live deployment.
- The best first customer segment, provider rights for commercial use, willingness to pay, and whether 15 per week is sustainable for any segment. No general promise should be made until a live cohort proves it.

### Change classification

| Class | Decision | Why |
| --- | --- | --- |
| **Quick fixes** | Expose the complete scan state and failure reason; repair skipped verifier retries and hidden dashboard results; correct unsupported copy | Prevent silent zeroes and restore trust, but do not solve source scarcity |
| **Incremental improvements** | Broaden and measure public retrieval, sample rejected hits, add better query families and source-specific budgets | Recover relevant conversations now missed, with measured precision and cost |
| **Architectural changes** | Create a durable account/evidence/recommendation pipeline with independent daily scheduling, revision-aware matching, review and delivery | Public-post `lead_matches` and limited manual targets cannot reliably carry the wider product contract |
| **Product-direction changes** | Narrow the initial buyer segment; sell a service-assisted prospect feed; make “why now” optional and label intent honestly | A useful daily prospect queue has a larger addressable supply than verified intent posts, while retaining customer trust |

**Why small fixes are insufficient:** the supply of explicit public buyer statements is sparse for many B2B niches. Wider retrieval may help, but the 15 target requires a second supply path: account discovery grounded in firmographic/product evidence and a contact route. **Upside:** more consistent useful recommendations and better retention. **Risks:** higher provider/review cost, compliance obligations, weaker signals if labels drift, and an expanded review burden. **Migration:** keep the current intent pipeline as one evidence source, add recommendation storage and a new queue behind flags, then move paid users after verified parity. **Smallest proof:** a manually reviewed feed for one narrow segment. **Success:** the pilot gates in section 3.

## 3. Metrics and decision rules

Use a rolling **Monday–Sunday week in the workspace's chosen time zone**; report both the weekly total and business-day distribution. “Active paid workspace” means a paid pilot or subscription with a current approved targeting brief and sufficient market coverage, excluding workspaces paused at the customer's request. Publish the eligibility rule before offering a volume commitment.

| Metric | Definition / initial decision rule |
| --- | --- |
| Qualified recommendations delivered | Distinct, evidence-valid items delivered to the workspace in the week after review; denominator is eligible active paid workspaces. **Goal: 15/week** in the selected segment. Record shortfalls, never backfill with duplicates or low-fit accounts. |
| Customer acceptance | Customer marks “worth contacting” after reading the card, or actually contacts it. Target **at least 12 of every 15 delivered** in the pilot; unrated items remain unrated and do not count as accepted. Distinguish explicit judgments from saves and clicks. |
| Action rate | Number contacted or added to a real prospecting workflow within 14 days. Target **at least 5 of 15**, subject to the customer's actual outbound capacity; learn the customer's reason when it is lower. |
| Four-week reliability | **Pilot continuation:** at least 15 qualifying deliveries in 3 of 4 consecutive weeks per eligible workspace, with the shortfall explained and corrected. **Public 15/week claim:** 4 of 4 consecutive weeks per eligible workspace in the launch cohort. Do not average a strong customer against a zero-yield customer. |
| Tier mix | Count direct intent, timely, and high-fit separately. Never quietly convert all output into “buyer intent.” No forced tier quota: measure what the selected segment actually supplies. |
| Funnel and economics | Raw records → usable entities → fit candidates → contactable candidates → review-approved → delivered → accepted → contacted → meetings. Track unique yield and cost per accepted/contacted prospect by source and workspace. Pilot contribution margin must be positive under the proposed price **after** provider, compute, review, and support costs; set the actual price from measured economics. |
| Safety and quality | Zero fabricated citations, fake trigger dates, unauthorized-source use, cross-tenant exposures, or unwanted outreach. Sample every tier and every source; separately track broken links, stale facts, duplicates, wrong buyer, and contact-route failures. |

These thresholds are proposed gates, not claims that Arcli meets them. A week of 15 internally approved cards is not enough if customers reject most of them. If the selected segment cannot achieve the gates after source and rubric changes, change the segment or offer; do not weaken the counting rule.

## 4. Execution sequence

Each phase below includes build work and its exit gate. Phases can overlap where dependencies permit, but customer-facing claims follow evidence. Estimates are **order-of-work bands**, not promised dates; provider approval and pilot learning may dominate engineering time.

### What can be offered tomorrow

Arcli can invite a small number of **qualified founding pilot** applicants tomorrow, using a manual coverage check and an honest description of an assisted prospect feed. Before taking payment for a new 15/week offer, define the pilot scope, fulfillment capacity, review owner, delivery format, price or refundable commitment, and shortfall terms. The first fulfillment can be researched and reviewed manually while the product pipeline is built. A public self-serve claim of 15 weekly recommendations or 15 buyer-intent leads is **not** supported by the current evidence.

### Phase 0 — Baseline, segment choice and product contract (must do first; about 3–5 working days)

- [ ] Choose **one** initial customer segment and offer type. Define buyer roles, company size/stage, geography, supported languages, exclusions, minimum prospect universe and plausible source routes. Prefer a segment with a reachable account universe and enough new or previously unexplored accounts to sustain four weeks. Reject segments where Arcli cannot name a credible source path.
- [ ] Start the comparison with founder-led B2B SaaS sellers targeting software companies, where Arcli's existing HN/GitHub coverage may be useful, and one account-rich alternative segment that has a permitted provider or public-directory path. Treat this as a test shortlist, not a proven wedge; select by observed accepted yield and willingness to pay.
- [ ] Interview 5–10 potential buyers or existing users. Collect their current prospect list, last 10 contacts, what made each worth contacting, their weekly outreach capacity, outcome and current spend. Get at least three pilot volunteers with permission to use anonymized judgments.
- [ ] Write and freeze a one-page prospect rubric with examples of pass/fail for each tier, contact route, fit citation, freshness, prior-contact exclusion and reviewer disagreement. Define what counts as a customer acceptance and a delivered item.
- [ ] Measure the current production funnel for real paid workspaces: onboarding completion, profiles, source requests/hits, admission rejects and reasons, embedding/verifier state, persistent matches, RLS/dashboard visibility, delivered cards, customer actions, queue age, failures and total spend. Confirm deployed flags, DB contracts, credentials, worker health and source egress. Use tenant-safe counts, not raw private content in logs.
- [ ] Reconcile the user's reported usual zero and occasional three with production data. Identify missing candidates versus missing scans versus hidden/rejected results. Record baseline per week and per segment; do not infer yield from one synthetic test.
- [ ] Inventory each source/provider: coverage, query access, rate and monetary limits, licensing/commercial display rights, retention/deletion, personal data, provider availability and fallback. Obtain permitted access **before** building against a new commercial source. Select a primary and fallback source pair for the initial segment.
- [ ] Model 15/week supply. As an illustration, at a 20% review pass rate one workspace needs roughly 75 distinct candidates/week before review; replace this assumption with observed source-specific rates and account overlap. Forecast week 4 and month 3, not only an initial backfill spike.

**Exit:** named segment, signed-off rubric, source-rights inventory, measured baseline, pilot participants, and an explicit cost/volume hypothesis. If the chosen segment has no plausible recurring supply or action route, pick another before implementing the full engine.

### Phase 1 — Assisted founding pilot and truthful offer (validate manually first; about 1–2 weeks)

**Implementation status (1 October):** the gated in-app delivery and verdict flow, service-only reviewer/rejection intake, expiring cohort access, private account candidate batch intake, suppression list, source observations, and weekly cost/yield report are coded. They need a staging database migration and cross-tenant/RLS test before use. Cohort recruitment, source-rights approvals, four weeks of real prospect reviews, customer acceptance, and pilot pricing remain open. Public-discussion evidence is excluded from the new pilot cards until deletion/retention is integrated; the existing conversation product remains separate.

- [ ] Offer a **limited, paid or paid-intent founding pilot** to 3–5 qualified workspaces, with a written scope and clear statement that weekly volume is being validated. Price/commitment should be separate from the existing $35 automated Pro presentation; do not promise 15 to unqualified signups.
- [ ] Collect an explicit brief: product and offer, ideal accounts, buyer roles, firmographic/technology criteria, exclusions, territories, good/bad examples, existing customers, do-not-contact accounts, and preferred outreach routes. Website is an optional extraction aid. Human approves the brief before prospecting.
- [ ] Research from permitted sources with a repeatable operator worksheet or simple internal intake: canonical entity URL, source URL, fact and check date, optional event URL/date, tier, fit reason, angle, route, exclusions checked, reviewer ID/decision and estimated time/cost. No raw data hoarding beyond source rights and retention policy.
- [ ] Review every proposed item using the rubric; double-review an initial sample and resolve disagreement before delivery. Deliver in the agreed customer channel or a limited in-app queue, and collect explicit “worth contacting / why not,” actual contact and meeting outcomes. Record rejected candidates and reason codes to train later automation.
- [ ] Run a **four-week** cohort where possible. Record hours, provider charges, duplicate rates, source exhaustion, weekly volume and customer actions. For an earlier build decision, use week 1 to identify the strongest source and bottleneck, while keeping the volume claim gated on repeated weeks.
- [ ] Update landing, pricing, checkout, onboarding, help text and sales scripts so the current self-serve tier cannot be mistaken for a guaranteed 15/week product. A near-term public intake can invite qualified pilot applications; access to a scalable paid plan follows the launch gate.

**Exit:** at least one clearly useful narrow workflow and direct customer evidence about acceptance and price. If customers do not act on high-fit cards even after the reviewer improves them, revisit the offer and segment before increasing automation.

### Phase 2 — Repair the existing conversation path (quick fixes and incremental improvements; about 1–2 weeks)

- [ ] Trace one paid user action through Next.js, FastAPI, durable job, source requests, embeddings, verifier, persistence and signed-in dashboard. Make every handoff's accepted, running, completed, partial, failed and retryable state explicit. A completed crawl is not a completed prospect run.
- [ ] Add a durable per-candidate verifier work item with idempotent keys, lease, bounded retry/backoff, terminal reason and recovery sweep. Surface API/model/rate-limit failures and dead-letter work; do not mark a run complete while useful candidates remain unprocessed.
- [ ] Replace fail-open zero-looking reads with an error state. Remove accidental hiding after profile edits through revision-aware reads; paginate the queue instead of relying on the first 20 records. Preserve historical actions when the brief changes.
- [ ] Instrument reason-coded counts **before and after** early admission and context guards. Sample real rejected records under governance controls; label missed positives. Broaden admission only when recall gain, review load and false-positive rate are measured. Keep the strict evidence gate at delivery.
- [ ] Test more query families, alternate terms, source planning and bounded pagination per segment. Separate broad retrieval from final qualification. Use source-specific quotas, caching of provider results only when tenant-specific matching still runs, and dedupe before paid model calls.
- [ ] Treat public discussions as one signal source for account recommendations. Preserve original permalink, exact excerpt, author/account attribution only when evidenced, source date and removal handling. A discussion author is not automatically a buyer or company decision maker.

**Exit:** production-style trace shows an honest terminal outcome; retries recover transient faults; visible counts reconcile the funnel; labeled recall improves without a damaging precision/cost drop. These repairs alone are not the 15/week product.

### Phase 3 — Account supply and evidence engine (architectural change; about 2–4 weeks after source approval)

- [ ] Choose approved account-universe inputs for the first segment: customer-supplied target/CRM list, licensed company data where rights permit, official company/product sites, and segment-specific public directories/APIs. A public job post or procurement notice may create a timely angle for suitable offers, but is not proof of purchase intent. Measure incremental unique usable accounts from each source before adding it to recurring jobs.
- [ ] Build provider adapters as isolated modules with contract tests, source-specific pagination/cursors, rate/budget guards, timestamps, canonical URLs, provider IDs, retries, deletion rules and a kill switch. Avoid undocumented scraping of LinkedIn, Reddit, X or other platforms; access and commercial rights must be verified for each source.
- [ ] Normalize account identity: domain/canonical URL, company name and aliases, legal/brand relation, project/builder distinctions, redirects and merges. Keep source observations separate from canonical entity records. Deduplicate across sources, workspaces and past deliveries without leaking tenant data.
- [ ] Extract only grounded firmographic/product facts from source pages or licensed fields. Deterministic checks should handle exact exclusions and required fields. AI may summarize and classify evidence; it may not invent buyer identity, interest, event date, role or contact.
- [ ] Match entities to the **approved targeting brief revision**. Rank on hard-fit criteria, offer relevance, source reliability, contactability, novelty and optional signal strength. Tune by labeled customer outcome. Do not use a single opaque similarity score as proof of “outreach-worthy.”
- [ ] Obtain a plausible action route. Prefer a relevant public discussion reply route, published company contact/sales route, customer-owned CRM contact, or a separately licensed on-demand business contact lookup. Verify route availability and source rights. Do not persist names/emails/phones by default merely to increase count; define purpose, retention and removal if contact details are introduced.
- [ ] Generate a short card with cited “why this prospect,” optional linked and dated “why now,” a source-grounded angle, suggested buyer role or public reply route, and “what we do not know.” Run deterministic citation/link/freshness checks and a reviewer sample before delivery.
- [ ] Schedule independent daily sourcing and refresh, without needing a new website crawl. Allocate work fairly across paid tenants and avoid both source starvation and one tenant consuming the budget. Support weekly target pacing, but never fill a quota with weak records.

**Exit:** one segment produces a sustainable, measured pool of novel, contactable fit candidates for four weeks; the reviewed queue meets the rubric and source rights. A broad account directory that merely looks full fails this gate.

### Phase 4 — Durable recommendation data and migration (architectural change; parallel with Phase 3)

- [ ] Design separate records for **entity**, **source observation/evidence**, **tenant-and-brief-specific assessment**, **recommendation delivery**, **review decision**, **customer action**, and **run ledger**. Reuse the existing `prospect_entities`, `source_posts`, `discovery_candidates` and `lead_matches` where their semantics fit; add a dedicated recommendation contract where the new workflow would otherwise mislabel high-fit accounts as verified public-post matches.
- [ ] Persist tenant ID, targeting-brief revision, canonical entity ID, source/provider provenance, evidence URL and exact grounded fact, source observed/event/check timestamps, tier, contact-route type, score components, reviewer decision, delivery time, dismissal/contact state, provider deletion and retention state. Use stable uniqueness keys and revision history. Keep evidence and PII minimization compatible with the existing 30-day public-post retention and removal procedure.
- [ ] Write additive, idempotent SQL contracts in the documented dependency order; least-privilege RLS and narrow server-only writes; tenant-safe read projections; source deletion cascading or redacting affected recommendations; audited operator permissions. Update `docs/database-contracts.md` and runbooks with upgrade and rollback procedure.
- [ ] Use durable queue states, leases, retry limits, idempotency and reconciliation from source fetch through visible delivery. A scheduled job should not be counted as a delivered item. Provide dead-letter inspection and replay without duplicate cards or repeated provider charges.
- [ ] Migrate with feature flags: schema first; shadow-run new sourcing and matching; backfill only eligible retained data; compare old/new visibility and counts; canary a pilot tenant; enable new queue read; retire old paid dashboard surface only after outcomes are preserved. Carry forward explicit customer feedback and historical qualified signals; do not silently reclassify older high-fit targets as intent.
- [ ] Keep old data accessible or exportable during the transition. Provide a rollback to the previous read path and stop new job dispatch without losing reviewed recommendations or customer actions.

**Exit:** RLS, idempotency, retention, retry/recovery and migration tests pass in a production-like stack. The same entity can yield separate, properly scoped recommendations for two tenants without data exposure or duplicate deliveries within a tenant.

### Phase 5 — New customer workflow and dashboard (product and design change; about 2–3 weeks)

- [ ] Replace the crowded paid home experience with a clear **Today** queue and a weekly progress view. Show actual delivered/accepted counts, each tier separately, reason for partial or zero output, last source check and next expected run. Avoid the impression that 15 has been reached when 15 raw candidates merely exist.
- [ ] Make brief onboarding explicit and editable: offer, ICP, exclusions, buyer roles, geography, good/bad examples, existing customers/CRM imports and source preferences. Website analysis can prefill suggestions; customer approval defines the active targeting revision. Show a coverage assessment before payment when possible.
- [ ] Card detail: entity and canonical site, evidence links with dates and verified facts, fit rationale, optional recent signal, buyer role, usable contact/reply route, uncertainty, source reliability, previous delivery/contact status and a reasoned outreach angle. Link to the source; do not show a fabricated first-person quote or auto-generated claim as fact.
- [ ] One compact action flow: **Worth contacting**, **Save**, **Contacted**, **Meeting**, **Wrong fit**, **Already known**, **No route**, **Bad evidence**. Support one-click correction of ICP/exclusions, undo, search/filter by tier and state, deduped export/CRM handoff with delivery status, and team assignment only if pilot users need it.
- [ ] Provide transparent empty and partial states: no source coverage, pending review, source failure, exhausted segment, insufficient contact route, paused subscription or customer brief change. Explain what the customer can do and what Arcli is doing.
- [ ] Offer optional daily/weekly digest with correct tier labels, verified counts, opt-in preference and unsubscribe. Make queue readable on mobile, accessible by keyboard, and fast with pagination. Reuse existing components where clean; split oversized dashboard code into focused feature modules as it is touched.
- [ ] Align landing page, pricing, checkout, in-app language, help material and any emails with the same promise and tier definitions. Remove volume and intent claims that the pilot has not proven.

**Exit:** five representative users can approve a brief, inspect a prospect's evidence, understand uncertainty, act or reject, and see that action persist; zero and failure states are understandable without support. Cross-surface copy uses the same tier rules.

### Phase 6 — Economics, packaging and customer operations (must precede broad sale)

- [ ] Calculate recurring cost per workspace and per accepted/contacted prospect: provider fees, search/API quotas, AI tokens, page fetching, storage, review minutes, support and failed-job waste. Forecast at 5, 50 and 500 customers with source rate limits and provider contract tiers.
- [ ] Interview pilot customers about value relative to their current prospecting workflow; test an actual paid renewal or conversion. Define whether the commercial unit is workspace, defined market/ICP, seat, accepted recommendation, or a hybrid. Set a price and fair-use scope that cover costs with margin; do not assume the current $35/month tier funds the new service.
- [ ] Decide the offer boundary: self-serve lower-volume research versus qualified, assisted prospect feed; any minimum-volume remedy, credit or cancellation terms; supported segments and geographies; what happens when a customer exhausts its viable market. Put those terms in checkout and sales copy before charging.
- [ ] Define pilot qualification and support operations: source coverage precheck, onboarding review, weekly quality audit, dispute handling, removals, provider outage communication, refund/credit escalation and customer success check-in. Record who owns each action and response time.
- [ ] Verify legal/privacy basis and provider contracts for every source, contact route, display, retention and export; preserve public-data deletion/suppression. Review outreach law by launch market and avoid sending outreach on the customer's behalf in the first version.

**Exit:** customers demonstrate recurring willingness to pay, unit margin is viable at the chosen package, and marketing/checkout describe exactly what the system delivers.

### Phase 7 — Production hardening and staged launch (after pilot proof)

- [ ] Build production-like integration tests for user signup → approved brief → scheduled source fetch → candidate normalization → match → evidence verification → review → recommendation row → paid signed-in dashboard → customer action → digest/export. Assert every durable boundary, not just HTTP success.
- [ ] Test weak and hostile cases: zero provider results, 429/5xx/timeouts, stale/deleted pages, invalid citations, false trigger dates, duplicate domains/aliases, already-contacted imports, changed brief during a run, worker crash after write, retry after partial charge, reviewer disagreement, exhausted quotas, malformed URLs/redirects/SSRF, source takedown, missing contact route and model refusal. Test separate paid tenants and Free entitlement under RLS.
- [ ] Use a labeled set of real, rights-compatible prospects from the pilot, with blind human review by tier and segment. Track precision, recall on sampled rejected candidates, source yield, duplicate rate, action rate and cost. Synthetic fixtures verify wiring only.
- [ ] Add metrics/alerts for daily eligible paid workspaces, source success, unique candidate yield, queue age, retry/dead-letter counts, evidence errors, reviewer backlog, delivered/accepted/contacted counts, per-source spend, cross-tenant authorization failures and zero-output workspaces. Create operator runbooks and an incident owner.
- [ ] Verify DB contracts and environment configuration in staging, worker queues and scheduler liveness, provider credentials, rate budgets, model access, email sender, unsubscribe, security and retention tasks. Run load/cost tests for a plausible cohort and resource-capacity plan.
- [ ] Deploy behind flags to internal tenants, then the pilot cohort, then one supported segment at a time. Compare shadow and visible counts, monitor at least one full weekly cycle per canary, and retain a tested pause/rollback switch. Do not turn on unsupported segments through a global flag.

**Launch gate:** the selected segment meets the four-week volume/acceptance/action/economics gates in section 3, the system survives failure and tenant-isolation tests, provider use is authorized, and customer copy matches the observed tier mix. Otherwise remain an assisted, capacity-limited pilot and state the actual output plainly.

## 5. Build order and dependencies

1. **Founding decision:** choose one segment and approve the rubric. Measure the current funnel and conduct source/rights and cost research.
2. **Prove human value:** assisted pilot, explicit customer judgments, contact-route quality and recurring supply. Correct public claims immediately if they imply an unproven guarantee.
3. **Stabilize existing discovery:** durable completion/retry and visible failure states; broaden public retrieval from measured false negatives.
4. **Build the account path:** approved universe sources → normalized entities → grounded fit → contact route → tiered recommendation, with independent daily scheduling.
5. **Add durable contracts and new UI:** schema/RLS/retention and migration before customer-facing queue; canary behind flags and preserve prior feedback.
6. **Commercialize only after proof:** packaging, price, support capacity, source contracts, then gradual self-serve launch for supported segments.

For code organization, place new responsibilities in focused feature folders under `api/services/prospecting/` and `app/(dashboard)/dashboard/` with clear public boundaries. Avoid adding unrelated logic to large `crawling.py`, `actors.py`, `public_matching.py`, `data.ts` or `prospect-dashboard-client.tsx`; extract adjacent responsibilities when touched and keep source files within the repository's 1,000-line rule. The exact module and table names should be finalized after the Phase 0 data-contract review.

## 6. Explicit build priority

| Priority | Work |
| --- | --- |
| **Must build now, after approval** | Baseline instrumentation and user evidence; chosen ICP and rubric; honest copy; pilot intake/review workflow; end-to-end reliability fixes; source-rights check; basic recommendation evidence contract and customer action capture |
| **Validate manually first** | Which vertical can sustain 15/week, account-source combination, contact-route usefulness, high-fit acceptance, willingness to pay, daily delivery cadence and review economics |
| **Build later** | More provider integrations after measured incremental yield; richer CRM sync, team assignment, automatic source tuning, calibrated reviewer automation, more segments and languages |
| **Do not build** | A universal 15 buyer-intent-leads guarantee; generic contact scraping; automatic outreach; invented “why now”; a volume counter that includes research-only records; a broad paid-data integration without rights and unit economics |

## 7. Working decisions and evidence gates

The approved implementation starts with **founder-led B2B SaaS teams selling to software companies** as a working segment. This fits Arcli's existing founder/developer source coverage and can be tested without customer data access. The segment is a hypothesis; source fit, contactability, customer acceptance and recurring volume decide whether it remains the wedge.

Start with an assisted founding pilot and human review before a self-serve 15/week claim. Keep its economics separate from the $35 plan. Use public business routes first; do not assume CRM imports or personal contact data are available. Source contracts, geographic expansion and commercial pricing require concrete rights, cost and customer evidence before activation. Production read-only data improves validation but does not block the build.

## Source access notes for Phase 0

Potential source interfaces to evaluate for a selected segment include the [Greenhouse public job-board API](https://docs.greenhouse.io/job-board.html), [SAM.gov opportunities API](https://open.gsa.gov/api/get-opportunities-public-api/), [GitHub REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) and [Stack Exchange API](https://api.stackexchange.com/docs/throttle). Their existence does not establish commercial display rights, segment fit, a contact route, or 15 useful recommendations per week. Review each source's current terms and test live yield before adding it to the product.
