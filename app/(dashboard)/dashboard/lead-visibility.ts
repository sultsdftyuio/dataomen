/**
 * Decide the earliest evaluation time a lead may have and still belong to the
 * workspace's current website.
 *
 * The guard exists for one legacy case: a profile row that was overwritten
 * when a workspace replaced its website keeps its ID, so the previous site's
 * matches would otherwise appear under the new one.
 *
 * The boundary must therefore be "when this website was first crawled", not
 * "when the profile was last updated". The profile timestamp advances on
 * every scheduled recrawl and every brief save; using it hid every lead the
 * current run did not happen to re-evaluate, which emptied a paid inbox every
 * 24-48 hours. The crawl ledger keeps one row per workspace website and never
 * rewrites its creation time, so it is a stable start-of-website marker.
 */
export function leadVisibilitySince({
  websiteFirstCrawledAt,
  profileUpdatedAt,
}: {
  websiteFirstCrawledAt: string | null | undefined;
  profileUpdatedAt: string | null | undefined;
}): string | null {
  const firstCrawledAt = validTimestamp(websiteFirstCrawledAt);
  if (!firstCrawledAt) {
    // No crawl ledger row (older deployment or failed read): keep the
    // previous, stricter guard instead of risking another site's leads.
    return validTimestamp(profileUpdatedAt);
  }

  const profileUpdated = validTimestamp(profileUpdatedAt);
  // A profile cannot predate its website's first crawl in a healthy ledger.
  // If it does, the ledger row was recreated, so trust the earlier marker.
  if (profileUpdated && Date.parse(profileUpdated) < Date.parse(firstCrawledAt)) {
    return profileUpdated;
  }
  return firstCrawledAt;
}

function validTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}
