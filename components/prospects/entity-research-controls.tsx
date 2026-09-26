"use client";

import { FileSearch, Loader2, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { C } from "@/lib/tokens";
import type {
  EntityResearchAction,
  EntityResearchRunView,
  ProspectActionResult,
} from "@/app/(dashboard)/dashboard/prospect-types";

function formatRunDate(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function runStatusLabel(run: EntityResearchRunView | undefined): string | null {
  if (!run) return null;
  const date = formatRunDate(run.completedAt ?? run.startedAt ?? run.createdAt);
  switch (run.status) {
    case "queued":
      return "Latest request is queued.";
    case "running":
      return "Latest request is running.";
    case "completed":
      return date ? `Latest request completed ${date}.` : "Latest request completed.";
    case "partial":
      return date ? `Latest request partially completed ${date}.` : "Latest request partially completed.";
    case "failed":
      return date ? `Latest request needs retry (${date}).` : "Latest request needs retry.";
    case "cancelled":
      return date ? `Latest request was cancelled ${date}.` : "Latest request was cancelled.";
    case "skipped":
      return "Latest request was skipped because its approved scope changed or was unavailable.";
  }
}

/**
 * Explicit, customer-visible handoffs for the entity-first workflows. The
 * browser supplies no seed, URL, target, tenant, profile, provider filter, or
 * query: each server action resolves that bounded scope immediately before it
 * calls the trusted worker API.
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
  const [pendingOperation, setPendingOperation] = useState<
    "candidate_generation" | "evidence_collection" | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const evidenceTargetLimit = Math.min(eligibleTargetCount, 25);
  const canGenerate = candidateGenerationEnabled && hasApprovedBrief && seedCount > 0 && Boolean(onGenerateTargets);
  const canResearch = evidenceResearchEnabled && hasApprovedBrief && evidenceTargetLimit > 0 && Boolean(onResearchEvidence);

  const request = (
    operation: "candidate_generation" | "evidence_collection",
    action: EntityResearchAction | null | undefined,
  ) => {
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
          message: "Could not start research. No target, evidence, lead, or outreach record was changed.",
        });
      } finally {
        setPendingOperation(null);
      }
    });
  };

  return (
    <section
      aria-labelledby="entity-research-heading"
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: C.rule }}
    >
      <div className="flex items-start gap-2.5">
        <Sparkles className="mt-0.5 size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
        <div>
          <h2 id="entity-research-heading" className="text-sm font-semibold" style={{ color: C.navy }}>
            Research target universe
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5" style={{ color: C.muted }}>
            These are explicit, bounded research requests. Target fit stays separate from a buyer signal, lead, contact, outreach, or CRM record.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <article className="rounded-lg border p-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
          <h3 className="text-xs font-semibold" style={{ color: C.navy }}>
            Generate targets from official sites
          </h3>
          <p className="mt-1 text-[11px] leading-4" style={{ color: C.navySoft }}>
            Review only the {seedCount} approved official-site {seedCount === 1 ? "seed" : "seeds"} in your targeting brief. This is a bounded site pass, not autonomous web discovery or a profile crawl.
          </p>
          {candidateGenerationRun ? (
            <p className="mt-2 text-[11px] leading-4" role="status" style={{ color: C.muted }}>
              {runStatusLabel(candidateGenerationRun)}
            </p>
          ) : null}
          <Button
            type="button"
            size="xs"
            disabled={isPending || !canGenerate}
            className="mt-3 bg-[#1B6EBF] text-white hover:bg-[#155A9F]"
            onClick={() => request("candidate_generation", onGenerateTargets)}
          >
            {isPending && pendingOperation === "candidate_generation" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            Generate bounded targets
          </Button>
          {!hasApprovedBrief ? (
            <p className="mt-2 text-[11px] leading-4" style={{ color: C.amber }}>
              Save an approved targeting brief first.
            </p>
          ) : seedCount === 0 ? (
            <p className="mt-2 text-[11px] leading-4" style={{ color: C.amber }}>
              Add an approved official-site seed first.
            </p>
          ) : null}
        </article>

        <article className="rounded-lg border p-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
          <div className="flex items-start gap-2">
            <FileSearch className="mt-0.5 size-3.5 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
            <div>
              <h3 className="text-xs font-semibold" style={{ color: C.navy }}>
                Research retained public evidence
              </h3>
              <p className="mt-1 text-[11px] leading-4" style={{ color: C.navySoft }}>
                Check already-retained public records for up to {evidenceTargetLimit} current non-rejected {evidenceTargetLimit === 1 ? "target" : "targets"}. It never fetches profiles, scans posting history, or searches private data.
              </p>
            </div>
          </div>
          {evidenceCollectionRun ? (
            <p className="mt-2 text-[11px] leading-4" role="status" style={{ color: C.muted }}>
              {runStatusLabel(evidenceCollectionRun)}
            </p>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={isPending || !canResearch}
            className="mt-3 border-[#C8D9E8] bg-white text-[#51687B] hover:bg-[#F6FAFE]"
            onClick={() => request("evidence_collection", onResearchEvidence)}
          >
            {isPending && pendingOperation === "evidence_collection" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            Research retained evidence
          </Button>
          {!hasApprovedBrief ? (
            <p className="mt-2 text-[11px] leading-4" style={{ color: C.amber }}>
              Save an approved targeting brief first.
            </p>
          ) : evidenceTargetLimit === 0 ? (
            <p className="mt-2 text-[11px] leading-4" style={{ color: C.amber }}>
              Add or generate a non-rejected target first.
            </p>
          ) : null}
        </article>
      </div>

      <p className="mt-3 text-[11px] leading-4" style={{ color: C.muted }}>
        Evidence remains pending until a human accepts it. These controls cannot create a lead, contact, outreach, or CRM export.
      </p>
      {notice ? (
        <p
          className="mt-2 text-xs leading-5"
          role="status"
          style={{ color: notice.ok ? C.green : C.amber }}
        >
          {notice.message}
        </p>
      ) : null}
    </section>
  );
}

