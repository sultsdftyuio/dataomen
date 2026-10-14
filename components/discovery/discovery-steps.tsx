import { CheckCircle2, Circle, CircleDot, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import { DISCOVERY_STEPS, type DiscoveryStatus } from "./discovery-status";

type StepState = "done" | "current" | "queued" | "failed" | "waiting";

const STEP_STATE_LABEL: Record<StepState, string> = {
  done: "Done",
  current: "In progress",
  queued: "Queued",
  failed: "Stopped",
  waiting: "Not started",
};

function stepState(status: DiscoveryStatus, index: number): StepState {
  if (status.failedStep === index) return "failed";
  if (index < status.stepIndex) return "done";
  if (index > status.stepIndex || status.failedStep !== undefined) return "waiting";
  return status.kind === "queued" ? "queued" : "current";
}

function StepIcon({ state }: { state: StepState }) {
  const className = "size-4 shrink-0";
  if (state === "done") return <CheckCircle2 className={cn(className, "text-primary")} aria-hidden="true" />;
  if (state === "failed") return <XCircle className={cn(className, "text-danger")} aria-hidden="true" />;
  if (state === "current" || state === "queued") {
    return <CircleDot className={cn(className, "text-primary")} aria-hidden="true" />;
  }
  return <Circle className={cn(className, "text-faint")} aria-hidden="true" />;
}

/**
 * The four steps really are a sequence, so they keep a simple numbered
 * indicator. Each step states its status in words, so colour is never the
 * only signal. Static icons: the page's status badge is the one moving part.
 */
export function DiscoverySteps({ status }: { status: DiscoveryStatus }) {
  return (
    <ol className="grid gap-x-6 gap-y-2.5 sm:grid-cols-4" aria-label="Scan steps">
      {DISCOVERY_STEPS.map((label, index) => {
        const state = stepState(status, index);
        const isCurrent = state === "current" || state === "queued";

        return (
          <li
            key={label}
            aria-current={isCurrent ? "step" : undefined}
            className="flex min-w-0 items-start gap-2.5 sm:flex-col sm:gap-1.5"
          >
            <StepIcon state={state} />
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 sm:flex-col sm:gap-0.5">
              <span
                className={cn(
                  "text-sm leading-5",
                  state === "waiting" ? "text-muted-foreground" : "font-medium text-foreground",
                )}
              >
                <span className="sr-only">Step {index + 1}: </span>
                {label}
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs leading-5",
                  state === "failed" ? "text-danger" : isCurrent ? "text-primary" : "text-subtle",
                )}
              >
                {STEP_STATE_LABEL[state]}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
