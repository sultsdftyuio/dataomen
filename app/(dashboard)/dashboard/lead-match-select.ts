/**
 * Column lists for reading matches into the prospect desk.
 *
 * `lead_matches` keeps several legacy aliases of the same post snapshot and
 * verifier verdict, and `source_posts.metadata` holds each post's cached
 * embedding vector. Selecting `*` would send every copy to the server on each
 * dashboard load although a lead card renders a handful of text fields. These
 * lists name exactly what the lead view reads.
 *
 * `source_post` and `verification` are NOT NULL in the storage contract, so
 * the view never reaches their aliases (`source_post_data`, `source_post_json`,
 * `post`, `verifier_result`); leaving them out changes no rendered value.
 */

/** Post fields a lead card can render. Deliberately excludes `metadata`. */
const SOURCE_POST_VIEW_COLUMNS = [
  "id",
  "source",
  "title",
  "text",
  "body",
  "author",
  "community",
  "url",
  "published_at",
  "posted_at",
] as const;

/** Fields shared by lead and Watchlist match rows. */
const MATCH_VIEW_COLUMNS = [
  "id",
  "match_status",
  "verifier_score",
  "similarity_score",
  "pain_detected",
  "match_reason",
  "suggested_reply",
  "verification",
  // The tenant-owned snapshot is what renders for a global post, which
  // row-level security hides from the joined `source_posts` read.
  "source_post",
  // Provider context (community, repository, site) lives here.
  "metadata",
  "matched_at",
  "verified_at",
  "created_at",
] as const;

const SOURCE_POST_VIEW_EMBED = `source_posts(${SOURCE_POST_VIEW_COLUMNS.join(",")})`;

function matchViewSelect(extraColumns: readonly string[]): string {
  return [...MATCH_VIEW_COLUMNS, ...extraColumns, SOURCE_POST_VIEW_EMBED].join(",");
}

/** Narrow read for `lead_matches`, tried before the schema-tolerant `*`. */
export const LEAD_MATCH_VIEW_SELECT = matchViewSelect([
  // Older rows may carry the similarity under one of its former names.
  "embedding_score",
  "match_score",
]);

/** Narrow read for `watchlist_matches`, which also groups by its Watchlist. */
export const WATCHLIST_MATCH_VIEW_SELECT = matchViewSelect(["watchlist_id"]);

/** The previous read, kept as the fallback for a deployment missing a column. */
export const MATCH_FALLBACK_SELECT = "*, source_posts(*)";

/** Reads to try in order: narrow first, then the two schema-tolerant ones. */
export const LEAD_MATCH_SELECTS = [LEAD_MATCH_VIEW_SELECT, MATCH_FALLBACK_SELECT, "*"] as const;
export const WATCHLIST_MATCH_SELECTS = [
  WATCHLIST_MATCH_VIEW_SELECT,
  MATCH_FALLBACK_SELECT,
  "*",
] as const;

/**
 * Run `read` with each select until one succeeds, returning the last result.
 *
 * A column that a deployment has not migrated yet makes the narrow read fail;
 * the wider reads keep the dashboard rendering instead of going blank.
 */
export async function readWithSelectFallback<Result extends { error: unknown }>(
  selects: readonly string[],
  read: (select: string) => PromiseLike<Result>,
): Promise<Result> {
  let result = await read(selects[0]);
  for (const select of selects.slice(1)) {
    if (!result.error) break;
    result = await read(select);
  }
  return result;
}
