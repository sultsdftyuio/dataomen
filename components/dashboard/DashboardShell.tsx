"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";

import { DashboardNavigation } from "./DashboardNavigation";
import { DashboardSearch } from "./DashboardSearch";
import { WorkspacePlanBadge } from "./WorkspacePlanBadge";
import LogoutButton from "./logout-button";
import Logo from "@/components/ui/logo";
import type { WorkspaceEntitlements } from "@/lib/entitlements";
import { dashboardPageLabel } from "@/lib/dashboard-navigation";
import "./dashboard-shell.css";

type DashboardShellProps = {
  children: ReactNode;
  userName: string;
  userEmail: string;
  entitlements: WorkspaceEntitlements;
  assistedPilot: boolean;
};

const SIDEBAR_ID = "workspace-sidebar";
const MAIN_ID = "workspace-content";
// Matches the CSS breakpoint where the sidebar becomes a drawer.
const DESKTOP_QUERY = "(min-width: 768px)";

export function DashboardShell({ children, userName, userEmail, entitlements, assistedPilot }: DashboardShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const returnFocusToMenuRef = useRef(false);
  const currentPage = dashboardPageLabel(pathname, assistedPilot);
  const isPastDue = entitlements.isPastDue;

  // Focus moves back to the menu button after the close renders: until then
  // the body (and the button) is still inert and can't take focus.
  const closeDrawer = useCallback((returnFocus: boolean) => {
    returnFocusToMenuRef.current = returnFocus;
    setMobileOpen(false);
  }, []);

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

  // Close the drawer when the route changes (adjusting state during render
  // avoids an extra effect pass).
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setMobileOpen(false);
  }

  // While the drawer is open: Escape closes it and returns focus to the menu
  // button, focus starts on the drawer's close button, and widening past the
  // breakpoint closes it (the body is inert while it is open).
  useEffect(() => {
    if (!mobileOpen) {
      if (returnFocusToMenuRef.current) menuButtonRef.current?.focus();
      returnFocusToMenuRef.current = false;
      return;
    }
    drawerCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      // A popover or dialog opened from the drawer handles its own Escape.
      if (event.key === "Escape" && !event.defaultPrevented) closeDrawer(true);
    };
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onWiden = () => {
      if (desktop.matches) closeDrawer(false);
    };
    window.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onWiden);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onWiden);
    };
  }, [mobileOpen, closeDrawer]);

  return (
    <div className={`arc-shell${collapsed ? " arc-shell--collapsed" : ""}${mobileOpen ? " arc-shell--drawer-open" : ""}`}>
      <a className="skip-link" href={`#${MAIN_ID}`}>Skip to content</a>
      {mobileOpen ? <div className="arc-shell__scrim" aria-hidden="true" onClick={() => closeDrawer(true)} /> : null}
      {/* Below 768px this is a drawer. CSS hides it (visibility) while closed,
          which also takes it out of the tab order and the accessibility tree. */}
      <aside
        id={SIDEBAR_ID}
        aria-label="Workspace"
        className={`arc-shell__sidebar${mobileOpen ? " arc-shell__sidebar--open" : ""}`}
      >
        <div className="arc-shell__brand">
          <Link href="/dashboard" aria-label="Arcli home"><Logo iconOnly={collapsed} /></Link>
          <button className="arc-shell__collapse" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
          </button>
          <button ref={drawerCloseRef} className="arc-shell__drawer-close" type="button" onClick={() => closeDrawer(true)} aria-label="Close menu">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <DashboardNavigation variant="sidebar" isPro={entitlements.isPro} assistedPilot={assistedPilot} />

        <div className="arc-shell__sidebar-bottom">
          <div className={`arc-shell__plan${isPastDue ? " arc-shell__plan--alert" : ""}`}>
            <WorkspacePlanBadge entitlements={entitlements} />
            {isPastDue ? (
              <p className="arc-shell__plan-note">
                Your last payment failed. <Link href="/settings#billing">Update payment method</Link>
              </p>
            ) : null}
          </div>
          <div className="arc-shell__user">
            <span className="arc-shell__avatar" aria-hidden="true">{userName.slice(0, 1).toUpperCase()}</span>
            <span className="arc-shell__user-copy"><strong>{userName}</strong><small>{userEmail}</small></span>
            <LogoutButton iconOnly />
          </div>
        </div>
      </aside>

      <div className="arc-shell__body" inert={mobileOpen}>
        <header className="arc-shell__topbar">
          <button
            ref={menuButtonRef}
            className="arc-shell__mobile-menu"
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls={SIDEBAR_ID}
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={19} aria-hidden="true" />
          </button>
          <div className="arc-shell__page-label">{currentPage}</div>
          {isPastDue ? (
            <Link className="arc-shell__billing-alert" href="/settings#billing">
              <AlertCircle size={14} aria-hidden="true" />
              <span>Payment failed<span className="arc-shell__billing-alert-action">. Update payment method</span></span>
            </Link>
          ) : null}
          <button className="arc-shell__search" type="button" onClick={() => setSearchOpen(true)}>
            <Search size={15} aria-hidden="true" /><span>Go to a page</span><kbd aria-hidden="true">Ctrl K</kbd>
          </button>
        </header>
        <main id={MAIN_ID} tabIndex={-1} className="arc-shell__main">{children}</main>
        <div className="arc-shell__mobile-tabs"><DashboardNavigation compact isPro={entitlements.isPro} assistedPilot={assistedPilot} /></div>
      </div>

      <DashboardSearch open={searchOpen} onOpenChange={setSearchOpen} isPro={entitlements.isPro} assistedPilot={assistedPilot} />
    </div>
  );
}
