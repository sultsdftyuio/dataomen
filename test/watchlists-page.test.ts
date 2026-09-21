import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("keeps buyer-group setup compact until the customer asks for detail", () => {
  const page = source("app/(dashboard)/dashboard/watchlists/page.tsx");
  const demandMap = source("components/prospects/website-demand-map.tsx");
  const detail = source("app/(dashboard)/dashboard/watchlist-detail.tsx");

  assert.match(page, /max-w-\[1440px\]/);
  assert.match(page, /<WebsiteDemandMap[\s\S]*collapsible/);
  assert.match(demandMap, /aria-expanded=\{isExpanded\}/);
  assert.match(demandMap, /website-demand-map-suggestions/);
  assert.match(detail, /function DetailCard/);
  assert.match(detail, /activeSection/);
  assert.match(detail, /Latest signals/);
});

test("keeps the custom buyer-group path available without duplicating the website ideas", () => {
  const panel = source("app/(dashboard)/dashboard/watchlists-panel.tsx");

  assert.match(panel, /hasSuggestedBuyerGroups/);
  assert.match(panel, /Open the website ideas card above/);
  assert.match(panel, /Create custom buyer group/);
  assert.match(panel, /from "\.\/watchlist-detail"/);
});
