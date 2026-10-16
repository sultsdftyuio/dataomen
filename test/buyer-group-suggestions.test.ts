import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  deriveBuyerGroupSuggestions,
  shortGroupName,
} from "../lib/buyer-group-suggestions";

const actionsSource = readFileSync(
  fileURLToPath(new URL("../app/(dashboard)/dashboard/actions.ts", import.meta.url)),
  "utf8",
);
const demandMapSource = readFileSync(
  fileURLToPath(
    new URL("../components/prospects/website-demand-map.tsx", import.meta.url),
  ),
  "utf8",
);
const watchlistsSource = readFileSync(
  fileURLToPath(
    new URL("../app/(dashboard)/dashboard/watchlists-panel.tsx", import.meta.url),
  ),
  "utf8",
);
const dashboardPageSource = readFileSync(
  fileURLToPath(new URL("../app/(dashboard)/dashboard/page.tsx", import.meta.url)),
  "utf8",
);
const leadDeskSource = readFileSync(
  fileURLToPath(
    new URL("../components/prospects/prospect-lead-desk.tsx", import.meta.url),
  ),
  "utf8",
);

test("derives focused, explainable buyer directions from any website profile", () => {
  const suggestions = deriveBuyerGroupSuggestions({
    companyName: "Example design platform",
    targetAudience: [
      "Design-system leaders at product companies",
      "Engineering leaders working with design teams",
    ],
    coreProblem: "Design handoff and design-system work are fragmented across tools.",
    useCases: [
      "Keeping design systems aligned with implementation",
      "Giving developers usable design specifications",
    ],
    painPoints: [
      "Manual design QA causes rework",
      "Design changes are hard to communicate to engineers",
    ],
    buyingTriggers: ["A product team is standardizing its design workflow"],
    negativeKeywords: ["consumer art tutorials"],
    excludedAudiences: ["Students learning graphic design"],
  });

  assert.equal(suggestions.length, 3);
  assert.deepEqual(suggestions[0].sourcePreferences, [
    "hackernews",
    "bluesky",
    "stackexchange",
    "lemmy",
  ]);
  assert.equal(suggestions[0].communityPlan.sources[0]?.label, "Hacker News");
  assert.ok(suggestions[0].suggestedPlaces.length > 0);
  assert.match(suggestions[0].targetBuyer, /Design-system leaders/i);
  assert.match(suggestions[0].problemToSolve, /Design handoff/i);
  assert.ok(suggestions[0].includeTerms.length > 0);
  assert.ok(suggestions[0].excludeTerms.includes("consumer art tutorials"));
  assert.deepEqual(suggestions[0].evidence, [
    `Website audience: ${suggestions[0].targetBuyer}`,
    `Website problem: ${suggestions[0].problemToSolve}`,
  ]);
  assert.match(suggestions[0].rationale, /website connects/i);
  assert.match(suggestions[0].id, /^website-1-/);
});

test("uses explicit website hypotheses first and never invents one from an empty profile", () => {
  const explicit = deriveBuyerGroupSuggestions({
    targetAudience: ["Operations teams"],
    coreProblem: "Manual reconciliation creates month-end delays.",
    buyerGroups: [
      {
        name: "Controllers facing close delays",
        target_buyer: "Controllers at multi-entity businesses",
        problem_to_solve: "Month-end close depends on manual reconciliations.",
        include_terms: ["month-end close", "manual reconciliations"],
        rationale: "The website emphasizes financial close automation.",
      },
    ],
  });

  assert.equal(explicit[0].name, "Controllers facing close delays");
  assert.equal(explicit[0].targetBuyer, "Controllers at multi-entity businesses");
  assert.equal(explicit[0].rationale, "The website emphasizes financial close automation.");
  assert.deepEqual(deriveBuyerGroupSuggestions({}), []);
});

// Words that make a name read as a sentence cut off mid-thought.
const DANGLING_ENDING = /\b(?:a|an|the|and|or|of|to|for|by|with|that|who|which|using)$/i;

test("names suggestions after the audience, at a natural boundary and never mid-phrase", () => {
  const sharedProblem =
    "Teams waste speed and ship quality by using disconnected design, collaboration, and handoff workflows\u2014so iteration slows, designs drift from implementation, and stakeholders get misaligned before code is written.";
  const suggestions = deriveBuyerGroupSuggestions({
    targetAudience: [
      "Product design teams (UI/UX) building apps, websites, and digital products",
      "Design system owners and platforms teams standardizing components across products and brands",
      "Design + engineering orgs that need reliable design-to-code handoff",
    ],
    coreProblem: sharedProblem,
  });

  assert.deepEqual(
    suggestions.map((suggestion) => suggestion.name),
    [
      "Product design teams building apps",
      "Design system owners and platforms teams",
      "Design + engineering orgs",
    ],
  );
  for (const suggestion of suggestions) {
    assert.ok(suggestion.name.length <= 56, suggestion.name);
    assert.doesNotMatch(suggestion.name, DANGLING_ENDING);
    assert.doesNotMatch(suggestion.name, /\u00b7/);
    // The full audience and problem stay on the record for the scan itself.
    assert.equal(suggestion.problemToSolve, sharedProblem);
  }
});

