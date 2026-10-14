"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type {
  EntityResearchAction,
  EntityResearchRunView,
  ProspectActionResult,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { ActionNotice } from "./target-action-notice";
import { formatTargetDateTime } from "./target-format";

type ResearchOperation = "candidate_generation" | "evidence_collection";

// Research runs on a worker for minutes, not seconds. Refreshing the server
// data on a slow interval shows results without a manual reload.
const RUNNING_REFRESH_MS = 30_000;

const RUN_STATUS: Record<EntityResearchRunView["status"], { label: string; tone: StatusTone }> = {
  queued: { label: "Queued", tone: "progress" },
  running: { label: "Running", tone: "progress" },
  completed: { label: "Finished", tone: "success" },
  partial: { label: "Partly finished", tone: "warning" },
  failed: { label: "Didn't finish", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  skipped: { label: "Skipped", tone: "neutral" },
};

function runInProgress(run: EntityResearchRunView | undefined): boolean {
  return run?.status === "queued" || run?.status === "running";
}

function RunStatus({ run }: { run: EntityResearchRunView | undefined }) {
  if (!run) return null;
  const status = RUN_STATUS[run.status];
  const when = formatTargetDateTime(run.completedAt ?? run.startedAt ?? run.createdAt);

  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
      <span className="sr-only">Latest request:</span>
      <StatusBadge tone={status.tone} size="compact">
        {status.label}
      </StatusBadge>
      {when ? <span>{when}</span> : null}
      {run.status === "failed" ? <span>Try again.</span> : null}
      {run.status === "skipped" ? <span>Your targeting brief changed before it ran.</span> : null}
    </p>
  );
}

function ResearchTask({
  title,
  description,
  run,
  buttonLabel,
  disabled,
  pending,
  onRequest,
}: {
  title: string;
  description: string;
  run: EntityResearchRunView | undefined;
  buttonLabel: string;
  disabled: boolean;
  pending: boolean;
  onRequest: () => void;
}) {
  const inProgress = runInProgress(run);

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 max-w-[68ch]">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        <RunStatus run={run} />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        // A queued or running request can't be requested again; the
        // button says why instead of silently doing nothing.
        disabled={disabled || pending || inProgress}
        className="self-start"
        onClick={onRequest}
      >
        {pending ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : null}
        {pending ? "Starting…" : inProgress ? "Already running" : buttonLabel}
      </Button>
    </div>
  );
}

/**
 * Explicit, customer-visible handoffs for the entity-first workflows. The
 * browser supplies no seed, URL, target, tenant, profile, provider filter, or
 * query: each server action resolves that bounded scope immediately before it
 * calls the trusted worker API. It is a collapsed disclosure so the target
 * list stays near the top of the page; it opens by default only when there is
 * nothing to review yet.
 */
export function EntityResearchControls({
  candidateGenerationEnabled,
  evidenceResearchEnabled,
  hasApprovedBrief,
  seedCount,
  eligibleTargetCount,
  candidateGenerationRun,
  evidenceCollectionRun,
  onGenerateTargets,
  onResearchEvidence,
}: {
  candidateGenerationEnabled: boolean;
  evidenceResearchEnabled: boolean;
  hasApprovedBrief: boolean;
  seedCount: number;
  eligibleTargetCount: number;
  candidateGenerationRun?: EntityResearchRunView;
  evidenceCollectionRun?: EntityResearchRunView;
  onGenerateTargets?: EntityResearchAction | null;
  onResearchEvidence?: EntityResearchAction | null;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<ProspectActionResult | null>(null);
  const [pendingOperation, setPendingOperation] = useState<ResearchOperation | null>(null);
  const [open, setOpen] = useState(eligibleTargetCount === 0);
  const [isPending, startTransition] = useTransition();
  const evidenceTargetLimit = Math.min(eligibleTargetCount, 25);
  const canGenerate = candidateGenerationEnabled && hasApprovedBrief && seedCount > 0 && Boolean(onGenerateTargets);
  const canResearch = evidenceResearchEnabled && hasApprovedBrief && evidenceTargetLimit > 0 && Boolean(onResearchEvidence);
  const runningCount = [candidateGenerationRun, evidenceCollectionRun].filter(runInProgress).length;

  useEffect(() => {
    if (runningCount === 0) return;
    const timer = window.setInterval(() => router.refresh(), RUNNING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router, runningCount]);

  const request = (operation: ResearchOperation, action: EntityResearchAction | null | undefined) => {
    if (!action) return;
    setNotice(null);
    setPendingOperation(operation);
    startTransition(async () => {
      try {
        const result = await action();
        setNotice(result);
        if (result.ok) router.refresh();
      } catch {
        setNotice({
          ok: false,
          message: "Couldn't start research, and nothing was changed. Check your connection and try again.",
        });
      } finally {
        setPendingOperation(null);
      }
    });
  };

  return (
    <section aria-labelledby="entity-research-heading" className="rounded-lg border border-border bg-card">
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id="entity-research-heading" className="text-sm font-semibold text-foreground">
              Find more targets
            </h2>
            {runningCount > 0 ? (
              <StatusBadge tone="progress" size="compact">
                {runningCount === 1 ? "1 request running" : `${runningCount} requests running`}
              </StatusBadge>
            ) : null}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>

        <div className="border-t border-border px-4 py-4 sm:px-5">
          <div className="divide-y divide-border">
            {candidateGenerationEnabled ? (
              <ResearchTask
                title="Find targets from your seed sites"
                description={
                  seedCount > 0
                    ? `Checks the ${seedCount} official ${seedCount === 1 ? "site" : "sites"} in your targeting brief for accounts that fit. It reads only those sites.`
                    : "Add official sites (seed sites) to your targeting brief, then Arcli can find targets on them."
                }
                run={candidateGenerationRun}
                buttonLabel="Find targets"
                disabled={isPending || !canGenerate}
                pending={pendingOperation === "candidate_generation"}
                onRequest={() => request("candidate_generation", onGenerateTargets)}
              />
            ) : null}
            {evidenceResearchEnabled ? (
              <ResearchTask
                title="Check saved sources for evidence"
                description={
                  evidenceTargetLimit > 0
                    ? `Looks through public records Arcli already holds for evidence about ${evidenceTargetLimit === 1 ? "your active target" : `up to ${evidenceTargetLimit} active targets`}. It never fetches profiles or private data.`
                    : "Add a target first, then Arcli can check its saved public sources for evidence."
                }
                run={evidenceCollectionRun}
                buttonLabel="Check for evidence"
                disabled={isPending || !canResearch}
                pending={pendingOperation === "evidence_collection"}
                onRequest={() => request("evidence_collection", onResearchEvidence)}
              />
            ) : null}
          </div>
          <p className="mt-4 text-xs leading-5 text-subtle">
            New evidence stays pending until you accept it. While a request runs, this page updates every 30 seconds.
          </p>
          <ActionNotice notice={notice} />
        </div>
      </details>
    </section>
  );
}
