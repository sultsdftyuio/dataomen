"use client";

import Link from "next/link";
import { CircleCheck, FileText, Inbox, Radar, Search } from "lucide-react";

import type { LeadQueueFilter } from "@/app/(dashboard)/dashboard/lead-queue-filter";
import type { BuyerDemandReportView } from "@/app/(dashboard)/dashboard/prospect-types";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { EmailUpdatesNudge } from "@/components/prospects/email-updates-nudge";
import { Button } from "@/components/ui/button";
import { describeEmptyDiscovery } from "@/lib/discovery-outcome";

type EmptyQueueProps = {
  hasProfile: boolean;
  /** Search, match strength or source; sort is not a filter. */
  hasActiveFilters: boolean;
  query: string;
  view: LeadQueueFilter;
  /** Open leads plus open maybes, whatever the current view. */
  inboxCount: number;
  screenedMatchCount: number;
  doneCount: number;
  report: BuyerDemandReportView | null;
  onClearFilters: () => void;
  onShowInbox: () => void;
  onOpenScreenedAudit: () => void;
  onOpenScanActivity: () => void;
  onOpenDone: () => void;
};

/**
 * Each reason the list can be empty gets its own words. Load failures never
 * reach here: the loaders throw into the dashboard error boundary instead.
 */
export function EmptyQueue({
  hasProfile,
  hasActiveFilters,
  query,
  view,
  inboxCount,
  screenedMatchCount,
  doneCount,
  report,
  onClearFilters,
  onShowInbox,
  onOpenScreenedAudit,
  onOpenScanActivity,
  onOpenDone,
}: EmptyQueueProps) {
  const trimmedQuery = query.trim();
  const showingDone = view === "done";
  const showingScreenedAudit = view === "screened";

  if (hasActiveFilters) {
    return (
      <EmptyState
        variant="no-results"
        icon={Search}
        title={`No ${showingDone ? "done prospects" : showingScreenedAudit ? "screened-out records" : "prospects"} match these filters`}
        description={
          trimmedQuery
            ? `Nothing matches “${trimmedQuery}” with the current filters.`
            : "Try another source or a lower match strength."
        }
        clearFilters={
          <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  if (showingDone) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="Nothing marked done yet"
        description="Prospects you mark done move here, out of your inbox."
      />
    );
  }

  if (showingScreenedAudit) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing has been screened out"
        description="Conversations that don't pass review are kept here so you can check the decision."
      />
    );
  }

  // One bucket is empty but the inbox isn't: don't claim the person is done.
  if ((view === "leads" || view === "potential") && inboxCount > 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={view === "leads" ? "No open signals" : "No open maybes"}
        description={`${inboxCount} other ${inboxCount === 1 ? "prospect is" : "prospects are"} waiting in your inbox.`}
        action={
          <Button type="button" variant="outline" size="sm" onClick={onShowInbox}>
            Show inbox
          </Button>
        }
      />
    );
  }

  // Everything was handled: say so and point at what happens next, instead
  // of the "nothing found" copy meant for an empty scan.
  if (hasProfile && doneCount > 0) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6">
        <EmptyState
          className="p-0"
          icon={CircleCheck}
          title="You're caught up"
          description="New prospects appear here after the next scan."
          action={
            <Button type="button" variant="outline" size="sm" onClick={onOpenDone}>
              View {doneCount} done
            </Button>
          }
        />
        <EmailUpdatesNudge />
      </div>
    );
  }

  if (!hasProfile) {
    return (
      <EmptyState
        variant="never-used"
        icon={FileText}
        title="Your targeting brief needs more detail"
        description="Add who you sell to, the problem you solve and why you're different. Arcli uses these to find prospects."
        action={
          <Button asChild>
            <Link href="/dashboard/brief">Edit brief</Link>
          </Button>
        }
        className="m-4"
      />
    );
  }

  const outcome = describeEmptyDiscovery(report);

  return (
    <EmptyState
      variant={report ? "empty-for-now" : "never-used"}
      icon={report ? Inbox : Radar}
      title={outcome.title}
      description={outcome.detail}
      action={
        <Button type="button" variant="outline" size="sm" onClick={onOpenScanActivity}>
          View scan activity
        </Button>
      }
      secondaryAction={
        screenedMatchCount > 0 ? (
          <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onOpenScreenedAudit}>
            See {screenedMatchCount} screened out
          </Button>
        ) : null
      }
      className={report ? undefined : "m-4"}
    />
  );
}
