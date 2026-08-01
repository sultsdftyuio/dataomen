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
      className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
    >
      {dashboardNavigationItems.map((item) => {
        const Icon = ICONS[item.href];
        const isActive = isDashboardNavigationItemActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            title={item.description}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[var(--nav-background)] px-3 text-xs font-semibold text-[var(--nav-foreground)] transition-colors hover:bg-[var(--nav-hover-background)] hover:text-[var(--nav-hover-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF] focus-visible:ring-offset-2"
            style={
              {
                "--nav-background": isActive ? C.bluePale : "transparent",
                "--nav-foreground": isActive ? C.blue : C.muted,
                "--nav-hover-background": isActive ? C.bluePale : C.blueTint,
                "--nav-hover-foreground": C.blue,
              } as CSSProperties
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="hidden lg:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
