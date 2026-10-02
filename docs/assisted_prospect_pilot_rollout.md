# Assisted prospect pilot rollout

The pilot feed is for a small, manually reviewed, separately contracted cohort. Enrollment is independent of the existing $35 Pro entitlement. It is not a 15/week guarantee and does not send outreach. Each card shows an explicit tier, cited fit, optional dated signal, a checked action route, and customer feedback.

## Release order

1. Apply `scripts/entity_first_prospecting_contract.sql` and the paid-plan contracts listed in [database-contracts](database-contracts.md), then apply `scripts/assisted_prospect_delivery_contract.sql` and `scripts/assisted_candidate_intake_contract.sql` through the normal migration path. Verify the three RPCs exist: `assisted_prospect_pilot_is_enrolled(text)`, `list_assisted_prospect_deliveries(uuid)`, and `submit_assisted_prospect_feedback(uuid,text)`. Follow the [candidate intake procedure](assisted_candidate_intake.md) before delivery.
2. In a dedicated staging database, run `scripts/verify_assisted_candidate_contract.sql` after the assisted migrations. It rolls back its fixtures and checks candidate tenant scope, source approval, deduplication, delivery retention, rejection, suppression, and revocation. Then verify with real authenticated test users that a pilot member can read only their current brief's delivered cards, cannot read the private base tables, cannot view another tenant's card, and can set only their own verdict. Verify a non-pilot and an expired or paused enrollment cannot call the delivery or feedback RPC. Test brief revision, withdrawal, and same-entity duplicate behavior. These checks require a real Postgres/Supabase environment; compilation does not prove RLS.
3. Deploy web code with `ARCLI_ASSISTED_PROSPECT_PILOT_ENABLED=false`. Enroll one qualified workspace by inserting its `tenant_id`, finite `access_expires_at`, `commercial_basis` (`paid` or `paid_intent`), and `pilot_status='active'` into `assisted_prospect_pilots` with a trusted service-role or migration session. The customer must have an approved targeting brief, a completed pilot intake, and separate written commercial terms. Then set the flag to `true` for the web service. Only active, unexpired enrolled members see **Today's prospects** in navigation.
4. Use the [pilot rubric](prospect_pilot_rubric.md) and [intake](prospect_pilot_intake.md) before publishing. Double-review the first 20 cards and every direct-intent claim; record the second reviewer in the controlled worksheet and include their time in `reviewMinutes`. Prepare one card JSON from the example below. Run `pnpm exec tsx scripts/deliver_assisted_prospect.ts card.json` for local validation, then add `--commit` in a trusted operator environment with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not put that key in the browser or a card file. The script checks current brief revision, cohort enrollment and 90-day prior delivery, then writes the entity and card. Service-role users can also withdraw a bad card by setting `withdrawn_at` and one of the constrained `withdrawal_reason` codes.
   Record researched candidates that fail the rubric with `pnpm exec tsx scripts/record_assisted_rejection.ts rejection.json [--commit]`. Use a rubric reason code, source link, source channel, research/review minutes and spend. This stores no raw page body or personal contact field. Log rejected candidates even when no card is delivered; otherwise the yield and cost report will be misleading.
5. Have the customer open the card, verify its links and choose an explicit verdict. Record weekly unique delivered, worth-contacting, contacted, meetings, rejection reasons, review time, and source cost. A delivered card with no customer response remains **unrated**. Report volume shortfalls rather than filling them with weak cards.

For the weekly report, convert the workspace's Monday 00:00 and following Monday 00:00 to UTC instants, then run `pnpm exec tsx scripts/report_assisted_pilot.ts TENANT_ID FROM_UTC TO_UTC REVIEWER_HOURLY_USD` in the trusted operator environment. The report counts candidate intake separately from distinct active deliveries, current judgments, and any recorded contact or meeting action. Its cost estimate includes research/review time at the supplied rate plus recorded source and AI spend. It does not include overhead or support cost.

## Card JSON shape

Replace all example values with reviewed real data. The source and route must actually support the stated fit and approach. The booleans are reviewer attestations, not automatic verification.

```json
{
  "tenantId": "workspace-tenant-id",
  "targetingProfileId": "00000000-0000-4000-8000-000000000001",
  "targetingProfileVersion": 1,
  "candidateId": "00000000-0000-4000-8000-000000000002",
  "entityKind": "account",
  "entityUrl": "https://example.com/",
  "entityTitle": "Example Software",
  "tier": "high_fit",
  "fitSummary": "Its product page documents a workflow matching the approved customer use case.",
  "fitSourceUrl": "https://example.com/product",
  "buyerRole": "Head of operations",
  "angle": "Ask whether the documented workflow is a priority for the team this quarter.",
  "uncertaintySummary": "Current budget and interest are unknown.",
  "signalSummary": null,
  "signalSourceUrl": null,
  "signalSourceChannel": null,
  "signalDate": null,
  "contactRouteType": "business_contact",
  "contactRouteUrl": "https://example.com/contact",
  "sourceCheckedAt": "2026-10-01T09:00:00.000Z",
  "routeCheckedAt": "2026-10-01T09:00:00.000Z",
  "sourceChannel": "official_site",
  "rightsBasis": "Approved manual review of public company pages.",
  "researchMinutes": 12,
  "reviewMinutes": 4,
  "sourceCostUsd": 0,
  "aiCostUsd": 0,
  "reviewedBy": "reviewer-01",
  "checks": {
    "sourceRightsConfirmed": true,
    "fitAndExclusionsChecked": true,
    "identityAndDedupeChecked": true,
    "buyerRoleChecked": true,
    "contactRouteOpened": true,
    "reviewerApproved": true
  }
}
```

The example domain and IDs are placeholders; never publish them. An account card must use the `candidateId` from the private queue and that candidate's domain. Its display window is capped by the candidate source's approved retention and approval expiry; revocation or expiry hides the card even before staff records a withdrawal. A direct-intent or timely card requires a real `signalSummary`, `signalSourceUrl`, `signalSourceChannel`, and original `signalDate`. A high-fit card may omit all four. The site check timestamp is never represented as a recent buying event. This first pilot delivery contract accepts approved official-site, licensed-provider, and customer-owned evidence. Public discussion candidates can be logged as rejected research but cannot be copied into pilot cards until their deletion and retention handling is connected to the existing public-source governance contract.

The rejection file uses `tenantId`, `targetingProfileId`, `targetingProfileVersion`, `entityUrl`, `sourceUrl`, `sourceChannel`, `reasonCode`, `researchMinutes`, `reviewMinutes`, `sourceCostUsd`, `aiCostUsd`, and `reviewedBy`. Use the [rubric reason codes](prospect_pilot_rubric.md). Run without `--commit` to validate locally; the commit uses service-role access and verifies current brief revision and pilot enrollment.

## Rollback and limits

Turn the web flag off to hide navigation and the route. Set a pilot enrollment to `paused` or `ended` to stop access for that workspace without deleting delivery and feedback history. Cards with a dated signal stop appearing within 30 days; high-fit cards without a signal stop appearing within 90 days. Withdraw a specific incorrect card sooner so it disappears from the customer projection; investigate feedback and source removal before any replacement. Leave the additive tables intact for audit and cleanup under the data retention policy.

This first slice does not yet source or review 15 cards automatically. The operator intake's source-rights and rubric checks require human work. The current entity identity is a normalized URL, so aliases and subsidiaries still require manual dedupe. The current in-app view returns the newest 100 cards for the approved brief revision; weekly reporting uses service-owned delivery, rejection, and feedback tables, not page views.
