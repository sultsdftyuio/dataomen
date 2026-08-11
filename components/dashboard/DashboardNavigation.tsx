"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type CSSProperties } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  LockKeyhole,
  Settings2,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  dashboardNavigationItems,
  isDashboardNavigationItemActive,
} from "@/lib/dashboard-navigation";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import UpgradeButton from "@/components/ui/UpgradeButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": ClipboardList,
  "/dashboard/watchlists": UsersRound,
  "/dashboard/brief": BriefcaseBusiness,
  "/settings": Settings2,
};

type DashboardNavigationProps = {
  compact?: boolean;
  isPro: boolean;
};

export function DashboardNavigation({
  compact = false,
  isPro,
}: DashboardNavigationProps) {
  const pathname = usePathname();
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  const navigationItemClassName = (isActive: boolean) =>
    cn(
      "flex items-center rounded-md bg-[var(--nav-background)] text-xs font-semibold text-[var(--nav-foreground)] transition-colors hover:bg-[var(--nav-hover-background)] hover:text-[var(--nav-hover-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6EBF] focus-visible:ring-offset-2",
      compact
        ? "h-12 flex-col justify-center gap-0.5 px-1 text-[10px]"
        : "h-9 shrink-0 gap-1.5 px-3",
    );

  const navigationItemStyle = (isActive: boolean) =>
    ({
      "--nav-background": isActive ? C.bluePale : "transparent",
      "--nav-foreground": isActive ? C.blue : C.muted,
      "--nav-hover-background": isActive ? C.bluePale : C.blueTint,
      "--nav-hover-foreground": C.blue,
    }) as CSSProperties;

  return (
    <>
      <nav
        aria-label="Product navigation"
        className={
          compact
            ? "grid w-full grid-cols-4 items-center"
            : "flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
        }
      >
        {dashboardNavigationItems.map((item) => {
          const Icon = ICONS[item.href];
          const isActive = isDashboardNavigationItemActive(pathname, item.href);
          const isLocked = !isPro && item.href === "/dashboard/watchlists";

          if (isLocked) {
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => setIsUpgradeOpen(true)}
                aria-haspopup="dialog"
                title={`${item.description} Available on Pro.`}
                className={navigationItemClassName(false)}
                style={navigationItemStyle(false)}
              >
                <LockKeyhole className="size-4" aria-hidden="true" />
                <span className={compact ? "max-w-full truncate" : "inline"}>
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              title={item.description}
              className={navigationItemClassName(isActive)}
              style={navigationItemStyle(isActive)}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className={compact ? "max-w-full truncate" : "inline"}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <Dialog open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen}>
        <DialogContent className="max-w-md border-[#B8DCF8] bg-white p-0">
          <div className="overflow-hidden rounded-lg">
            <div className="relative px-6 pb-5 pt-6" style={{ background: "linear-gradient(135deg, #F4FAFF 0%, #FFFFFF 82%)" }}>
              <div className="absolute -right-10 -top-10 size-32 rounded-full bg-[#DCEEFF]" aria-hidden="true" />
              <DialogHeader className="relative text-left">
                <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#EAF4FE] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: C.blue }}>
                  <Sparkles className="size-3" aria-hidden="true" /> Pro prospect desk
                </div>
                <DialogTitle className="pfd mt-3 text-3xl leading-none" style={{ color: C.navy }}>
                  See the people behind the signal.
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
                  Buyer groups are available on Pro, alongside full match evidence and reply drafts.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="space-y-4 px-6 pb-6 pt-5">
              <ul className="grid gap-2 text-sm font-semibold" style={{ color: C.navy }}>
                {[
                  "Verified matches",
                  "Why they fit",
                  "Reply drafts",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4" style={{ color: C.green }} aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: C.rule }}>
                <p className="text-xs font-semibold" style={{ color: C.navySoft }}>$35/month &middot; cancel any time</p>
                <UpgradeButton />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
