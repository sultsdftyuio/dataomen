"use client";

import Link from "next/link";
import { CircleCheck, Search } from "lucide-react";

import type { BuyerDemandReportView } from "@/app/(dashboard)/dashboard/prospect-types";
import { EmailUpdatesNudge } from "@/components/prospects/email-updates-nudge";
import { Button } from "@/components/ui/button";
import { describeEmptyDiscovery } from "@/lib/discovery-outcome";
import { C } from "@/lib/tokens";

type EmptyQueueProps = {
  hasProfile: boolean;
  hasActiveFilters: boolean;
  screenedMatchCount: number;
  showingScreenedAudit: boolean;
  showingDone: boolean;
  doneCount: number;
  report: BuyerDemandReportView | null;
  onClearFilters: () => void;
  onOpenScreenedAudit: () => void;
  onOpenScanActivity: () => void;
  onOpenDone: () => void;
};

export function EmptyQueue({
  hasProfile,
  hasActiveFilters,
  screenedMatchCount,
  showingScreenedAudit,
  showingDone,
  doneCount,
  report,
  onClearFilters,
  onOpenScreenedAudit,
  onOpenScanActivity,
  onOpenDone,
}: EmptyQueueProps) {
  // Everything was handled: celebrate it and point at what happens next,
  // instead of the "nothing found" copy meant for an empty scan.
  const isCaughtUp = !showingScreenedAudit && !showingDone && !hasActiveFilters && hasProfile && doneCount > 0;

  if (isCaughtUp) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
        <span className="flex size-11 items-center justify-center rounded-xl" style={{ backgroundColor: C.greenPale, color: C.green }}>
          <CircleCheck className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-base font-semibold" style={{ color: C.navy }}>You&apos;re caught up</h2>
        <p className="mt-2 max-w-md text-sm leading-6" style={{ color: C.muted }}>
          New leads appear here after the next scan.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onOpenDone}>
          View {doneCount} done
        </Button>
        <EmailUpdatesNudge />
      </div>
    );
  }

  const outcome = showingScreenedAudit
    ? {
        title: "No screened-out records match these filters",
        detail: "Clear the filters or return to the inbox.",
      }
    : showingDone
      ? {
          title: hasActiveFilters ? "No done leads match these filters" : "Nothing marked done yet",
          detail: "Leads you mark done move here, out of your inbox.",
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
        {!showingScreenedAudit && !showingDone && !hasActiveFilters && screenedMatchCount > 0 ? (
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
