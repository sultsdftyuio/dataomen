import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DEFAULT_BUYER_GROUP_SOURCES,
  deriveBuyerGroupSuggestions,
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
  assert.deepEqual(suggestions[0].sourcePreferences, DEFAULT_BUYER_GROUP_SOURCES);
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

test("activation accepts only a suggestion ID and re-derives the tenant-scoped group", () => {
  assert.match(
    actionsSource,
    /export async function activateSuggestedBuyerGroup\(\s*suggestionId: string/,
  );
  assert.match(actionsSource, /deriveBuyerGroupSuggestions\(/);
  assert.match(actionsSource, /suggestions\.find\(\(item\) => item\.id === normalizedId\)/);
  assert.match(actionsSource, /postWatchlistDiscoveryTrigger\(/);
  assert.doesNotMatch(
    actionsSource,
    /activateSuggestedBuyerGroup\(\s*input:\s*WatchlistCreateInput/,
  );
});

test("demand-map UI labels website directions as hypotheses and removes generic SaaS starters", () => {
  assert.match(demandMapSource, /Website-derived hypothesis/);
  assert.match(demandMapSource, /These are hypotheses, not leads/);
  assert.match(demandMapSource, /Start focused scan/);
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
  assert.match(leadDeskSource, /Scan website demand/);
});
