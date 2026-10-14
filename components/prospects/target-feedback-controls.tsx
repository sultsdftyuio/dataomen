"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  TARGET_FEEDBACK_OPTIONS,
  type ProspectActionResult,
  type TargetFeedbackAction,
  type TargetFeedbackValue,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { ActionNotice } from "./target-action-notice";

// A rejected target has no pipeline to report on; the only useful outcomes
// are disagreeing with the rejection or confirming it.
const REJECTED_TARGET_OUTCOMES = new Set<TargetFeedbackValue>(["target", "not_relevant"]);

/**
 * A compact human-outcome recorder. It supplies only an assessment ID and a
 * fixed vocabulary; tenant ownership, persistence, and any future calibration
 * remain server-owned. Recording feedback does not send outreach or create a
 * CRM record. Render it with `key={assessmentId}` so a notice never carries
 * over to another target.
 */
export function TargetFeedbackControls({
  assessmentId,
  onFeedback,
  rejected = false,
}: {
  assessmentId: string;
  onFeedback: TargetFeedbackAction;
  rejected?: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<ProspectActionResult | null>(null);
  const [pendingValue, setPendingValue] = useState<TargetFeedbackValue | null>(null);
  const [recordedValue, setRecordedValue] = useState<TargetFeedbackValue | null>(null);
  const [isPending, startTransition] = useTransition();
  const options = rejected
    ? TARGET_FEEDBACK_OPTIONS.filter((option) => REJECTED_TARGET_OUTCOMES.has(option.value))
    : TARGET_FEEDBACK_OPTIONS;

  const submit = (feedback: TargetFeedbackValue) => {
    setNotice(null);
    setPendingValue(feedback);
    startTransition(async () => {
      try {
        const result = await onFeedback(assessmentId, feedback);
        setNotice(result);
        if (result.ok) {
          setRecordedValue(feedback);
          router.refresh();
        }
      } catch {
        setNotice({
          ok: false,
          message: "Couldn't record that outcome. Check your connection and try again.",
        });
      } finally {
        setPendingValue(null);
      }
    });
  };

  return (
    <section className="mt-5 border-t border-border pt-4" aria-labelledby="target-feedback-heading">
      <h4 id="target-feedback-heading" className="text-sm font-semibold text-foreground">
        Record outcome
      </h4>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        What happened with this target? Recording an outcome never sends outreach or creates a CRM record.
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Outcome">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={recordedValue === option.value}
            disabled={isPending}
            className="aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-primary"
            onClick={() => submit(option.value)}
          >
            {pendingValue === option.value ? (
              <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
            ) : null}
            {option.label}
          </Button>
        ))}
      </div>
      <ActionNotice notice={notice} />
    </section>
  );
}
