import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ProspectActionResult } from "@/app/(dashboard)/dashboard/prospect-types";

/**
 * The outcome of a target action, shown next to the control that caused it.
 * The polite live region is always mounted so screen readers hear a success
 * that appears later; a failure is also an alert so it is announced at once.
 */
export function ActionNotice({
  notice,
  id,
  className,
}: {
  notice: ProspectActionResult | null;
  id?: string;
  className?: string;
}) {
  const Icon = notice?.ok ? CheckCircle2 : AlertTriangle;

  return (
    <div aria-live="polite" className={cn(notice ? "mt-3" : "sr-only", className)}>
      {notice ? (
        <p
          id={id}
          role={notice.ok ? undefined : "alert"}
          className={cn(
            "flex items-start gap-2 text-sm leading-6",
            notice.ok ? "text-success" : "text-danger",
          )}
        >
          <Icon className="mt-1 size-4 shrink-0" aria-hidden="true" />
          <span>{notice.message}</span>
        </p>
      ) : null}
    </div>
  );
}
