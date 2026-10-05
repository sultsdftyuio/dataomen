"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { retryServiceProfileEmbedding } from "@/app/(dashboard)/dashboard/actions";
import type { ProfileHealthIssue } from "@/app/(dashboard)/dashboard/profile-health";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";

type ProfileHealthBannerProps = {
  issue: ProfileHealthIssue;
  serviceProfileId: string | null;
  isRebuildPending: boolean;
  onRebuildProfile: () => void;
  onRetried: () => void;
};

/** Blocking-problem banner with the single action that unblocks discovery. */
export function ProfileHealthBanner({
  issue,
  serviceProfileId,
  isRebuildPending,
  onRebuildProfile,
  onRetried,
}: ProfileHealthBannerProps) {
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [isRetryPending, startRetryTransition] = useTransition();
  const isPending = isRetryPending || isRebuildPending;

  const retryEmbedding = () => {
    setRetryMessage(null);
    startRetryTransition(async () => {
      try {
        const result = await retryServiceProfileEmbedding(serviceProfileId);
        setRetryMessage(result.message);
        if (result.ok) onRetried();
      } catch {
        setRetryMessage("Could not restart matching. Please try again.");
      }
    });
  };

  return (
    <section
      role="alert"
      className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
      style={{ borderColor: C.amber, backgroundColor: C.amberPale }}
    >
      <AlertTriangle className="size-4 shrink-0" style={{ color: C.amber }} aria-hidden="true" />
      <div className="min-w-0 flex-1" title={issue.technicalDetail}>
        <p className="text-sm font-semibold" style={{ color: C.navy }}>{issue.title}</p>
        <p className="text-xs leading-5" style={{ color: C.navySoft }}>
          {retryMessage ?? issue.detail}
        </p>
      </div>
      {issue.action === "edit_brief" ? (
        <Button asChild size="sm" variant="outline" className="bg-white">
          <Link href="/dashboard/brief">Edit brief</Link>
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="bg-white"
          disabled={isPending}
          onClick={issue.action === "rebuild_profile" ? onRebuildProfile : retryEmbedding}
        >
          <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} aria-hidden="true" />
          {isPending ? "Retrying..." : issue.action === "rebuild_profile" ? "Retry crawl" : "Retry"}
        </Button>
      )}
    </section>
  );
}
