import type { CrawlJobView, ServiceProfileView } from "./prospect-types";

/**
 * States where discovery is blocked and the person must act. Normal
 * in-progress states are deliberately excluded: the dashboard already polls,
 * and showing "working…" banners there would add noise, not help.
 */
export type ProfileHealthIssue = {
  kind: "crawl_failed" | "profile_details_needed" | "embedding_failed" | "embedding_stalled";
  title: string;
  detail: string;
  action: "rebuild_profile" | "retry_embedding" | "edit_brief";
  /** Raw worker error, shown only on hover so support can diagnose it. */
  technicalDetail?: string;
};

// Embedding normally finishes in well under a minute; after this long with no
// progress the job is almost certainly lost and a retry is safe.
export const STALLED_EMBEDDING_MS = 10 * 60 * 1000;

const FAILED_STATES = ["failed", "error", "dead_lettered"];
const IN_PROGRESS_STATES = ["pending", "queued", "processing", "generating"];

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, "_") ?? null;
}

export function profileHealthIssue(
  crawlJob: CrawlJobView | null,
  serviceProfile: ServiceProfileView,
  now: number = Date.now(),
): ProfileHealthIssue | null {
  const crawlStatus = normalized(crawlJob?.status);

  if (crawlStatus === "failed" || crawlStatus === "dead_lettered") {
    return {
      kind: "crawl_failed",
      title: "We couldn't read your website",
      detail: "New leads can't be found until the crawl succeeds.",
      action: "rebuild_profile",
      technicalDetail: crawlJob?.errorMessage ?? crawlJob?.failureReason ?? undefined,
    };
  }

  const embeddingStatus = normalized(serviceProfile.embeddingStatus);
  if (!serviceProfile.hasProfile || !embeddingStatus || embeddingStatus === "completed") {
    return null;
  }

  if (FAILED_STATES.includes(embeddingStatus)) {
    if (normalized(serviceProfile.embeddingFailureReason) === "profile_content_missing") {
      return {
        kind: "profile_details_needed",
        title: "Add a few matching details",
        detail: "Describe who you help and the problem you solve so Arcli knows what to search for.",
        action: "edit_brief",
      };
    }

    return {
      kind: "embedding_failed",
      title: "Matching couldn't start",
      detail: "Your profile is saved, but preparing it for search failed.",
      action: "retry_embedding",
      technicalDetail: serviceProfile.embeddingFailureReason ?? undefined,
    };
  }

  const updatedAt = Date.parse(serviceProfile.updatedAt ?? "");
  if (
    IN_PROGRESS_STATES.includes(embeddingStatus) &&
    Number.isFinite(updatedAt) &&
    now - updatedAt > STALLED_EMBEDDING_MS
  ) {
    return {
      kind: "embedding_stalled",
      title: "Matching is taking too long",
      detail: "Preparation hasn't made progress in over 10 minutes.",
      action: "retry_embedding",
    };
  }

  return null;
}
