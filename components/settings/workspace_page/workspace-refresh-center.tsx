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

type RefreshCardProps = {
  eyebrow: string;
  title: string;
  status: string;
  statusTone: "ready" | "updating" | "attention";
  icon: LucideIcon;
  children: ReactNode;
};

function formatTimestamp(value: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function crawlStatus(crawlJob: CrawlJobView | null) {
  if (!crawlJob) {
    return { label: "Ready", tone: "ready" as const };
  }

  if (crawlJob.status === "failed") {
    return { label: "Needs attention", tone: "attention" as const };
  }

  if (["pending", "processing", "running"].includes(crawlJob.status ?? "")) {
    return { label: "Crawling", tone: "updating" as const };
  }

  return { label: "Ready", tone: "ready" as const };
}

function briefStatus(serviceProfile: ServiceProfileView) {
  if (!serviceProfile.hasProfile) {
    return { label: "Building brief", tone: "updating" as const };
  }

  if (serviceProfile.embeddingStatus === "failed") {
    return { label: "Needs attention", tone: "attention" as const };
  }

  if (serviceProfile.embeddingStatus === "completed") {
    return { label: "Active", tone: "ready" as const };
  }

  return { label: "Refreshing", tone: "updating" as const };
}

function statusStyle(tone: RefreshCardProps["statusTone"]) {
  if (tone === "attention") {
    return { backgroundColor: C.amberPale, color: C.amber };
  }

  if (tone === "updating") {
    return { backgroundColor: C.bluePale, color: C.blue };
  }

  return { backgroundColor: C.greenPale, color: C.green };
}

function RefreshCard({
  eyebrow,
  title,
  status,
  statusTone,
  icon: Icon,
  children,
}: RefreshCardProps) {
  return (
    <section className="rounded-xl border bg-white p-4" style={{ borderColor: C.rule }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: C.bluePale, color: C.blue }}
          >
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.blue }}>
              {eyebrow}
            </p>
            <h2 className="mt-1 text-sm font-semibold" style={{ color: C.navy }}>
              {title}
            </h2>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold"
          style={statusStyle(statusTone)}
        >
          {status}
        </span>
      </div>
      {children}
    </section>
  );
}

