import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  dashboardNavigationItems,
  isDashboardNavigationItemActive,
} from "../lib/dashboard-navigation";

test("exposes the four primary dashboard workflows", () => {
  assert.deepEqual(
    dashboardNavigationItems.map((item) => item.href),
    [
      "/dashboard",
      "/dashboard/watchlists",
      "/dashboard/brief",
      "/settings",
    ],
  );
});

test("marks only the current navigation workflow as active", () => {
  assert.equal(isDashboardNavigationItemActive("/dashboard", "/dashboard"), true);
  assert.equal(
    isDashboardNavigationItemActive("/dashboard/watchlists", "/dashboard"),
    false,
  );
  assert.equal(
    isDashboardNavigationItemActive("/dashboard/watchlists", "/dashboard/watchlists"),
    true,
  );
  assert.equal(isDashboardNavigationItemActive("/settings/billing", "/settings"), true);
  assert.equal(isDashboardNavigationItemActive("/dashboarding", "/dashboard"), false);
});

test("sends free workspaces from Buyer groups to the upgrade page", () => {
  const watchlistsPage = readFileSync(
    join(process.cwd(), "app", "(dashboard)", "dashboard", "watchlists", "page.tsx"),
    "utf8",
  );
  const upgradePage = readFileSync(
    join(process.cwd(), "app", "(dashboard)", "upgrade", "page.tsx"),
    "utf8",
  );

  assert.match(
    watchlistsPage,
    /if \(!entitlements\.isPro\) \{\s+redirect\("\/upgrade"\);\s+\}/,
  );
  assert.match(upgradePage, /Upgrade to Pro \| Arcli/);
  assert.match(upgradePage, /See the people behind the signal\./);
});
