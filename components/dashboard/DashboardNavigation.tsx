"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  Settings2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  dashboardNavigationItems,
  isDashboardNavigationItemActive,
} from "@/lib/dashboard-navigation";
import { C } from "@/lib/tokens";

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": ClipboardList,
  "/dashboard/watchlists": UsersRound,
  "/dashboard/brief": BriefcaseBusiness,
  "/dashboard/research": BarChart3,
  "/settings": Settings2,
};

export function DashboardNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Product navigation"
      className="border-b px-4 sm:px-6 lg:px-8"
      style={{ borderColor: C.navyMid, backgroundColor: C.navy }}
    >
      <div className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
        {dashboardNavigationItems.map((item) => {
          const Icon = ICONS[item.href];
          const isActive = isDashboardNavigationItemActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              title={item.description}
              className="flex shrink-0 items-center gap-2 rounded-md bg-[var(--nav-background)] px-3 py-2 text-sm font-semibold text-[var(--nav-foreground)] transition-colors hover:bg-[var(--nav-hover-background)] hover:text-[var(--nav-hover-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1628]"
              style={
                {
                  "--nav-background": isActive ? C.blue : "transparent",
                  "--nav-foreground": isActive ? C.white : C.faint,
                  "--nav-hover-background": isActive ? C.blue : C.navyMid,
                  "--nav-hover-foreground": C.white,
                } as CSSProperties
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
