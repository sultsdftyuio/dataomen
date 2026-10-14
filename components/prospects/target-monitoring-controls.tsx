"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type {
  ProspectActionResult,
  TargetMonitoringAction,
  TargetMonitoringStatus,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionNotice } from "./target-action-notice";
import { formatTargetDate } from "./target-format";

/**
 * A narrow consent control for target monitoring. It sends only an assessment
 * ID and boolean to a server action; exact locator checks, tenant ownership,
 * cadence, evidence collection, and scheduling remain server-owned. Render it
 * with `key={assessmentId}` so a notice never carries over to another target.
 */
export function TargetMonitoringControls({
  assessmentId,
  monitoring,
  onChange,
}: {
  assessmentId: string;
  monitoring: TargetMonitoringStatus | null | undefined;
  onChange: TargetMonitoringAction;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<ProspectActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const isActive = monitoring?.status === "active";
  const nextRefresh = formatTargetDate(monitoring?.nextRefreshAt ?? null);

  const changeMonitoring = () => {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await onChange(assessmentId, !isActive);
        setNotice(result);
        if (result.ok) router.refresh();
      } catch {
        setNotice({
          ok: false,
          message: "Couldn't change monitoring for this target. Check your connection and try again.",
        });
      }
    });
  };

  return (
    <section className="mt-5 border-t border-border pt-4" aria-labelledby="target-monitoring-heading">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 id="target-monitoring-heading" className="text-sm font-semibold text-foreground">
          Watch for new evidence
        </h4>
        {isActive ? (
          <StatusBadge tone="success" size="compact">
            Watching
          </StatusBadge>
        ) : null}
      </div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {isActive
          ? nextRefresh
            ? `Arcli checks again on ${nextRefresh} and adds any new cited evidence for your review.`
            : "Arcli checks again at the next scheduled run and adds any new cited evidence for your review."
          : "Retained-public monitoring checks public records Arcli already holds for new cited evidence about this target."}{" "}
        It never fetches profiles, scans posting history, sends outreach, creates a lead, or exports to a CRM.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        className="mt-3"
        onClick={changeMonitoring}
      >
        {isPending ? <Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> : null}
        {isActive ? "Stop watching" : "Watch retained evidence"}
      </Button>
      <ActionNotice notice={notice} />
    </section>
  );
}
