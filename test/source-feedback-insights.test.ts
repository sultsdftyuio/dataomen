import assert from "node:assert/strict";
import test from "node:test";

import { deriveSourceFeedbackInsights } from "../lib/source-feedback-insights";

test("source feedback groups reviews by source and lead instead of raw feedback rows", () => {
  const insights = deriveSourceFeedbackInsights([
    { source: "GitHub", feedbackType: "good_fit", leadMatchId: "lead-1" },
    { source: "github", feedbackType: "useful_pain_not_now", leadMatchId: "lead-1" },
    { source: "github", feedbackType: "not_relevant", leadMatchId: "lead-2" },
    { source: "github", feedbackType: "good_fit", leadMatchId: "split" },
    { source: "github", feedbackType: "spam", leadMatchId: "split" },
  ]);

  assert.deepEqual(insights, [
    {
      source: "github",
      reviewedLeads: 2,
      positiveReviews: 1,
      negativeReviews: 1,
      recommendation: "learning",
    },
  ]);
});

test("only a large unanimous negative supplemental sample is deprioritized", () => {
  const githubReviews = Array.from({ length: 6 }, (_, index) => ({
    source: "github",
    feedbackType: "not_relevant",
    leadMatchId: `github-${index}`,
  }));
  const hackerNewsReviews = Array.from({ length: 8 }, (_, index) => ({
    source: "hackernews",
    feedbackType: "not_relevant",
    leadMatchId: `hn-${index}`,
  }));

  const insights = deriveSourceFeedbackInsights([
    ...githubReviews,
    ...hackerNewsReviews,
  ]);

  assert.equal(
    insights.find((insight) => insight.source === "github")?.recommendation,
    "deprioritized",
  );
  assert.equal(
    insights.find((insight) => insight.source === "hackernews")?.recommendation,
    "learning",
  );
});
