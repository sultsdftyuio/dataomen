"use client";

import { Loader2, Radar } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type {
  ProspectActionResult,
  TargetMonitoringAction,
  TargetMonitoringStatus,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { Button } from "@/components/ui/button";
import { C } from "@/lib/tokens";

function nextRefreshLabel(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

/**
 * A narrow consent control for target monitoring. It sends only an assessment
 * ID and boolean to a server action; exact locator checks, tenant ownership,
 * cadence, evidence collection, and scheduling remain server-owned.
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
  const nextRefresh = nextRefreshLabel(monitoring?.nextRefreshAt ?? null);

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
          message: "Could not update monitoring. The target itself was not changed.",
        });
      }
    });
  };

  return (
    <section
      className="mt-5 rounded-lg border p-3"
      style={{ borderColor: C.rule, backgroundColor: C.offWhite }}
      aria-labelledby="target-monitoring-heading"
    >
      <div className="flex items-start gap-2.5">
        <Radar className="mt-0.5 size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
        <div className="min-w-0">
          <h4 id="target-monitoring-heading" className="text-xs font-semibold" style={{ color: C.navy }}>
            Retained-public monitoring
          </h4>
          <p className="mt-1 text-[11px] leading-4" style={{ color: C.navySoft }}>
            {isActive
              ? nextRefresh
                ? "Watching retained public records. Next bounded check: " + nextRefresh + "."
                : "Watching retained public records at the next bounded check."
              : "Opt in to check future retained public records for cited evidence."}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4" style={{ color: C.muted }}>
        This never fetches profiles, scans posting history, sends outreach, creates a lead, or exports to a CRM.
      </p>
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={isPending}
        className="mt-2 border-[#C8D9E8] bg-white text-[#51687B] hover:bg-[#F6FAFE]"
        onClick={changeMonitoring}
      >
        {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {isActive ? "Stop watching" : "Watch retained evidence"}
      </Button>
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
