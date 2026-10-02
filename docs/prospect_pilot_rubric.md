# Prospect pilot review rubric

**Status:** initial reviewer contract for the first assisted cohort. Calibrate with customers before using it as an automated delivery gate. The [roadmap](outreach_prospect_roadmap.md) defines the launch target and decision rules.

## What a reviewer is deciding

The question is: **Would this specific customer reasonably spend time contacting this prospect this week, given the evidence and route shown?** A relevant company in a directory is research material until the card has a source-backed reason and a viable next step. A model score is never the decision.

Review each proposed item against the customer's *approved* targeting brief. Record the brief revision so a later ICP edit does not silently change the old decision. If the brief is unclear, request a customer clarification and keep the item out of the delivered count.

### Required checks: all must pass

| Check | Pass | Fail or return for research |
| --- | --- | --- |
| Customer fit | Source facts support required industry/use case, market, size or stage, and buyer-role relevance; all hard exclusions checked | Only a broad category match, invented firmographic field, excluded account, or no plausible buyer |
| Stable identity and novelty | Canonical entity URL; aliases and domain checked; not already delivered, owned, contacted, or excluded within the agreed cooldown | Duplicate brand/subdomain, ambiguous person/company link, previously worked account without a new reason |
| Grounded reason | A source link supports a specific product/company fact or attributed discussion; reviewer can point to the precise evidence | Generic “could benefit,” AI inference presented as fact, inaccessible page, or unsupported quote |
| Action route | Relevant public reply, published business contact route, customer-owned CRM contact, or licensed on-demand business route; test that it opens and suits the buyer role | Homepage only, broken form, private contact guessed from a profile, or a route to an unrelated department |
| Useful angle | One honest outreach premise follows from fit facts or an observed signal; it does not require inventing pain or urgency | Template message that could be sent to every company in the segment |
| Rights and safety | Source may be used for this purpose; public data is handled under the current retention/removal rules; no prohibited or sensitive data copied into the card | Unapproved scraping/provider terms, private content, excessive personal details, or unresolved removal request |

If any required check fails, do **not** deliver it or count it toward 15. “Needs research” means an operator can seek an approved source or route; it is not a customer-facing prospect.

## Pick the strongest justified tier

1. **Direct buyer intent:** original, linked, attributable post or request from this entity or a defensibly linked representative describes a relevant active problem, evaluation, recommendation request, or switch. Record the original date and exact supporting excerpt. A person mentioning a tool or posting a technical issue does not establish buying authority or company intent by itself.
2. **Timely prospect:** linked company event, change, public job post, launch, procurement notice or comparable dated development makes a specific outreach angle relevant. Record the event date. Explain the relevance to the customer's offer. Label it as timing, never as confirmed interest in buying.
3. **High-fit prospect:** current, cited firmographic/product facts establish a strong match and a useful approach route. A new event is **not required**. State **“No recent buying signal observed”** when the research found none. The site/page check date is a verification date, not a “why now” event.

Do not upgrade a tier to fill a weekly quota. If an event is old, unlinked or weak, use high-fit when the fit and action contract still passes. A current job posting may support a timely angle for a relevant seller, but is not buyer intent. An account-level signal does not establish a named person's intent.

## Reviewer worksheet

For each candidate, record:

- Workspace, targeting-brief ID and revision; reviewer; review and delivery timestamps.
- Entity type, canonical URL/domain, stable provider ID when permitted, aliases and dedupe outcome.
- Required ICP facts with source URLs; each hard exclusion checked; likely buyer role and why relevant.
- Evidence URL, source/provider, exact grounded fact or short permitted excerpt, original published/event date if any, and fetch/check date.
- Proposed tier; “why this prospect”; optional “why now”; outreach angle; uncertainty; contact/reply route type and verified URL or customer-owned CRM reference.
- Source rights/retention class; reviewer decision; reason code; second-review decision for sampled cards; customer verdict and actual action when known.
- Research and review minutes, provider spend, AI spend and any contact-lookup charge.

Keep customer/private fields in the approved tenant-scoped system or controlled operator worksheet. Do not put raw source bodies, contact names, emails or credentials in telemetry, logs or general-purpose analytics.

## Decision and feedback codes

| Operator decision | Reason examples |
| --- | --- |
| Approve for delivery | `direct_intent`, `timely_fit`, `high_fit` |
| More research | `missing_route`, `unclear_identity`, `fit_unverified`, `source_temporarily_unavailable` |
| Reject | `wrong_buyer`, `excluded_account`, `duplicate`, `already_contacted`, `weak_angle`, `bad_evidence`, `stale_claim`, `source_rights`, `sensitive_data` |

Ask the customer to mark **worth contacting**, **wrong fit**, **already known**, **no route**, **bad evidence**, **not now**, and **contacted/meeting** where applicable. Keep unreviewed items as unreviewed; a click or save alone is weaker evidence than an explicit judgment. Record reasons for rejection and update the brief only with customer approval.

## Pilot calibration and daily operation

1. Before week one, review five good and five bad examples with each customer. Resolve differences in hard exclusions, buyer role and action route. Write the approved brief revision.
2. Each business day, collect a broader candidate pool from approved sources, dedupe, check evidence and route, then prepare up to three approved cards. Deliver fewer when the rubric cannot be met; report the shortfall honestly.
3. Double-review the first 20 cards and at least 10% thereafter, including every direct-intent claim and a sample of rejections. Record disagreements by criterion. A second reviewer can downgrade or reject a card.
4. Ask for an explicit customer verdict within the weekly review. Track delivered, accepted, contacted and meetings by tier and source. Review false positives, missed candidates and source exhaustion weekly.
5. Remove or correct a card when its underlying source is removed, identity is disputed, or a contact route fails. Retain an audit event without retaining prohibited source content.

**Counting rule:** only distinct, delivered, reviewer-approved cards that passed every required check count toward 15. A weekly total is reported per workspace and tier. The reviewer may not substitute old, duplicate, generic or unsupported prospects to hit the number.

## Illustrative judgments

- A company sells software matching the customer's ICP, its product page shows the relevant workflow, and its business contact page reaches the right team. No recent event is found. **High-fit**, if the angle is specific and the account is novel.
- A relevant company has a dated public job post for a role tied to the customer's service. The job link supports the timing, and a suitable business route exists. **Timely**, if the relationship is specific; no buyer-intent claim.
- A public poster asks for alternatives to their current solution and explicitly describes the relevant problem. **Direct intent** only if the source, identity, date and reply route are valid; do not assume that poster controls a company budget.
- A directory lists 100 companies in the target industry with no specific fit evidence or route. **Research only**; zero countable prospects.
