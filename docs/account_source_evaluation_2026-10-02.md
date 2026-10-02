# Account-source decision: 2 October 2026

**Decision:** Do not use Wikidata or HN Show as the primary supply source for a 15 outreach-worthy prospects/week offer. Keep the existing HN path for direct, source-linked discussions. Use Wikidata only as an optional, reviewed account-discovery input. Neither source has passed the contactable-fit or four-week yield gate.

## Read-only checks

| Source | Observed supply | What the sample showed | Decision |
| --- | --- | --- | --- |
| Wikidata software-company class | Live SPARQL count: 1,840 entities directly classified as software companies with a website; 6,200 including subclasses. A bounded first page of 100 yielded 100 distinct syntactically valid domains. | The first page contained game studios, MySQL AB and other entities that require current-identity checks. The first 500 direct-class rows yielded 460 distinct domain strings, including historical brands and old URLs. These are **unverified accounts**, not 460 fit prospects. | Secondary research/backfill only. A website property can be old or one of several values. |
| Wikidata software industry | Live SPARQL count: 2,769 entities with an official website. | The first page included Google, MySQL AB, Business Objects and smaller companies. Industry membership does not establish SaaS status, target size, fit or a contact route. | No automatic recommendation from this property. |
| Official HN Show list | The earlier bounded sample of 100 had 89 items posted within seven days and 73 distinct external domains. A second live 100-item snapshot on 2 October showed many repositories, hobby projects, games and consumer tools. | A dated launch can support a timely angle, but it does not prove B2B fit, that the poster represents the company, or intent to buy a customer's product. The rolling, ranked list cannot establish a complete weekly denominator. | Complementary fresh-signal source. Do not turn story counts into lead counts. Commercial use of HN-derived content needs review before the assisted pilot reuses it. |

Wikidata's [structured data license](https://www.wikidata.org/wiki/Wikidata:Licensing) is CC0. Its [query service](https://www.mediawiki.org/wiki/Wikidata_query_service/Implementation) has public usage constraints and no service-level commitment for Arcli. The [official website property](https://www.wikidata.org/wiki/Property:P856) may include past websites. The [official HN API](https://github.com/HackerNews/API) exposes a near-real-time public feed, but its documentation does not itself establish Arcli's commercial display/retention rights.

## Implemented research path

`scripts/assisted_sources/wikidata_software.ts` fetches one bounded page, keeps the source item URL, normalizes domains and rejects malformed, private-IP and shared-platform account URLs. `scripts/research_wikidata_accounts.ts` prints a research sample or writes one private candidate batch when given an already approved directory manifest. The existing importer still requires a matching staff-registered source approval. These checks establish **neither live website ownership nor current fit**; review must verify both and find an action route. No automatic customer delivery uses this source.

Example read-only command:

```sh
pnpm exec tsx scripts/research_wikidata_accounts.ts 0 100
```

## Decision required before the account engine scales

The working segment remains founder-led B2B SaaS sellers targeting software companies, but its source strategy is unproven. The next source experiment should compare a rights-approved B2B company provider/export and customer-owned target lists against public directories on the **same approved brief**. Review a stratified sample from each source for current company/site, hard fit, unique identity, plausible route, and reviewer time. Then measure *new, distinct review-approved accounts per week* after existing customers and prior deliveries are removed. A provider's raw company count is not a pass.

If no permitted source pair yields enough contactable fit accounts at viable cost, narrow the customer segment to one with an authoritative public company or demand-event registry before expanding the product. Keep the 15/week claim gated on four consecutive measured weeks and customer actions.
