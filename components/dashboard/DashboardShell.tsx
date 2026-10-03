"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";

import { DashboardNavigation } from "./DashboardNavigation";
import { DashboardSearch } from "./DashboardSearch";
import { WorkspacePlanBadge } from "./WorkspacePlanBadge";
import LogoutButton from "./logout-button";
import Logo from "@/components/ui/logo";
import type { WorkspaceEntitlements } from "@/lib/entitlements";
import { dashboardNavigationItems } from "@/lib/dashboard-navigation";
import { workspaceDisplayName } from "@/lib/workspace/display-name";
import "./dashboard-shell.css";

type DashboardShellProps = {
  children: ReactNode;
  workspaceName: string;
  userName: string;
  userEmail: string;
  entitlements: WorkspaceEntitlements;
  assistedPilot: boolean;
};

export function DashboardShell({ children, workspaceName, userName, userEmail, entitlements, assistedPilot }: DashboardShellProps) {
  const displayWorkspaceName = workspaceDisplayName(workspaceName);
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const currentPage = pathname === "/dashboard/today"
    ? "Today's prospects"
    : dashboardNavigationItems.find((item) => item.href === pathname)?.label ?? "Workspace";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className={`arc-shell${collapsed ? " arc-shell--collapsed" : ""}`}>
      {mobileOpen ? <button className="arc-shell__scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} /> : null}
      <aside className={`arc-shell__sidebar${mobileOpen ? " arc-shell__sidebar--open" : ""}`}>
        <div className="arc-shell__brand">
          <Link href="/dashboard" aria-label="Arcli home"><Logo iconOnly={collapsed} /></Link>
          <button className="arc-shell__collapse" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        <Link className="arc-shell__workspace" href="/settings" title={displayWorkspaceName}>
          <span className="arc-shell__workspace-mark">{displayWorkspaceName.slice(0, 1).toUpperCase()}</span>
          <span className="arc-shell__workspace-copy"><strong>{displayWorkspaceName}</strong><small>{entitlements.isPro ? "Pro workspace" : "Free workspace"}</small></span>
        </Link>

        <DashboardNavigation variant="sidebar" isPro={entitlements.isPro} assistedPilot={assistedPilot} />

        <div className="arc-shell__sidebar-bottom">
          <div className="arc-shell__plan"><WorkspacePlanBadge entitlements={entitlements} /></div>
          <div className="arc-shell__user">
            <span className="arc-shell__avatar">{userName.slice(0, 1).toUpperCase()}</span>
            <span className="arc-shell__user-copy"><strong>{userName}</strong><small>{userEmail}</small></span>
            <LogoutButton />
          </div>
        </div>
      </aside>

      <div className="arc-shell__body">
        <header className="arc-shell__topbar">
          <button className="arc-shell__mobile-menu" type="button" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          <div className="arc-shell__breadcrumb"><span>{displayWorkspaceName}</span><span className="arc-shell__slash">/</span><strong>{currentPage}</strong></div>
          <button className="arc-shell__search" type="button" onClick={() => setSearchOpen(true)} aria-label="Search workspace pages">
            <Search size={15} /><span>Go to a page</span><kbd>Ctrl K</kbd>
          </button>
        </header>
        <main id="workspace-content" className="arc-shell__main">{children}</main>
        <div className="arc-shell__mobile-tabs"><DashboardNavigation compact isPro={entitlements.isPro} assistedPilot={assistedPilot} /></div>
      </div>

      <DashboardSearch open={searchOpen} onOpenChange={setSearchOpen} isPro={entitlements.isPro} assistedPilot={assistedPilot} />
    </div>
  );
}
