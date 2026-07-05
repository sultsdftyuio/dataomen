"use client";

import React from "react";
import Link from "next/link";
import { Sparkles, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import UpgradeButton from "@/components/ui/UpgradeButton";
import type { WorkspaceEntitlements } from "@/lib/entitlements";

interface WorkspacePlanBadgeProps {
  entitlements: WorkspaceEntitlements;
}

export function WorkspacePlanBadge({ entitlements }: WorkspacePlanBadgeProps) {
  const { isPro, isTrialing, isPastDue, billingLabel, billingDescription } =
    entitlements as WorkspaceEntitlements & { isPastDue?: boolean };

  // Calculate past due status explicitly if not present on type
  const activePastDue =
    entitlements.planTier === "pro" &&
    entitlements.subscriptionStatus === "past_due";
  const activeCanceling =
    entitlements.planTier === "pro" &&
    entitlements.subscriptionStatus === "canceling";

  const badgeClassName = isPro
    ? isTrialing || activeCanceling
      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer transition-colors"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer transition-colors"
    : activePastDue
      ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer transition-colors"
      : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer transition-colors";

  const statusText = isTrialing ? "3-day Pro Trial" : billingLabel;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="focus:outline-none">
          <Badge variant="outline" className={badgeClassName}>
            {isTrialing && <Sparkles className="mr-1 h-3 w-3 text-amber-500" />}
            {activeCanceling && (
              <AlertCircle className="mr-1 h-3 w-3 text-amber-600" />
            )}
            {isPro && !isTrialing && !activeCanceling && (
              <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />
            )}
            {activePastDue && (
              <AlertCircle className="mr-1 h-3 w-3 text-rose-600" />
            )}
            {!isPro && !activePastDue && (
              <ShieldAlert className="mr-1 h-3 w-3 text-slate-500" />
            )}
            <span>{statusText}</span>
          </Badge>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-4 shadow-lg">
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold leading-none text-slate-900">
              Workspace Plan & Billing
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed pt-1">
              {billingDescription}
            </p>
          </div>

          <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
            {!isPro && !activePastDue && (
              <UpgradeButton className="w-full justify-center text-xs py-1.5" />
            )}

            {activePastDue && (
              <Link
                href="/settings"
                className="inline-flex h-8 w-full items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
              >
                Update Payment Method
              </Link>
            )}

            <Link
              href="/settings"
              className="text-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors py-1"
            >
              Manage Workspace Settings →
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
