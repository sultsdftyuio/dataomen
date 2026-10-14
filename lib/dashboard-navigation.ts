export type DashboardNavigationItem = {
  href: string;
  label: string;
  /** Used where space is tight (the mobile tab bar). Defaults to `label`. */
  shortLabel?: string;
  description: string;
};

/**
 * The primary product workflows. Keep this list independent of React so the
 * shell, mobile navigation, and route-focused tests all use the same contract.
 */
export const dashboardNavigationItems: readonly DashboardNavigationItem[] = [
  {
    href: "/dashboard",
    label: "Prospects",
    description: "Review the conversations that need a next step.",
  },
  {
    href: "/dashboard/brief",
    label: "Targeting",
    description: "Define who to look for and the signals that matter.",
  },
  {
    href: "/dashboard/targets",
    label: "Targets",
    description: "Research accounts, builders, and projects before intent is explicit.",
  },
  {
    href: "/dashboard/watchlists",
    label: "Buyer groups",
    description: "Focus discovery on a specific audience and problem.",
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Manage account, workspace, and billing settings.",
  },
];

/** Only shown to workspaces enrolled in the assisted prospect pilot. */
export const todayNavigationItem: DashboardNavigationItem = {
  href: "/dashboard/today",
  label: "Today's prospects",
  shortLabel: "Today",
  description: "Review delivered, evidence-backed prospects.",
};

/** The navigation list for a workspace, in display order. */
export function dashboardNavigationItemsFor(
  assistedPilot: boolean,
): readonly DashboardNavigationItem[] {
  return assistedPilot
    ? [dashboardNavigationItems[0], todayNavigationItem, ...dashboardNavigationItems.slice(1)]
    : dashboardNavigationItems;
}

// Routes that belong to a navigation item without sharing its URL prefix.
// /dashboard/discovery is where Prospects sends people while a scan runs.
const ROUTE_OWNERS: Readonly<Record<string, string>> = {
  "/dashboard/discovery": "/dashboard",
};

export function isDashboardNavigationItemActive(
  pathname: string | null,
  href: string,
): boolean {
  if (!pathname) return false;
  if (ROUTE_OWNERS[pathname] === href) return true;

  // The overview is the dashboard index, not the parent state for every
  // dashboard sub-page. Other workflow routes may legitimately have children
  // (for example, /settings/billing).
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`))
  );
}

/** The topbar label for a route: the name of the nav item that owns it. */
export function dashboardPageLabel(pathname: string | null, assistedPilot: boolean): string {
  const items = dashboardNavigationItemsFor(assistedPilot);
  return items.find((item) => isDashboardNavigationItemActive(pathname, item.href))?.label ?? "Workspace";
}
