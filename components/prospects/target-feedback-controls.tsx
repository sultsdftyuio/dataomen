"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { C } from "@/lib/tokens";
import {
  TARGET_FEEDBACK_OPTIONS,
  type ProspectActionResult,
  type TargetFeedbackAction,
  type TargetFeedbackValue,
} from "@/app/(dashboard)/dashboard/prospect-types";

/**
 * A compact human-outcome recorder. It supplies only an assessment ID and a
 * fixed vocabulary; tenant ownership, persistence, and any future calibration
 * remain server-owned. Recording feedback does not send outreach or create a
 * CRM record.
 */
export function TargetFeedbackControls({
  assessmentId,
  onFeedback,
}: {
  assessmentId: string;
  onFeedback: TargetFeedbackAction;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<ProspectActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (feedback: TargetFeedbackValue) => {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await onFeedback(assessmentId, feedback);
        setNotice(result);
        if (result.ok) router.refresh();
      } catch {
        setNotice({
          ok: false,
          message: "Could not record that outcome. The target itself was not changed.",
        });
      }
    });
  };

  return (
    <section
      className="mt-5 rounded-lg border p-3"
      style={{ borderColor: C.rule, backgroundColor: C.offWhite }}
      aria-labelledby="target-feedback-heading"
    >
      <h4 id="target-feedback-heading" className="text-xs font-semibold" style={{ color: C.navy }}>
        Record outcome
      </h4>
      <p className="mt-1 text-[11px] leading-4" style={{ color: C.navySoft }}>
        Save your workflow result for future ranking review. This never sends outreach or creates a CRM record.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TARGET_FEEDBACK_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="xs"
            variant="outline"
            disabled={isPending}
            className="border-[#C8D9E8] bg-white text-[#51687B] hover:bg-[#F6FAFE]"
            onClick={() => submit(option.value)}
          >
            {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {option.label}
          </Button>
        ))}
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
    </section>
  );
}
