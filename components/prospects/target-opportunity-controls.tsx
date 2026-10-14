"use client";

import { BriefcaseBusiness, Loader2, Send } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type {
  ProspectActionResult,
  TargetAssessmentState,
  TargetEvidenceView,
  TargetOpportunityCreateAction,
  TargetOpportunityQualifyAction,
  TargetOpportunityStatus,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { ActionNotice } from "./target-action-notice";
import { targetEvidencePresentation } from "./target-presentation";

const OPPORTUNITY_EVIDENCE_KINDS = new Set([
  "trigger",
  "problem",
  "evaluation",
]);

function eligibleEvidence(evidence: readonly TargetEvidenceView[]): TargetEvidenceView[] {
  return evidence.filter(
    (item) =>
      item.reviewStatus === "accepted" &&
      item.sourceUrl !== null &&
      OPPORTUNITY_EVIDENCE_KINDS.has(item.kind),
  );
}

const OPPORTUNITY_STATUS: Record<
  TargetOpportunityStatus["status"],
  { label: string; tone: StatusTone }
> = {
  ready_for_review: { label: "Ready to qualify", tone: "info" },
  qualified: { label: "Qualified", tone: "success" },
  invalidated: { label: "No longer valid", tone: "neutral" },
};

const SELECT_CLASS_NAME =
  "mt-1.5 block h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

/**
 * An opportunity is deliberately downstream of evidence review. Creating it
 * binds one accepted citation to a human-owned workflow record; qualifying it
 * is a separate click that may send one optional CRM webhook. Neither action
 * looks up people, writes a message, or starts outreach. Render it with
 * `key={assessmentId}` so a notice never carries over to another target.
 */
export function TargetOpportunityControls({
  assessmentId,
  assessmentState,
  evidence,
  opportunity,
  onCreate,
  onQualify,
}: {
  assessmentId: string;
  assessmentState: TargetAssessmentState;
  evidence: readonly TargetEvidenceView[];
  opportunity: TargetOpportunityStatus | null | undefined;
  onCreate: TargetOpportunityCreateAction | null | undefined;
  onQualify: TargetOpportunityQualifyAction | null | undefined;
}) {
  const router = useRouter();
  const availableEvidence = useMemo(() => eligibleEvidence(evidence), [evidence]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(
    () => availableEvidence[0]?.id ?? "",
  );
  const [notice, setNotice] = useState<ProspectActionResult | null>(null);
  const [pendingAction, setPendingAction] = useState<"create" | "qualify" | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (availableEvidence.some((item) => item.id === selectedEvidenceId)) return;
    setSelectedEvidenceId(availableEvidence[0]?.id ?? "");
  }, [availableEvidence, selectedEvidenceId]);

  const create = () => {
    if (!onCreate || !selectedEvidenceId) return;
    setNotice(null);
    setPendingAction("create");
    startTransition(async () => {
      try {
        const result = await onCreate(assessmentId, selectedEvidenceId);
        setNotice(result);
        if (result.ok) router.refresh();
      } catch {
        setNotice({
          ok: false,
          message: "Couldn't create the opportunity. The target and its evidence are unchanged. Try again.",
        });
      } finally {
        setPendingAction(null);
      }
    });
  };

  const qualify = () => {
    if (!onQualify || !opportunity || opportunity.status !== "ready_for_review") return;
    setNotice(null);
    setPendingAction("qualify");
    startTransition(async () => {
      try {
        const result = await onQualify(opportunity.id);
        setNotice(result);
        if (result.ok) router.refresh();
      } catch {
        setNotice({
          ok: false,
          message: "Couldn't qualify this opportunity, and nothing was sent. Try again.",
        });
      } finally {
        setPendingAction(null);
      }
    });
  };

  const canCreate =
    assessmentState !== "rejected" &&
    !opportunity &&
    Boolean(onCreate) &&
    availableEvidence.length > 0;
  const canQualify = opportunity?.status === "ready_for_review" && Boolean(onQualify);
  const status = opportunity ? OPPORTUNITY_STATUS[opportunity.status] : null;

  return (
    <section className="mt-5 border-t border-border pt-4" aria-labelledby="target-opportunity-heading">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 id="target-opportunity-heading" className="text-sm font-semibold text-foreground">
          Opportunity
        </h4>
        {status ? (
          <StatusBadge tone={status.tone} size="compact">
            {status.label}
          </StatusBadge>
        ) : null}
      </div>

      {!opportunity ? (
        assessmentState === "rejected" ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            This target was rejected, so it can&apos;t become an opportunity.
          </p>
        ) : availableEvidence.length > 0 ? (
          <>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Turn accepted evidence into an opportunity you can qualify. Creating one never sends outreach.
            </p>
            <label htmlFor={`opportunity-evidence-${assessmentId}`} className="mt-3 block text-sm font-medium text-foreground">
              Evidence to cite
            </label>
            <select
              id={`opportunity-evidence-${assessmentId}`}
              value={selectedEvidenceId}
              onChange={(event) => setSelectedEvidenceId(event.target.value)}
              disabled={isPending}
              className={SELECT_CLASS_NAME}
            >
              {availableEvidence.map((item) => (
                <option key={item.id} value={item.id}>
                  {targetEvidencePresentation(item.kind).label}: {item.summary}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              disabled={isPending || !canCreate}
              className="mt-3"
              onClick={create}
            >
              {isPending && pendingAction === "create" ? (
                <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <BriefcaseBusiness aria-hidden="true" />
              )}
              Create opportunity
            </Button>
          </>
        ) : (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Accept a cited trigger, problem, or evaluation observation before creating an opportunity.
          </p>
        )
      ) : opportunity.status === "ready_for_review" ? (
        <>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Qualifying is a separate decision. It may send this opportunity to your connected CRM, but never sends outreach.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending || !canQualify}
            className="mt-3"
            onClick={qualify}
          >
            {isPending && pendingAction === "qualify" ? (
              <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Send aria-hidden="true" />
            )}
            Qualify opportunity
          </Button>
        </>
      ) : opportunity.status === "qualified" ? (
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Arcli won&apos;t retry CRM delivery or start outreach on its own.
        </p>
      ) : (
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Its evidence or the target changed, so it can&apos;t be qualified or exported.
        </p>
      )}

      <ActionNotice notice={notice} />
    </section>
  );
}
