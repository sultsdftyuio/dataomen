"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import UpgradeButton from "@/components/ui/UpgradeButton";
import type { WorkspaceEntitlements } from "@/lib/entitlements";

interface WorkspacePlanBadgeProps {
  entitlements: WorkspaceEntitlements;
}

function shortDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

/** One label per billing state, so a trial or a cancelled plan never reads as plain "Pro". */
function planStatus(entitlements: WorkspaceEntitlements): { tone: StatusTone; label: string } {
  const planName = entitlements.planTier.toLowerCase() === "enterprise" ? "Enterprise" : "Pro";
  if (entitlements.isPastDue) return { tone: "danger", label: "Payment failed" };
  if (entitlements.isCanceling) {
    const ends = shortDate(entitlements.currentPeriodEnd);
    return { tone: "warning", label: ends ? `${planName}, ends ${ends}` : `${planName}, cancelled` };
  }
  if (entitlements.isTrialing) {
    const ends = shortDate(entitlements.trialEndsAt);
    return { tone: "info", label: ends ? `Pro trial, ends ${ends}` : "Pro trial" };
  }
  if (entitlements.isPro) return { tone: "success", label: planName };
  return { tone: "neutral", label: "Free plan" };
}

export function WorkspacePlanBadge({ entitlements }: WorkspacePlanBadgeProps) {
  const { isPro, isPastDue, billingDescription } = entitlements;
  const status = planStatus(entitlements);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Plan and billing: ${status.label}`}
          className="relative inline-flex items-center gap-1 rounded-full text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
        >
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      {/* z-[70] = --z-overlay: the badge also lives in the mobile drawer
          (z-index 61), and the popover must open above it. */}
      <PopoverContent align="start" className="z-[70] w-80 max-w-[calc(100vw-2rem)] p-4 shadow-lg">
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <h2 className="text-sm leading-5 font-semibold text-foreground">
              Plan and billing
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {billingDescription}
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {!isPro && !isPastDue && (
              <UpgradeButton className="w-full justify-center" />
            )}

            {isPastDue && (
              <Link
                href="/settings#billing"
                className="inline-flex h-9 w-full items-center justify-center rounded-md bg-danger px-3 text-sm font-semibold text-white transition-colors hover:bg-danger/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Update payment method
              </Link>
            )}

            {!isPastDue && (
              <Link
                href="/settings#billing"
                className="inline-flex h-9 items-center justify-center rounded-md text-sm font-medium text-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Manage billing
              </Link>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
