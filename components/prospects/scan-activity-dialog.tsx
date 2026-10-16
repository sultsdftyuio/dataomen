"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, Radar, RefreshCw } from "lucide-react";

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
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { sourceDisplayName } from "./lead-desk-presentation";

/** Present only for allowlisted operators; customers never receive it. */
export type ManualScanControl = {
  pending: boolean;
  result: ProspectActionResult | null;
  onStart: () => void;
};

/** Re-reads the workspace website and rebuilds the targeting brief from it. */
export type ProfileRebuildControl = {
  pending: boolean;
  available: boolean;
  result: ProspectActionResult | null;
  onStart: () => void;
};

type ScanActivityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: BuyerDemandReportView | null;
  onRefresh: () => void;
  manualScan?: ManualScanControl | null;
  profileRebuild?: ProfileRebuildControl | null;
};

type SourceState = BuyerDemandReportView["sourceProgress"][number]["state"];

const SOURCE_OUTCOMES: Record<SourceState, { label: string; tone: StatusTone }> = {
  checking: { label: "Checking", tone: "progress" },
  found: { label: "Found matches", tone: "success" },
  partial: { label: "Partly checked", tone: "warning" },
  unavailable: { label: "Unavailable", tone: "warning" },
  no_results: { label: "Nothing found", tone: "neutral" },
};

function scanStatusLabel(status: string | null | undefined) {
  if (!status) return "No scan recorded";
  const text = status.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ResultLine({ result, okSuffix }: { result: ProspectActionResult; okSuffix?: string }) {
  const Icon = result.ok ? CheckCircle2 : AlertCircle;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={cn("flex items-start gap-1.5 text-sm leading-5", result.ok ? "text-success" : "text-danger")}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        {result.message}
        {result.ok && okSuffix ? ` ${okSuffix}` : ""}
      </span>
    </p>
  );
}

export function ScanActivityDialog({
  open,
  onOpenChange,
  report,
  onRefresh,
  manualScan = null,
  profileRebuild = null,
}: ScanActivityDialogProps) {
  const sources = report?.isTerminal
    ? report.sourceProgress.filter((source) => source.state !== "checking")
    : report?.sourceProgress ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scan activity</DialogTitle>
          <DialogDescription>
            Each scan checks public sources for conversations that match your brief. Only the ones that pass review reach your inbox.
          </DialogDescription>
        </DialogHeader>

        {report ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Latest scan: {scanStatusLabel(report.status)}</p>
              <p className="text-xs text-subtle">
                {report.summary.verifierPending ? "Review is still running." : `${sources.length} ${sources.length === 1 ? "source" : "sources"} checked`}
              </p>
            </div>
            {sources.length > 0 ? (
              <ul className="divide-y divide-border rounded-md border border-border">
                {sources.map((source) => {
                  const outcome = SOURCE_OUTCOMES[source.state];
                  return (
                    <li key={source.source} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{sourceDisplayName(source.source)}</p>
                        {source.plausibleCount !== null && source.plausibleCount > 0 ? (
                          <p className="text-xs tabular-nums text-subtle">
                            {source.plausibleCount} possible {source.plausibleCount === 1 ? "match" : "matches"}
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge tone={outcome.tone} size="compact">{outcome.label}</StatusBadge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No source has reported yet. Refresh in a minute to see progress.
              </p>
            )}
            {report.summary.caveat ? <p className="text-xs leading-5 text-subtle">{report.summary.caveat}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No scan has been recorded for this brief yet. Check the brief, or start a scan for one of the suggested buyer groups.
          </p>
        )}

        {manualScan?.result ? (
          <ResultLine result={manualScan.result} okSuffix="Refresh in a few seconds to follow it." />
        ) : null}
        {profileRebuild?.result ? <ResultLine result={profileRebuild.result} /> : null}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" /> Refresh
          </Button>
          {profileRebuild ? (
            <Button
              type="button"
              variant="outline"
              disabled={profileRebuild.pending || !profileRebuild.available}
              aria-busy={profileRebuild.pending}
              onClick={profileRebuild.onStart}
              title="Read your website again and update the brief from it"
            >
              {profileRebuild.pending ? "Reading website…" : "Re-read website"}
            </Button>
          ) : null}
          <Button asChild variant="outline"><Link href="/dashboard/brief">Review brief</Link></Button>
          {manualScan ? (
            <Button type="button" disabled={manualScan.pending} aria-busy={manualScan.pending} onClick={manualScan.onStart}>
              <Radar aria-hidden="true" /> {manualScan.pending ? "Starting…" : "Run scan now"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
