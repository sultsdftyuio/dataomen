/**
 * Turns existing, tenant-scoped lead feedback into small source-level signals.
 *
 * This module deliberately works only with source IDs and feedback labels. It
 * never exposes reviewer identity, source-post text, or a raw feedback reason
 * to the client. It mirrors the worker's advisory ordering rule: only a
 * supplemental source with six unambiguous negative reviews is marked as
 * deprioritized, meaning it is checked later rather than removed.
 */

export type SourceFeedbackObservation = {
  source: unknown;
  feedbackType: unknown;
  leadMatchId: unknown;
};

export type SourceFeedbackRecommendation =
  | "learning"
  | "promising"
  | "deprioritized";

export type SourceFeedbackInsight = {
  source: string;
  reviewedLeads: number;
  positiveReviews: number;
  negativeReviews: number;
  recommendation: SourceFeedbackRecommendation;
};

const POSITIVE_FEEDBACK = new Set(["good_fit", "useful_pain_not_now"]);
const NEGATIVE_FEEDBACK = new Set(["wrong_buyer", "not_relevant", "spam"]);
const PROTECTED_SOURCES = new Set(["hackernews", "bluesky", "x"]);
const MIN_DEPRIORITIZE_REVIEWS = 6;

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Derive content-free source feedback insights. Conflicting labels for the
 * same lead are intentionally ignored so a divided reviewer sample cannot
 * influence source recommendations.
 */
export function deriveSourceFeedbackInsights(
  observations: readonly SourceFeedbackObservation[],
): SourceFeedbackInsight[] {
  const labelsBySourceLead = new Map<string, Set<"positive" | "negative">>();

  for (const observation of observations) {
    const source = normalizedText(observation.source);
    const leadMatchId = normalizedText(observation.leadMatchId);
    const feedbackType = normalizedText(observation.feedbackType);
    if (!source || !leadMatchId) continue;

    const label = POSITIVE_FEEDBACK.has(feedbackType)
      ? "positive"
      : NEGATIVE_FEEDBACK.has(feedbackType)
        ? "negative"
        : null;
    if (!label) continue;

    const key = `${source}\u0000${leadMatchId}`;
    const labels = labelsBySourceLead.get(key) ?? new Set<"positive" | "negative">();
    labels.add(label);
    labelsBySourceLead.set(key, labels);
  }

  const counts = new Map<string, { positive: number; negative: number }>();
  for (const [key, labels] of labelsBySourceLead) {
    if (labels.size !== 1) continue;

    const source = key.split("\u0000", 1)[0];
    if (!source) continue;
    const current = counts.get(source) ?? { positive: 0, negative: 0 };
    if (labels.has("positive")) current.positive += 1;
    else current.negative += 1;
    counts.set(source, current);
  }

  return [...counts.entries()]
    .map(([source, count]) => {
      const reviewedLeads = count.positive + count.negative;
      const isDeprioritized =
        !PROTECTED_SOURCES.has(source) &&
        reviewedLeads >= MIN_DEPRIORITIZE_REVIEWS &&
        count.positive === 0 &&
        count.negative === reviewedLeads;
      const isPromising =
        !isDeprioritized &&
        count.positive >= 2 &&
        count.positive >= count.negative * 2;

      const recommendation: SourceFeedbackRecommendation = isDeprioritized
        ? "deprioritized"
        : isPromising
          ? "promising"
          : "learning";

      return {
        source,
        reviewedLeads,
        positiveReviews: count.positive,
        negativeReviews: count.negative,
        recommendation,
      };
    })
    .sort((left, right) => {
      if (right.reviewedLeads !== left.reviewedLeads) {
        return right.reviewedLeads - left.reviewedLeads;
      }
      return left.source.localeCompare(right.source);
    });
}
