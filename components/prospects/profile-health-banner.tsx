"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { retryServiceProfileEmbedding } from "@/app/(dashboard)/dashboard/actions";
import type { ProfileHealthIssue } from "@/app/(dashboard)/dashboard/profile-health";
import type { ProspectActionResult } from "@/app/(dashboard)/dashboard/prospect-types";
import { cn } from "@/lib/utils";

type ProfileHealthBannerProps = {
  issue: ProfileHealthIssue;
  serviceProfileId: string | null;
  isRebuildPending: boolean;
  onRebuildProfile: () => void;
  onRetried: () => void;
};

const RETRY_FAILED: ProspectActionResult = {
  ok: false,
  message: "Couldn't restart matching. Check your connection and try again.",
};

/** Blocking-problem banner with the single action that unblocks discovery. */
export function ProfileHealthBanner({
  issue,
  serviceProfileId,
  isRebuildPending,
  onRebuildProfile,
  onRetried,
}: ProfileHealthBannerProps) {
  const [retryResult, setRetryResult] = useState<ProspectActionResult | null>(null);
  const [isRetryPending, startRetryTransition] = useTransition();
  const isPending = isRetryPending || isRebuildPending;

  const retryEmbedding = () => {
    setRetryResult(null);
    startRetryTransition(async () => {
      try {
        const result = await retryServiceProfileEmbedding(serviceProfileId);
        setRetryResult(result.ok ? result : RETRY_FAILED);
        if (result.ok) onRetried();
      } catch {
        setRetryResult(RETRY_FAILED);
      }
    });
  };

  return (
    <section
      role="alert"
      className="flex shrink-0 flex-col gap-3 rounded-lg border border-warning/30 bg-warning-pale px-4 py-3 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5" title={issue.technicalDetail}>
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{issue.title}</p>
          <p className={cn("text-sm leading-5", retryResult && !retryResult.ok ? "text-danger" : "text-navy-soft")}>
            {retryResult?.message ?? issue.detail}
          </p>
        </div>
      </div>
      {issue.action === "edit_brief" ? (
        <Button asChild size="sm" variant="outline" className="w-fit">
          <Link href="/dashboard/brief">Edit brief</Link>
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit"
          disabled={isPending}
          onClick={issue.action === "rebuild_profile" ? onRebuildProfile : retryEmbedding}
        >
          <RefreshCw className={cn("size-3.5", isPending && "motion-safe:animate-spin")} aria-hidden="true" />
          {isPending
            ? "Retrying…"
            : issue.action === "rebuild_profile"
              ? "Read website again"
              : "Restart matching"}
        </Button>
      )}
    </section>
  );
}
