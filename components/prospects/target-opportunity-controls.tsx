"use client";

import { BriefcaseBusiness, Check, Loader2, Send } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { C } from "@/lib/tokens";
import type {
  ProspectActionResult,
  TargetEvidenceView,
  TargetOpportunityCreateAction,
  TargetOpportunityQualifyAction,
  TargetOpportunityStatus,
} from "@/app/(dashboard)/dashboard/prospect-types";

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

function opportunityLabel(status: TargetOpportunityStatus["status"]): string {
  switch (status) {
    case "ready_for_review":
      return "Opportunity ready for your qualification";
    case "qualified":
      return "Qualified opportunity";
    case "invalidated":
      return "Opportunity invalidated";
  }
}

/**
 * An opportunity is deliberately downstream of evidence review. Creating it
 * binds one accepted citation to a human-owned workflow record; qualifying it
 * is a separate click that may send one optional CRM webhook. Neither action
 * looks up people, writes a message, or starts outreach.
 */
export function TargetOpportunityControls({
  assessmentId,
  evidence,
  opportunity,
  onCreate,
  onQualify,
}: {
  assessmentId: string;
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
          message: "Could not create an opportunity. The target and its evidence were not changed.",
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
          message: "Could not qualify this opportunity. No outreach was sent.",
        });
      } finally {
        setPendingAction(null);
      }
    });
  };

  const canCreate = !opportunity && Boolean(onCreate) && availableEvidence.length > 0;
  const canQualify = opportunity?.status === "ready_for_review" && Boolean(onQualify);

  return (
    <section
      className="mt-5 rounded-lg border p-3"
      style={{ borderColor: C.rule, backgroundColor: C.offWhite }}
      aria-labelledby="target-opportunity-heading"
    >
      <div className="flex gap-2.5">
        <BriefcaseBusiness
          className="mt-0.5 size-4 shrink-0"
          style={{ color: C.blue }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h4 id="target-opportunity-heading" className="text-xs font-semibold" style={{ color: C.navy }}>
            Outreach opportunity
          </h4>
          <p className="mt-1 text-[11px] leading-4" style={{ color: C.navySoft }}>
            This is a human-reviewed handoff, not an automatic lead or message.
          </p>
        </div>
      </div>

      {!opportunity ? (
        availableEvidence.length > 0 ? (
          <>
            <label className="mt-3 block text-[11px] font-medium" style={{ color: C.navySoft }}>
              Accepted cited evidence
              <select
                value={selectedEvidenceId}
                onChange={(event) => setSelectedEvidenceId(event.target.value)}
                disabled={isPending}
                className="mt-1.5 block w-full rounded-md border bg-white px-2.5 py-1.5 text-xs"
                style={{ borderColor: C.ruleDark, color: C.navy }}
              >
                {availableEvidence.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.kind}: {item.summary}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              size="xs"
              disabled={isPending || !canCreate}
              className="mt-3 bg-[#1B6EBF] text-white hover:bg-[#155A9F]"
              onClick={create}
            >
              {isPending && pendingAction === "create" ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <BriefcaseBusiness aria-hidden="true" />
              )}
              Create opportunity
            </Button>
          </>
        ) : (
          <p className="mt-3 text-[11px] leading-4" style={{ color: C.muted }}>
            Accept a cited trigger, problem, or evaluation observation before creating an opportunity.
          </p>
        )
      ) : (
        <>
          <p className="mt-3 text-[11px] font-medium" style={{ color: C.navySoft }}>
            {opportunityLabel(opportunity.status)}
          </p>
          {opportunity.status === "ready_for_review" ? (
            <>
              <p className="mt-1 text-[11px] leading-4" style={{ color: C.muted }}>
                Qualification is a second explicit decision. It may export the cited opportunity to your configured CRM, but never sends outreach.
              </p>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={isPending || !canQualify}
                className="mt-3 border-[#6EE7B7] bg-white text-[#047857] hover:bg-[#ECFDF5]"
                onClick={qualify}
              >
                {isPending && pendingAction === "qualify" ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send aria-hidden="true" />
                )}
                Qualify opportunity
              </Button>
            </>
          ) : opportunity.status === "qualified" ? (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] leading-4" style={{ color: C.green }}>
              <Check className="size-3.5" aria-hidden="true" />
              Already qualified. Arcli will not automatically retry CRM delivery or outreach.
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-4" style={{ color: C.muted }}>
              Its accepted evidence or target state is no longer actionable, so it cannot be qualified or exported.
            </p>
          )}
        </>
      )}

      {notice ? (
        <p
          className="mt-2 text-[11px] leading-4"
          role="status"
          style={{ color: notice.ok ? C.green : C.amber }}
        >
          {notice.message}
        </p>
      ) : null}
    </section>
  );
}

