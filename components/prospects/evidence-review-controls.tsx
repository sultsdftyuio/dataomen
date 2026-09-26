"use client";

import { Check, Loader2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { C } from "@/lib/tokens";
import type {
  ProspectActionResult,
  TargetEvidenceReviewAction,
  TargetEvidenceReviewDecision,
} from "@/app/(dashboard)/dashboard/prospect-types";

/**
 * The client can request a review decision but cannot provide a tenant,
 * profile, assessment state, or evidence content. The server action resolves
 * and authorizes all of that scope before the database transition.
 */
export function EvidenceReviewControls({
  evidenceId,
  sourceAvailable,
  onReview,
}: {
  evidenceId: string;
  sourceAvailable: boolean;
  onReview: TargetEvidenceReviewAction;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<ProspectActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const review = (decision: TargetEvidenceReviewDecision) => {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await onReview(evidenceId, decision);
        setNotice(result);
        if (result.ok) router.refresh();
      } catch {
        setNotice({
          ok: false,
          message: "Could not record this review. The evidence is still pending.",
        });
      }
    });
  };

  return (
    <div
      className="mt-3 rounded-md border p-2.5"
      style={{ borderColor: C.blueLight, backgroundColor: C.bluePale }}
    >
      <p className="text-[11px] leading-4" style={{ color: C.navySoft }}>
        {sourceAvailable
          ? "Review the cited public source before accepting."
          : "A direct source link is unavailable. Accept only if you can independently verify this observation."}{" "}
        Acceptance lets this observation inform the target assessment; it does
        not create a lead.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          size="xs"
          disabled={isPending}
          className="bg-[#1B6EBF] text-white hover:bg-[#155A9F]"
          onClick={() => review("accepted")}
        >
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Check aria-hidden="true" />
          )}
          Accept evidence
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={isPending}
          className="border-[#C8D9E8] bg-white text-[#51687B] hover:bg-[#F6FAFE]"
          onClick={() => review("rejected")}
        >
          <X aria-hidden="true" />
          Reject evidence
        </Button>
      </div>
      {notice ? (
        <p
          className="mt-2 text-[11px] leading-4"
          role="status"
          style={{ color: notice.ok ? C.green : C.amber }}
        >
          {notice.message}
        </p>
      ) : null}
    </div>
  );
}
