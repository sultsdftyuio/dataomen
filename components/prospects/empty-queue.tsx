"use client";

import Link from "next/link";
import { Search } from "lucide-react";

import type { BuyerDemandReportView } from "@/app/(dashboard)/dashboard/prospect-types";
import { Button } from "@/components/ui/button";
import { describeEmptyDiscovery } from "@/lib/discovery-outcome";
import { C } from "@/lib/tokens";

type EmptyQueueProps = {
  hasProfile: boolean;
  hasActiveFilters: boolean;
  screenedMatchCount: number;
  showingScreenedAudit: boolean;
  report: BuyerDemandReportView | null;
  onClearFilters: () => void;
  onOpenScreenedAudit: () => void;
  onOpenScanActivity: () => void;
};

export function EmptyQueue({
  hasProfile,
  hasActiveFilters,
  screenedMatchCount,
  showingScreenedAudit,
  report,
  onClearFilters,
  onOpenScreenedAudit,
  onOpenScanActivity,
}: EmptyQueueProps) {
  const outcome = showingScreenedAudit
    ? {
        title: "No screened-out records match these filters",
        detail: "Clear the filters or return to the review queue.",
      }
    : hasActiveFilters
      ? {
          title: "No signals match these filters",
          detail: "Clear the filters to see everything in your current queue.",
        }
      : !hasProfile
        ? {
            title: "Your matching brief needs more detail",
            detail: "Add the buyer, problem, and value proposition before expecting reviewable conversations.",
          }
        : describeEmptyDiscovery(report);

  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl" style={{ backgroundColor: C.bluePale, color: C.blue }}>
        <Search className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold" style={{ color: C.navy }}>{outcome.title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6" style={{ color: C.muted }}>{outcome.detail}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {hasActiveFilters ? (
          <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        ) : null}
        {!showingScreenedAudit && !hasActiveFilters && screenedMatchCount > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={onOpenScreenedAudit}>
            View {screenedMatchCount} screened-out {screenedMatchCount === 1 ? "record" : "records"}
          </Button>
        ) : null}
        {hasProfile ? (
          <Button type="button" variant="outline" size="sm" onClick={onOpenScanActivity}>
            View scan activity
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm"><Link href="/dashboard/brief">Edit targeting</Link></Button>
        )}
      </div>
    </div>
  );
}
