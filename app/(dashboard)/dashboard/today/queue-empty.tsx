import Link from "next/link";
import { CircleCheck, Inbox, SearchX } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/button";

import { statusLabels, tierLabels, type StatusFilter, type TierFilter } from "./labels";

/** No deliveries at all yet: the whole desk is replaced by this. */
export function FirstDeliveryPending() {
  return (
    <EmptyState
      variant="never-used"
      icon={Inbox}
      title="Your first prospects are on the way"
      description="Each prospect is checked by hand against your targeting brief before it's delivered here. There's nothing for you to do until then."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard/brief">Review your targeting brief</Link>
        </Button>
      }
    />
  );
}

type QueueEmptyProps = {
  status: StatusFilter;
  tier: TierFilter;
  statusCounts: Record<StatusFilter, number>;
  onShowStatus: (status: StatusFilter) => void;
  onClearTier: () => void;
};

/** The list is empty for one of three reasons, and each gets its own message. */
export function QueueEmpty({ status, tier, statusCounts, onShowStatus, onClearTier }: QueueEmptyProps) {
  if (tier !== "all") {
    const where = status === "all" ? "" : ` in ${statusLabels[status]}`;
    return (
      <EmptyState
        variant="no-results"
        icon={SearchX}
        title={`No ${tierLabels[tier].toLowerCase()} prospects${where}`}
        description="The signal filter is hiding the rest of this list."
        clearFilters={
          <Button type="button" variant="outline" size="sm" onClick={onClearTier}>
            Show all signals
          </Button>
        }
      />
    );
  }

  if (status === "to_review") {
    const next: StatusFilter = statusCounts.pursuing > 0 ? "pursuing" : "all";
    return (
      <EmptyState
        icon={CircleCheck}
        title="You're caught up"
        description="You've given a verdict on every prospect delivered so far. New prospects appear here when they're ready."
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => onShowStatus(next)}>
            View {statusLabels[next].toLowerCase()} ({statusCounts[next]})
          </Button>
        }
      />
    );
  }

  const reviewAction =
    statusCounts.to_review > 0 ? (
      <Button type="button" variant="outline" size="sm" onClick={() => onShowStatus("to_review")}>
        Review prospects ({statusCounts.to_review})
      </Button>
    ) : undefined;

  return status === "pursuing" ? (
    <EmptyState
      title="No prospects marked worth contacting yet"
      description="Prospects you mark worth contacting, contacted or meeting booked collect here."
      action={reviewAction}
    />
  ) : (
    <EmptyState
      title="No passed prospects"
      description="Prospects you pass on collect here, with your reason. Your reasons help focus the next deliveries."
      action={reviewAction}
    />
  );
}
