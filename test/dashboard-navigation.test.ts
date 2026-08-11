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

test("opens a Pro prompt instead of navigating free workspaces to Buyer groups", () => {
  const navigation = readFileSync(
    join(process.cwd(), "components", "dashboard", "DashboardNavigation.tsx"),
    "utf8",
  );

  assert.match(navigation, /item\.href === "\/dashboard\/watchlists"/);
  assert.match(navigation, /onClick=\{\(\) => setIsUpgradeOpen\(true\)\}/);
  assert.match(navigation, /Pro prospect desk/);
  assert.match(navigation, /See the people behind the signal\./);
});
