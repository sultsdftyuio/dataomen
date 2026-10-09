"use client";

import Link from "next/link";
import { AlertCircle, Check, Clock3, Radar, RefreshCw } from "lucide-react";

import type {
  BuyerDemandReportView,
  ProspectActionResult,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { C } from "@/lib/tokens";
import { sourceDisplayName } from "./lead-desk-presentation";

/** Present only for allowlisted operators; customers never receive it. */
export type ManualScanControl = {
  pending: boolean;
  result: ProspectActionResult | null;
  onStart: () => void;
};

type ScanActivityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: BuyerDemandReportView | null;
  onRefresh: () => void;
  manualScan?: ManualScanControl | null;
};

function sourceOutcome(state: BuyerDemandReportView["sourceProgress"][number]["state"]) {
  switch (state) {
    case "checking": return "Checking";
    case "found": return "Candidates found";
    case "partial": return "Partial coverage";
    case "unavailable": return "Unavailable";
    case "no_results": return "No candidates";
  }
}

export function ScanActivityDialog({ open, onOpenChange, report, onRefresh, manualScan = null }: ScanActivityDialogProps) {
  const sources = report?.isTerminal
    ? report.sourceProgress.filter((source) => source.state !== "checking")
    : report?.sourceProgress ?? [];
  const status = report?.status?.replaceAll("_", " ") ?? "No scan recorded";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Discovery scan activity</DialogTitle>
          <DialogDescription>
            Source checks collect candidate conversations. Matching and verification decide which appear in the opportunity inbox.
          </DialogDescription>
        </DialogHeader>

        {report ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
              <div>
                <p className="text-xs font-semibold capitalize" style={{ color: C.navy }}>{status}</p>
                <p className="mt-1 text-xs" style={{ color: C.muted }}>
                  {report.summary.verifierPending ? "Verification is still running." : "Latest recorded source checks."}
                </p>
              </div>
              <span className="text-xs font-semibold" style={{ color: C.blue }}>
                {sources.length} {sources.length === 1 ? "source" : "sources"}
              </span>
            </div>
            {sources.length > 0 ? (
              <ul className="divide-y rounded-lg border" style={{ borderColor: C.rule }}>
                {sources.map((source) => {
                  const failed = source.state === "unavailable" || source.state === "partial";
                  const checking = source.state === "checking";
                  const Icon = failed ? AlertCircle : checking ? Clock3 : Check;
                  return (
                    <li key={source.source} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <div className="flex min-w-0 items-start gap-2">
                        <Icon className="mt-0.5 size-4 shrink-0" style={{ color: failed ? C.amber : checking ? C.blue : C.green }} aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold" style={{ color: C.navy }}>{sourceDisplayName(source.source)}</p>
                          <p className="text-xs" style={{ color: C.muted }}>{sourceOutcome(source.state)}</p>
                        </div>
                      </div>
                      {source.plausibleCount !== null && source.plausibleCount > 0 ? (
                        <span className="shrink-0 text-xs font-semibold" style={{ color: C.navySoft }}>
                          {source.plausibleCount} candidate{source.plausibleCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm" style={{ borderColor: C.ruleDark, color: C.navySoft }}>
                No source check has reported yet. Refresh to check for new activity.
              </p>
            )}
            {report.summary.caveat ? <p className="text-xs leading-5" style={{ color: C.muted }}>{report.summary.caveat}</p> : null}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm" style={{ borderColor: C.ruleDark, color: C.navySoft }}>
            No discovery scan has been recorded for this matching brief yet. Check the brief and try a focused buyer group.
          </p>
        )}

        {manualScan?.result ? (
          <p className="text-xs leading-5" role="status" style={{ color: manualScan.result.ok ? C.navySoft : C.amber }}>
            {manualScan.result.message}
            {manualScan.result.ok ? " Refresh in a few seconds to follow it live." : ""}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: C.rule }}>
          <Button type="button" variant="outline" onClick={onRefresh}><RefreshCw className="size-4" aria-hidden="true" /> Refresh</Button>
          <Button asChild variant="outline"><Link href="/dashboard/brief">Review matching brief</Link></Button>
          {manualScan ? (
            <Button type="button" disabled={manualScan.pending} aria-busy={manualScan.pending} onClick={manualScan.onStart}>
              <Radar className="size-4" aria-hidden="true" /> {manualScan.pending ? "Starting..." : "Run scan now"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