test("keeps short audiences whole and gives suggestions for one audience distinct names", () => {
  const audiences = deriveBuyerGroupSuggestions({
    targetAudience: [
      "Founders of seed to Series A B2B SaaS companies",
      "Heads of engineering who own security questionnaires",
      "Ops leads preparing for a first SOC 2 audit",
    ],
    coreProblem: "Small SaaS teams lose enterprise deals collecting SOC 2 evidence by hand.",
  });
  assert.deepEqual(
    audiences.map((suggestion) => suggestion.name),
    [
      "Founders of seed to Series A B2B SaaS companies",
      "Heads of engineering who own security questionnaires",
      "Ops leads preparing for a first SOC 2 audit",
    ],
  );

  const oneAudience = deriveBuyerGroupSuggestions({
    targetAudience: ["Operations teams"],
    coreProblem: "Manual reconciliation creates month-end delays.",
    painPoints: ["Spreadsheets break during audits", "Approvals stall in email threads"],
  });
  const names = oneAudience.map((suggestion) => suggestion.name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(names, [
    "Manual reconciliation creates month-end delays",
    "Spreadsheets break during audits",
    "Approvals stall in email threads",
  ]);
});

test("shortens long phrases at clause boundaries and drops dangling words", () => {
  assert.equal(
    shortGroupName("Teams waste speed and ship quality by using disconnected design tools every week"),
    "Teams waste speed and ship quality",
  );
  assert.equal(
    shortGroupName("Small SaaS teams lose enterprise deals or weeks of engineering time collecting SOC 2 and ISO 27001 evidence by hand."),
    "Small SaaS teams lose enterprise deals",
  );
  assert.equal(
    shortGroupName("Marketing teams running paid ads across many channels and regions every quarter"),
    "Marketing teams",
  );
  assert.equal(shortGroupName("growth leads"), "Growth leads");
  assert.equal(shortGroupName("   "), "");
});

test("activation accepts only a suggestion ID and re-derives the tenant-scoped group", () => {
  assert.match(
    actionsSource,
    /export async function activateSuggestedBuyerGroup\(\s*suggestionId: string/,
  );
  assert.match(actionsSource, /deriveBuyerGroupSuggestions\(/);
  assert.match(actionsSource, /suggestions\.find\(\(item\) => item\.id === normalizedId\)/);
  assert.match(actionsSource, /postWatchlistDiscoveryTrigger\(/);
  assert.match(actionsSource, /suggestedPlaces: suggestion\.suggestedPlaces/);
  assert.doesNotMatch(
    actionsSource,
    /activateSuggestedBuyerGroup\(\s*input:\s*WatchlistCreateInput/,
  );
});

test("demand-map UI keeps dashboard buyer-group ideas concise and preserves detailed hypotheses", () => {
  assert.match(demandMapSource, /Suggested buyer groups/);
  assert.match(demandMapSource, /Audiences to test, based on your website/);
  assert.match(demandMapSource, /suggestion\.targetBuyer/);
  assert.match(demandMapSource, /Manage buyer groups/);
  assert.match(demandMapSource, /Problem they share/);
  assert.doesNotMatch(demandMapSource, /Explore ideas/);
  assert.doesNotMatch(demandMapSource, /optional buyer direction/);
  assert.match(demandMapSource, /These are hypotheses, not buyer signals/);
  // The button creates a persistent group, so its label says so.
  assert.match(demandMapSource, /Create group and scan/);
  assert.doesNotMatch(watchlistsSource, /FIRST_GROUP_IDEAS/);
  assert.doesNotMatch(watchlistsSource, /Founder growth friction/);
});

test("the default prospects page carries website hypotheses into the focused scan flow", () => {
  assert.match(dashboardPageSource, /deriveBuyerGroupSuggestions\(/);
  assert.match(
    dashboardPageSource,
    /activateBuyerGroup=\{activateSuggestedBuyerGroup\}/,
  );
  assert.match(leadDeskSource, /<WebsiteDemandMap/);
  assert.match(leadDeskSource, /<WebsiteDemandMap[\s\S]*collapsible/);
  assert.match(leadDeskSource, /activateBuyerGroup=\{activateBuyerGroup\}/);
  assert.doesNotMatch(leadDeskSource, /Scan website demand/);
});
