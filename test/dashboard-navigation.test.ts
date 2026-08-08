import assert from "node:assert/strict";
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
