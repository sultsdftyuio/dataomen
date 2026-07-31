export type DashboardNavigationItem = {
  href: string;
  label: string;
  description: string;
};

/**
 * The primary product workflows. Keep this list independent of React so the
 * shell, mobile navigation, and route-focused tests all use the same contract.
 */
export const dashboardNavigationItems: readonly DashboardNavigationItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    description: "Review the conversations that need a next step.",
  },
  {
    href: "/dashboard/watchlists",
    label: "Buyer groups",
    description: "Focus discovery on a specific audience and problem.",
  },
  {
    href: "/dashboard/brief",
    label: "Matching brief",
    description: "Refine who you want to reach and what they need.",
  },
  {
    href: "/dashboard/research",
    label: "Research",
    description: "Learn from verified buyer language and recurring themes.",
  },
  {
    href: "/settings",
    label: "Workspace",
    description: "Manage workspace details and billing.",
  },
];

export function isDashboardNavigationItemActive(
  pathname: string | null,
  href: string,
): boolean {
  if (!pathname) return false;

  // The overview is the dashboard index, not the parent state for every
  // dashboard sub-page. Other workflow routes may legitimately have children
  // (for example, /settings/billing).
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(`${href}/`))
  );
}
