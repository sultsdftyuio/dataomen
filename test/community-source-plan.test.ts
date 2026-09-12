import assert from "node:assert/strict";
import test from "node:test";

import { deriveCommunitySourcePlan } from "../lib/community-source-plan";

const queries = [
  { query_type: "buyer_pain", phrase: "invoice approvals take forever" },
  { query_type: "urgent_failure", phrase: "month end close delayed" },
  { query_type: "recommendation_request", phrase: "best invoice approval software" },
  { query_type: "manual_workflow_frustration", phrase: "chasing approvals in spreadsheets" },
  { query_type: "category_tool_search", phrase: "accounts payable automation tool" },
  { query_type: "switching_trigger", phrase: "outgrown our approval workflow" },
] as const;

test("a non-technical product starts with bounded public conversation sources", () => {
  const plan = deriveCommunitySourcePlan({
    valueProposition: "Automate invoice approvals with an audit trail.",
    targetAudience: ["Controllers at multi-entity businesses"],
    coreProblem: "Invoice approvals stall before month-end close.",
    discoveryQueries: queries,
  });

  assert.deepEqual(plan.sources.map((source) => source.source), [
    "hackernews",
    "bluesky",
  ]);
  assert.deepEqual(plan.sources[0]?.queryTerms, [
    "chasing approvals in spreadsheets",
    "accounts payable automation tool",
    "outgrown our approval workflow",
  ]);
  assert.deepEqual(plan.sources[1]?.queryTerms, [
    "best invoice approval software",
    "invoice approvals take forever",
    "month end close delayed",
  ]);
});

test("technical open-source context adds only the matching technical communities", () => {
  const plan = deriveCommunitySourcePlan({
    valueProposition: "Open-source API observability for platform engineering teams.",
    targetAudience: ["Developer platform teams"],
    coreProblem: "Backend services lack reliable tracing.",
    discoveryQueries: queries,
  });

  assert.deepEqual(plan.sources.map((source) => source.source), [
    "hackernews",
    "bluesky",
    "stackexchange",
    "github",
    "lemmy",
  ]);
  assert.equal(plan.sources.find((source) => source.source === "github")?.label, "GitHub");
  assert.ok(plan.suggestedPlaces.some((place) => place.startsWith("Stack Exchange:")));
});
