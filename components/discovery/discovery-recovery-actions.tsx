"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { retryServiceProfileEmbedding } from "@/app/(dashboard)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DiscoveryRecovery } from "./discovery-status";

type DiscoveryRecoveryActionsProps = {
  recovery: DiscoveryRecovery;
  serviceProfileId: string | null;
  /** The step the scan stopped at; a stopped search points to the brief instead. */
  failedStep?: number;
};

const RETRY_FAILED =
  "Couldn't restart your targeting brief. Try again in a minute, or open Prospects to retry from there.";

/**
 * One primary action per failure, chosen for what can actually fix it, plus
 * a quiet secondary. "Open Prospects" is never offered for a stalled crawl:
 * Prospects sends people back here while a crawl is still marked active.
 */
export function DiscoveryRecoveryActions({
  recovery,
  serviceProfileId,
  failedStep,
}: DiscoveryRecoveryActionsProps) {
  const router = useRouter();
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isRetrying, startRetry] = useTransition();
  const [isChecking, startCheck] = useTransition();

  const retryBrief = () => {
    setRetryError(null);
    startRetry(async () => {
      try {
        const result = await retryServiceProfileEmbedding(serviceProfileId);
        if (result.ok) router.refresh();
        else setRetryError(RETRY_FAILED);
      } catch {
        setRetryError(RETRY_FAILED);
      }
    });
  };

  const checkAgain = () => startCheck(() => router.refresh());

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {recovery === "retry-brief" ? (
          <Button type="button" onClick={retryBrief} disabled={isRetrying}>
            <RefreshCw className={cn("size-4", isRetrying && "motion-safe:animate-spin")} aria-hidden="true" />
            {isRetrying ? "Preparing brief…" : "Prepare brief again"}
          </Button>
        ) : null}
        {recovery === "check-again" ? (
          <Button type="button" onClick={checkAgain} disabled={isChecking}>
            <RefreshCw className={cn("size-4", isChecking && "motion-safe:animate-spin")} aria-hidden="true" />
            {isChecking ? "Checking…" : "Check progress now"}
          </Button>
        ) : null}
        {recovery === "check-website" ? (
          <Button asChild>
            <Link href="/settings">Check website address</Link>
          </Button>
        ) : null}
        {recovery === "open-prospects" ? (
          <Button asChild>
            <Link href="/dashboard">Open Prospects</Link>
          </Button>
        ) : null}

        {recovery === "open-prospects" && failedStep === 2 ? (
          <Button asChild variant="outline">
            <Link href="/dashboard/brief">Review targeting brief</Link>
          </Button>
        ) : recovery === "check-again" || recovery === "open-prospects" ? (
          <Button asChild variant="outline">
            <Link href="/settings">Check website address</Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/dashboard">Open Prospects</Link>
          </Button>
        )}
      </div>
      {retryError ? (
        <p role="alert" className="mt-2 text-sm leading-5 text-danger">
          {retryError}
        </p>
      ) : null}
    </div>
  );
}