function TargetingPlan({
  briefFields,
  websiteDraft,
  websiteChanged,
}: Pick<
  WorkspaceRefreshCenterProps,
  "briefFields" | "websiteDraft" | "websiteChanged"
>) {
  const fields = briefFields;
  const audiences = fields.target_audience.slice(0, 2);
  const queryCount = fields.discovery_queries.length || fields.search_terms.length;
  const guardrailCount =
    fields.negative_keywords.length + fields.excluded_audiences.length;
  const targetAudience =
    audiences.length > 0 ? audiences.join(" and ") : "your defined buyer";
  const coreProblem = fields.core_problem || fields.pain_points[0] || "the problem in your matching brief";

  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: C.blueLight, backgroundColor: C.bluePale }}
      aria-labelledby="crawl-improvement-title"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="crawl-improvement-title" className="text-sm font-semibold" style={{ color: C.navy }}>
            What your next update will improve
          </h2>
          <p className="mt-1 text-xs leading-5" style={{ color: C.navySoft }}>
            Arcli uses this plan to turn your website context into more focused demand matching.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
            Website context
          </p>
          <p className="mt-1 text-sm font-semibold" style={{ color: C.navy }}>
            {websiteDomain(websiteDraft) ?? "Website needed"}
          </p>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            {websiteChanged
              ? "The new source will replace the current crawl context."
              : "A re-crawl will refresh the current source context."}
          </p>
        </div>
        <div className="rounded-lg bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
            Buyer to target
          </p>
          <p className="mt-1 text-sm font-semibold" style={{ color: C.navy }}>
            {targetAudience}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: C.muted }}>
            Focus: {coreProblem}
          </p>
        </div>
        <div className="rounded-lg bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
            Matching quality
          </p>
          <p className="mt-1 text-sm font-semibold" style={{ color: C.navy }}>
            {queryCount} {queryCount === 1 ? "buyer phrase" : "buyer phrases"}
          </p>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            {guardrailCount > 0
              ? `${guardrailCount} guardrails will filter weak matches.`
              : "Add guardrails below to filter weak matches."}
          </p>
        </div>
      </div>
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
  const crawl = crawlStatus(crawlJob);
  const brief = briefStatus(serviceProfile);
  const isAnyActionPending =
    isWebsitePending || isBriefPending || isDemandScanPending;

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
    <section aria-labelledby="workspace-refresh-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.blue }}>
            Workspace controls
          </p>
          <h1 id="workspace-refresh-title" className="mt-1 pfd text-2xl leading-none" style={{ color: C.navy }}>
            Refresh workspace
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: C.muted }}>
            Choose one action at a time: refresh your source, update your brief, or scan for demand.
          </p>
        </div>
        <p className="text-xs" style={{ color: C.muted }}>
          Last crawled: {formatTimestamp(crawlJob?.updatedAt ?? null)}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <RefreshCard eyebrow="Website source" title={websiteDomain(websiteDraft) ?? "Website needed"} status={crawl.label} statusTone={crawl.tone} icon={Globe2}>
          <label htmlFor="workspace-website-url" className="mt-4 block text-xs font-semibold" style={{ color: C.navy }}>
            Crawl source
          </label>
          <input
            id="workspace-website-url"
            type="url"
            inputMode="url"
            autoComplete="url"
            value={websiteDraft}
            disabled={isAnyActionPending}
            className="mt-2 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            style={{ borderColor: C.rule, color: C.navy }}
            onChange={(event) => onWebsiteDraftChange(event.target.value)}
          />
          <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>
            Crawls this website and rebuilds its derived brief. It does not start a separate brief refresh.
          </p>
          <Button type="button" className="mt-4 h-9 w-full" disabled={isAnyActionPending || !websiteDraft.trim()} onClick={onRecrawlWebsite}>
            {isWebsitePending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
            {isWebsitePending ? "Queueing re-crawl..." : websiteChanged ? "Replace & re-crawl" : "Re-crawl website"}
          </Button>
        </RefreshCard>

        <RefreshCard
          eyebrow="Matching brief"
          title="Buyer, problem & signals"
          status={brief.label}
          statusTone={brief.tone}
          icon={Target}
        >
          <p className="mt-4 text-sm font-medium" style={{ color: C.navy }}>
                {briefFields.target_audience.slice(0, 2).join(" · ") || "Add your target buyer"}
          </p>
          <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>
            Refreshes matching from the saved brief. It does not re-crawl the website.
          </p>
          <Button type="button" variant="outline" className="mt-4 h-9 w-full" disabled={isAnyActionPending || !serviceProfile.hasProfile} onClick={onRefreshBrief}>
            {isBriefPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
            {isBriefPending ? "Refreshing brief..." : "Refresh brief"}
          </Button>
        </RefreshCard>

        <RefreshCard eyebrow="Demand scan" title="Public conversations" status="Ready" statusTone="ready" icon={Radar}>
          <p className="mt-4 text-sm font-medium" style={{ color: C.navy }}>
            Scan using the active matching brief
          </p>
          <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>
            Checks public conversations for the buyer, problem, and signals defined in your brief.
          </p>
          <Button type="button" variant="outline" className="mt-4 h-9 w-full" disabled={isAnyActionPending} onClick={startDemandScan}>
            {isDemandScanPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileSearch className="size-4" aria-hidden="true" />}
            {isDemandScanPending ? "Starting scan..." : "Scan website demand"}
          </Button>
        </RefreshCard>
      </div>

      <TargetingPlan
        briefFields={briefFields}
        websiteDraft={websiteDraft}
        websiteChanged={websiteChanged}
      />

      {result || demandScanResult ? (
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-5"
          style={{
            borderColor: (demandScanResult ?? result)?.ok ? C.blueLight : C.red,
            backgroundColor: (demandScanResult ?? result)?.ok ? C.bluePale : C.redPale,
            color: (demandScanResult ?? result)?.ok ? C.navySoft : C.red,
          }}
          role="status"
        >
          {(demandScanResult ?? result)?.ok ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{(demandScanResult ?? result)?.message}</span>
        </div>
      ) : null}
    </section>
  );
}
