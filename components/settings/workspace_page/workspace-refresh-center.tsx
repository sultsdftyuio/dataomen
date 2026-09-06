"use client";

import { type ReactNode, useState, useTransition } from "react";
import {
  CheckCircle2,
  CircleAlert,
  FileSearch,
  Globe2,
  Loader2,
  Radar,
  RefreshCw,
  RotateCcw,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
  CrawlJobView,
  ProspectActionResult,
  ServiceProfileFields,
  ServiceProfileView,
  WebsiteDemandScanAction,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { Button } from "@/components/ui/button";
import { C } from "@/lib/tokens";
import { websiteDomain } from "./website-url";

type ActionTone = "ready" | "updating" | "attention";

type WorkspaceRefreshCenterProps = {
  serviceProfile: ServiceProfileView;
  briefFields: ServiceProfileFields;
  crawlJob: CrawlJobView | null;
  websiteDraft: string;
  websiteChanged: boolean;
  isWebsitePending: boolean;
  isBriefPending: boolean;
  result: ProspectActionResult | null;
  startWebsiteDemandScan: WebsiteDemandScanAction;
  onWebsiteDraftChange: (value: string) => void;
  onRecrawlWebsite: () => void;
  onRefreshBrief: () => void;
};

type ActionPaneProps = {
  label: string;
  title: string;
  status: string;
  tone: ActionTone;
  icon: LucideIcon;
  children: ReactNode;
};

function formatTimestamp(value: string | null) {
  if (!value) return "Not yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function crawlState(crawlJob: CrawlJobView | null) {
  if (crawlJob?.status === "failed") {
    return { label: "Needs attention", tone: "attention" as const };
  }

  if (["pending", "processing", "running"].includes(crawlJob?.status ?? "")) {
    return { label: "Crawling", tone: "updating" as const };
  }

  return { label: "Ready", tone: "ready" as const };
}

function briefState(serviceProfile: ServiceProfileView) {
  if (!serviceProfile.hasProfile) {
    return { label: "Building", tone: "updating" as const };
  }

  if (serviceProfile.embeddingStatus === "failed") {
    return { label: "Needs attention", tone: "attention" as const };
  }

  if (serviceProfile.embeddingStatus === "completed") {
    return { label: "Active", tone: "ready" as const };
  }

  return { label: "Refreshing", tone: "updating" as const };
}

function statusStyle(tone: ActionTone) {
  if (tone === "attention") {
    return { backgroundColor: C.amberPale, color: C.amber };
  }

  if (tone === "updating") {
    return { backgroundColor: C.bluePale, color: C.blue };
  }

  return { backgroundColor: C.greenPale, color: C.green };
}

function ActionPane({
  label,
  title,
  status,
  tone,
  icon: Icon,
  children,
}: ActionPaneProps) {
  return (
    <section className="min-w-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className="mt-0.5 size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
              {label}
            </p>
            <h3 className="mt-0.5 truncate text-sm font-semibold" style={{ color: C.navy }}>
              {title}
            </h3>
          </div>
        </div>
        <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold" style={statusStyle(tone)}>
          {status}
        </span>
      </div>
      {children}
    </section>
  );
}

function TargetingSummary({
  briefFields,
  websiteDraft,
  websiteChanged,
}: Pick<
  WorkspaceRefreshCenterProps,
  "briefFields" | "websiteDraft" | "websiteChanged"
>) {
  const audiences = briefFields.target_audience.slice(0, 2);
  const buyer = audiences.length > 0 ? audiences.join(" / ") : "Add a target buyer";
  const problem =
    briefFields.core_problem ||
    briefFields.pain_points[0] ||
    "Add the problem your buyer wants solved";
  const phraseCount =
    briefFields.discovery_queries.length || briefFields.search_terms.length;
  const guardrailCount =
    briefFields.negative_keywords.length + briefFields.excluded_audiences.length;

  return (
    <section
      className="rounded-xl border px-4 py-3"
      style={{ borderColor: C.blueLight, backgroundColor: C.bluePale }}
      aria-labelledby="targeting-summary-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4" style={{ color: C.blue }} aria-hidden="true" />
          <h3 id="targeting-summary-title" className="text-sm font-semibold" style={{ color: C.navy }}>
            Next update will target
          </h3>
        </div>
        <span className="text-xs" style={{ color: C.navySoft }}>
          Changes appear here before you run an action.
        </span>
      </div>

      <dl className="mt-3 grid gap-x-5 gap-y-3 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
            Source
          </dt>
          <dd className="mt-0.5 truncate font-medium" style={{ color: C.navy }}>
            {websiteDomain(websiteDraft) ?? "Website needed"}
          </dd>
          <p className="mt-0.5 text-xs leading-5" style={{ color: C.muted }}>
            {websiteChanged ? "New source context" : "Refresh current context"}
          </p>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
            Buyer and problem
          </dt>
          <dd className="mt-0.5 truncate font-medium" style={{ color: C.navy }}>
            {buyer}
          </dd>
          <p className="mt-0.5 line-clamp-1 text-xs leading-5" style={{ color: C.muted }}>
            {problem}
          </p>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
            Buyer language
          </dt>
          <dd className="mt-0.5 font-medium" style={{ color: C.navy }}>
            {phraseCount} {phraseCount === 1 ? "phrase" : "phrases"}
          </dd>
          <p className="mt-0.5 text-xs leading-5" style={{ color: C.muted }}>
            Used to find relevant conversations
          </p>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
            Quality filters
          </dt>
          <dd className="mt-0.5 font-medium" style={{ color: C.navy }}>
            {guardrailCount} {guardrailCount === 1 ? "guardrail" : "guardrails"}
          </dd>
          <p className="mt-0.5 text-xs leading-5" style={{ color: C.muted }}>
            {guardrailCount > 0 ? "Filtering weak matches" : "No filters added yet"}
          </p>
        </div>
      </dl>
    </section>
  );
}

export function WorkspaceRefreshCenter({
  serviceProfile,
  briefFields,
  crawlJob,
  websiteDraft,
  websiteChanged,
  isWebsitePending,
  isBriefPending,
  result,
  startWebsiteDemandScan,
  onWebsiteDraftChange,
  onRecrawlWebsite,
  onRefreshBrief,
}: WorkspaceRefreshCenterProps) {
  const [isDemandScanPending, startDemandScanTransition] = useTransition();
  const [demandScanResult, setDemandScanResult] =
    useState<ProspectActionResult | null>(null);
  const crawl = crawlState(crawlJob);
  const brief = briefState(serviceProfile);
  const isAnyActionPending =
    isWebsitePending || isBriefPending || isDemandScanPending;
  const actionResult = demandScanResult ?? result;

  const startDemandScan = () => {
    startDemandScanTransition(async () => {
      try {
        setDemandScanResult(await startWebsiteDemandScan());
      } catch {
        setDemandScanResult({
          ok: false,
          message: "Could not start the demand scan. Please try again.",
        });
      }
    });
  };

  return (
    <section aria-labelledby="workspace-refresh-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.blue }}>
            Workspace controls
          </p>
          <h2 id="workspace-refresh-title" className="mt-1 pfd text-2xl leading-none" style={{ color: C.navy }}>
            Refresh workspace
          </h2>
          <p className="mt-2 text-sm leading-6" style={{ color: C.muted }}>
            Update the source, brief, or demand scan - one action at a time.
          </p>
        </div>
        <p className="text-xs" style={{ color: C.muted }}>
          Last crawled: {formatTimestamp(crawlJob?.updatedAt ?? null)}
        </p>
      </div>

      <div
        className="grid overflow-hidden rounded-xl border bg-white divide-y divide-[#D9E4ED] xl:grid-cols-3 xl:divide-x xl:divide-y-0"
        style={{ borderColor: C.rule }}
      >
        <ActionPane
          label="Website source"
          title={websiteDomain(websiteDraft) ?? "Website needed"}
          status={crawl.label}
          tone={crawl.tone}
          icon={Globe2}
        >
          <div className="mt-3 flex gap-2">
            <input
              id="workspace-website-url"
              aria-label="Website crawl source"
              type="url"
              inputMode="url"
              autoComplete="url"
              value={websiteDraft}
              disabled={isAnyActionPending}
              className="h-9 min-w-0 flex-1 rounded-md border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              style={{ borderColor: C.rule, color: C.navy }}
              onChange={(event) => onWebsiteDraftChange(event.target.value)}
            />
            <Button
              type="button"
              className="h-9 shrink-0"
              disabled={isAnyActionPending || !websiteDraft.trim()}
              onClick={onRecrawlWebsite}
            >
              {isWebsitePending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="size-4" aria-hidden="true" />
              )}
              {isWebsitePending ? "Queueing..." : "Re-crawl"}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>
            Refreshes the website source only.
          </p>
        </ActionPane>

        <ActionPane
          label="Matching brief"
          title="Buyer, problem and signals"
          status={brief.label}
          tone={brief.tone}
          icon={Target}
        >
          <p className="mt-3 truncate text-sm font-medium" style={{ color: C.navy }}>
            {briefFields.target_audience.slice(0, 2).join(" / ") || "Add your target buyer"}
          </p>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            Applies saved brief changes without a website crawl.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-9"
            disabled={isAnyActionPending || !serviceProfile.hasProfile}
            onClick={onRefreshBrief}
          >
            {isBriefPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            {isBriefPending ? "Refreshing..." : "Refresh brief"}
          </Button>
        </ActionPane>

        <ActionPane
          label="Demand scan"
          title="Public conversations"
          status="Ready"
          tone="ready"
          icon={Radar}
        >
          <p className="mt-3 text-sm font-medium" style={{ color: C.navy }}>
            Search for buyer-demand signals
          </p>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            Uses the active matching brief.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-9"
            disabled={isAnyActionPending}
            onClick={startDemandScan}
          >
            {isDemandScanPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileSearch className="size-4" aria-hidden="true" />
            )}
            {isDemandScanPending ? "Starting..." : "Scan demand"}
          </Button>
        </ActionPane>
      </div>

      <TargetingSummary
        briefFields={briefFields}
        websiteDraft={websiteDraft}
        websiteChanged={websiteChanged}
      />

      {actionResult ? (
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5"
          style={{
            borderColor: actionResult.ok ? C.blueLight : C.red,
            backgroundColor: actionResult.ok ? C.bluePale : C.redPale,
            color: actionResult.ok ? C.navySoft : C.red,
          }}
          role="status"
        >
          {actionResult.ok ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{actionResult.message}</span>
        </div>
      ) : null}
    </section>
  );
}
