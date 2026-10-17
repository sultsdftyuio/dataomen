"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, Menu, X } from "lucide-react";

import { AccountMenu } from "./AccountMenu";
import { ArcLogoIcon } from "./arc-icons";
import { DashboardNavigation } from "./DashboardNavigation";
import { WorkspacePlanBadge } from "./WorkspacePlanBadge";
import LogoutButton from "./logout-button";
import { Toaster } from "@/components/ui/toaster";
import type { WorkspaceEntitlements } from "@/lib/entitlements";
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const returnFocusToMenuRef = useRef(false);
  const isPastDue = entitlements.isPastDue;

  // Focus moves back to the menu button after the close renders: until then
  // the body (and the button) is still inert and can't take focus.
  const closeDrawer = useCallback((returnFocus: boolean) => {
    returnFocusToMenuRef.current = returnFocus;
    setMobileOpen(false);
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
    <>
      <div className={`arc-shell${mobileOpen ? " arc-shell--drawer-open" : ""}`}>
        <a className="skip-link" href={`#${MAIN_ID}`}>Skip to content</a>
        {mobileOpen ? <div className="arc-shell__scrim" aria-hidden="true" onClick={() => closeDrawer(true)} /> : null}

        {/* Desktop: an icon rail on the navy-blue surface. Page names live in
            tooltips and stay as accessible names. Hidden below 768px. */}
        <aside aria-label="Workspace" className="arc-rail">
          <RailArcs />
          <Link href="/dashboard" className="arc-rail__logo" aria-label="Arcli home">
            <ArcLogoIcon size={28} accent="var(--rail-accent)" />
          </Link>
          <span className="arc-rail__divider" aria-hidden="true" />
          <DashboardNavigation variant="rail" isPro={entitlements.isPro} assistedPilot={assistedPilot} />
          <AccountMenu userName={userName} userEmail={userEmail} entitlements={entitlements} />
        </aside>

        {/* Below 768px the menu is a drawer on the same surface, with labels.
            CSS hides it (visibility) while closed, which also takes it out of
            the tab order and the accessibility tree. */}
        <aside
          id={SIDEBAR_ID}
          aria-label="Workspace menu"
          className={`arc-drawer${mobileOpen ? " arc-drawer--open" : ""}`}
        >
          <div className="arc-drawer__brand">
            <Link href="/dashboard" className="arc-drawer__home" aria-label="Arcli home">
              <ArcLogoIcon size={26} accent="var(--rail-accent)" />
              <span aria-hidden="true">Arcli</span>
            </Link>
            <button ref={drawerCloseRef} className="arc-drawer__close" type="button" onClick={() => closeDrawer(true)} aria-label="Close menu">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <DashboardNavigation variant="drawer" isPro={entitlements.isPro} assistedPilot={assistedPilot} />

          <div className="arc-drawer__bottom">
            <WorkspacePlanBadge entitlements={entitlements} />
            <div className="arc-drawer__user">
              <span className="arc-rail__avatar" aria-hidden="true">{userName.slice(0, 1).toUpperCase()}</span>
              <span className="arc-drawer__user-copy"><strong>{userName}</strong><small>{userEmail}</small></span>
              <LogoutButton iconOnly />
            </div>
          </div>
        </aside>

        <div className="arc-shell__body" inert={mobileOpen}>
          {/* Phones only: the rail is hidden, so this bar opens the drawer. */}
          <header className="arc-shell__topbar">
            <button
              ref={menuButtonRef}
              className="arc-shell__icon-button"
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              aria-controls={SIDEBAR_ID}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={19} aria-hidden="true" />
            </button>
            <Link href="/dashboard" className="arc-shell__topbar-home" aria-label="Arcli home">
              <ArcLogoIcon size={24} accent="var(--rail-accent)" />
            </Link>
          </header>
          {isPastDue ? (
            <Link className="arc-shell__billing-alert" href="/settings#billing">
              <AlertCircle size={15} aria-hidden="true" />
              <span>Your last payment failed. Update payment method</span>
            </Link>
          ) : null}
          <main id={MAIN_ID} tabIndex={-1} className="arc-shell__main">{children}</main>
          <div className="arc-shell__mobile-tabs"><DashboardNavigation compact isPro={entitlements.isPro} assistedPilot={assistedPilot} /></div>
        </div>
      </div>
      {/* Mounted here, not in the layout: see app/(dashboard)/layout.tsx. */}
      <Toaster />
    </>
  );
}

/**
 * The logo's three arcs, whole and centred in the rail above Settings. Drawn
 * at their real size (64px, 1.5px strokes) rather than scaled, so each arc
 * stays crisp and none is cut by the rail's edge.
 */
function RailArcs() {
  return (
    <svg className="arc-rail__arcs" width="64" height="34" viewBox="0 0 64 34" fill="none" aria-hidden="true" focusable="false">
      <path d="M2 33a30 30 0 0 1 60 0" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 33a22 22 0 0 1 44 0" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18 33a14 14 0 0 1 28 0" stroke="var(--rail-accent)" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
