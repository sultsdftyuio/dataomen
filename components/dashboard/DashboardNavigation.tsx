"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, type CSSProperties } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

import {
  dashboardNavigationItemsFor,
  isDashboardNavigationItemActive,
} from "@/lib/dashboard-navigation";
import { PRO_PRICE_NOTE } from "@/lib/entitlements";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import UpgradeButton from "@/components/ui/UpgradeButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArcAccountsIcon,
  ArcBriefIcon,
  ArcConfirmedIcon,
  ArcGroupsIcon,
  ArcLockIcon,
  ArcProspectsIcon,
  ArcSettingsIcon,
} from "./arc-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ICONS: Record<string, typeof ArcProspectsIcon> = {
  "/dashboard": ArcProspectsIcon,
  "/dashboard/today": ArcConfirmedIcon,
  "/dashboard/watchlists": ArcGroupsIcon,
  "/dashboard/brief": ArcBriefIcon,
  "/dashboard/targets": ArcAccountsIcon,
  "/settings": ArcSettingsIcon,
};

// Settings sits at the bottom of the rail, apart from the product pages.
const RAIL_FOOTER_HREF = "/settings";

type DashboardNavigationProps = {
  compact?: boolean;
  /**
   * "rail": desktop icon-only rail on the dark navy-blue surface, labels in
   * tooltips. "drawer": the same dark surface with labels, for the mobile
   * menu. Without a variant: the light horizontal or compact tab layout.
   */
  variant?: "rail" | "drawer";
  isPro: boolean;
  assistedPilot?: boolean;
};

export function DashboardNavigation({
  compact = false,
  variant,
  isPro,
  assistedPilot = false,
}: DashboardNavigationProps) {
  const pathname = usePathname();
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const onDarkSurface = variant === "rail" || variant === "drawer";
  // The mobile tab bar leaves Settings to the menu drawer so the remaining
  // tabs have room for whole labels.
  const items = dashboardNavigationItemsFor(assistedPilot).filter(
    (item) => !compact || item.href !== "/settings",
  );

  const navigationItemClassName = (href: string) => {
    if (variant === "rail") {
      return cn("arc-rail-nav__item", href === RAIL_FOOTER_HREF && "arc-rail-nav__item--footer");
    }
    if (variant === "drawer") return "arc-drawer-nav__item";
    return cn(
      "flex items-center rounded-md bg-[var(--nav-background)] text-[13px] font-semibold text-[var(--nav-foreground)] transition-colors hover:bg-[var(--nav-hover-background)] hover:text-[var(--nav-hover-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      compact
        ? "h-12 flex-col justify-center gap-0.5 px-0.5 text-[11px] font-medium"
        : "h-9 shrink-0 gap-1.5 px-3",
    );
  };

  // The dark variants are styled in dashboard-shell.css; only the light
  // layouts set colours here.
  const navigationItemStyle = (isActive: boolean) =>
    onDarkSurface
      ? undefined
      : ({
          "--nav-background": isActive ? C.bluePale : "transparent",
          "--nav-foreground": isActive ? C.blue : C.muted,
          "--nav-hover-background": isActive ? C.bluePale : C.blueTint,
          "--nav-hover-foreground": C.blue,
        }) as CSSProperties;

  const navClassName = compact
    ? "grid w-full items-center"
    : variant === "rail"
      ? "arc-rail-nav"
      : variant === "drawer"
        ? "arc-drawer-nav"
        : "flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]";

  return (
    <>
      <nav
        aria-label="Product navigation"
        style={compact ? { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` } : undefined}
        className={navClassName}
      >
        {items.map((item) => {
          const isActive = isDashboardNavigationItemActive(pathname, item.href);
          const isLocked = !isPro && item.href === "/dashboard/watchlists";
          const Icon = isLocked ? ArcLockIcon : ICONS[item.href];
          const label = compact ? item.shortLabel ?? item.label : item.label;
          // On the dark rail the active page's arc lights up in the brand's
          // light blue, echoing the logo.
          const iconAccent = onDarkSurface && isActive ? "var(--rail-accent)" : "currentColor";
          const iconSize = variant === "rail" ? 20 : 16;
          // The rail hides labels visually; they stay as accessible names.
          const labelClassName = variant === "rail"
            ? "sr-only"
            : compact ? "max-w-full truncate" : "inline";

          const control = isLocked ? (
            <button
              type="button"
              onClick={() => setIsUpgradeOpen(true)}
              aria-haspopup="dialog"
              title={variant === "rail" ? undefined : `${item.description} Available on Pro.`}
              className={navigationItemClassName(item.href)}
              style={navigationItemStyle(false)}
            >
              <Icon size={iconSize} />
              <span className={labelClassName}>{label}</span>
            </button>
          ) : (
            <Link
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              title={variant === "rail" ? undefined : item.description}
              className={navigationItemClassName(item.href)}
              style={navigationItemStyle(isActive)}
            >
              <Icon size={iconSize} accent={iconAccent} />
              <span className={labelClassName}>{label}</span>
            </Link>
          );

          if (variant !== "rail") return <Fragment key={item.href}>{control}</Fragment>;

          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{control}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                {isLocked ? `${label} (Pro)` : label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <Dialog open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen}>
        <DialogContent className="border-border bg-card p-0 sm:max-w-md">
          <div className="overflow-hidden rounded-lg">
            <div className="px-6 pb-5 pt-6">
              <DialogHeader className="text-left">
                <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-blue-pale px-2.5 py-1 text-xs font-semibold" style={{ color: C.blue }}>
                  <Sparkles className="size-3" aria-hidden="true" /> Pro signal desk
                </div>
                <DialogTitle className="mt-3 text-xl leading-7 font-semibold" style={{ color: C.navy }}>
                  Review the evidence behind a match.
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
                  Buyer groups are available on Pro, alongside source-linked conversations and reply drafts when relevant matches are found.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="space-y-4 px-6 pb-6 pt-5">
              <ul className="grid gap-2 text-sm font-semibold" style={{ color: C.navy }}>
                {[
                  "Source-linked conversations",
                  "Why they fit",
                  "Reply drafts",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4" style={{ color: C.green }} aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="space-y-3 border-t pt-4" style={{ borderColor: C.rule }}>
                <p className="text-xs leading-5" style={{ color: C.navySoft }}>{PRO_PRICE_NOTE}</p>
                <UpgradeButton className="w-full justify-center" />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
