import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ActionOutcome } from "./action-outcome";

const TONES = {
  success: { icon: CheckCircle2, className: "border-success/25 text-success" },
  warning: { icon: AlertTriangle, className: "border-warning/30 text-warning" },
  danger: { icon: XCircle, className: "border-danger/25 text-danger" },
} as const;

/**
 * The result of an action, shown next to the control that caused it. Failures
 * use role="alert" so they are announced even if focus is elsewhere.
 */
export function OutcomeNotice({
  outcome,
  className,
}: {
  outcome: ActionOutcome;
  className?: string;
}) {
  const tone = TONES[outcome.tone];
  const Icon = tone.icon;

  return (
    <div
      role={outcome.tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-2 rounded-md border bg-card px-3 py-2", tone.className, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-sm leading-5">
        <p className="font-medium text-foreground">{outcome.title}</p>
        {outcome.description ? (
          <p className="text-muted-foreground">
            {outcome.description}
            {outcome.needsBrief ? (
              <>
                {" "}
                <Link
                  href="/dashboard/brief"
                  className="font-medium text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open targeting brief
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
