"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/ui/status-badge";
import type { WorkspaceEntitlements } from "@/lib/entitlements";
import { PlanBillingDetails, planStatus } from "./WorkspacePlanBadge";
import LogoutButton from "./logout-button";

type AccountMenuProps = {
  userName: string;
  userEmail: string;
  entitlements: WorkspaceEntitlements;
};

/**
 * The rail's account button. Who is signed in, the plan and sign-out live
 * behind it, so the rail itself only carries navigation. A failed payment
 * still shows on the rail as a dot, and as a banner above the page.
 */
export function AccountMenu({ userName, userEmail, entitlements }: AccountMenuProps) {
  const status = planStatus(entitlements);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="arc-rail__account"
          aria-label={`Account and plan: ${userName}, ${status.label}`}
        >
          <span className="arc-rail__avatar" aria-hidden="true">{userName.slice(0, 1).toUpperCase()}</span>
          {entitlements.isPastDue ? <span className="arc-rail__alert-dot" aria-hidden="true" /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" sideOffset={12} className="z-[70] w-80 max-w-[calc(100vw-2rem)] p-4 shadow-lg">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
              <p className="truncate text-sm text-muted-foreground">{userEmail}</p>
            </div>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>
          <PlanBillingDetails entitlements={entitlements} />
          <div className="border-t border-border pt-3">
            <LogoutButton />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
