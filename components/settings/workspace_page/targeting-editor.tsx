"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleAlert, FileSearch } from "lucide-react";

import type {
  BuyerDemandReportView,
  ProspectActionResult,
  ServiceProfileFields,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import {
  useBriefSaveSection,
  type BriefSaveOutcome,
} from "@/app/(dashboard)/dashboard/brief/brief-save";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { DiscoveryQueryEditor } from "@/components/onboarding/workspace-provisioning-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { DiscoveryQuery } from "@/lib/discovery-queries";
import { cn } from "@/lib/utils";
import { SignalField, TagList, TextProfileField } from "./targeting-fields";
import { websiteDomain } from "./website-url";

type LatestScan = Pick<
  BuyerDemandReportView,
  "status" | "updatedAt" | "isTerminal" | "summary"
> | null;

export type DiscoveryQueryError = { message: string; inputId: string };

type TargetingEditorProps = {
  serviceProfile: ServiceProfileView;
  /** The unsaved draft. serviceProfile.fields is the saved copy. */
  fields: ServiceProfileFields;
  isPro: boolean;
  changedFieldCount: number;
  queryError: DiscoveryQueryError | null;
  latestScan: LatestScan;
  savedWebsiteUrl: string;
  websiteDraft: string;
  websiteChanged: boolean;
  isWebsitePending: boolean;
  websiteResult: ProspectActionResult | null;
  isRefreshing: boolean;
  refreshResult: ProspectActionResult | null;
  onFieldChange: <Key extends keyof ServiceProfileFields>(
    key: Key,
    value: ServiceProfileFields[Key],
  ) => void;
  onDiscoveryQueriesChange: (value: DiscoveryQuery[]) => void;
  /** Saves the draft. Called by the page's shared save bar. */
  onSave: () => Promise<BriefSaveOutcome>;
  /** Checks the draft before anything on the page is saved. */
  onValidate: () => BriefSaveOutcome | null;
  onRefreshTargeting: () => void;
  onRefreshWebsite: () => void;
  onWebsiteDraftChange: (value: string) => void;
  onWebsiteReset: () => void;
  onWebsiteSave: () => void;
};

type Readiness = {
  tone: StatusTone;
  label: string;
  detail: string;
  action?: { label: string; run: "website" | "targeting" };
};

// Only the saved profile decides readiness: an unsaved draft changes nothing
// about what the next scan will use.
function targetingReadiness(
  serviceProfile: ServiceProfileView,
  isPro: boolean,
  requiresProfileRefresh: boolean,
): Readiness {
  const saved = serviceProfile.fields;
  if (!serviceProfile.hasProfile) {
    return {
      tone: "progress",
      label: "Preparing",
      detail: "Arcli is reading your website to draft this brief.",
    };
  }
  if (requiresProfileRefresh) {
    return {
      tone: "warning",
      label: "Needs refresh",
      detail: "Matching is paused: the last scan needs a fresh read of your website.",
      action: { label: "Refresh website profile", run: "website" },
    };
  }
  if (isPro && serviceProfile.embeddingStatus === "failed") {
    return {
      tone: "warning",
      label: "Needs refresh",
      detail: "Arcli couldn't apply your last save, so scans use the previous version.",
      action: { label: "Refresh targeting", run: "targeting" },
    };
  }
  if (!saved?.target_audience.length || !saved.core_problem.trim()) {
    return {
      tone: "warning",
      label: "Incomplete",
      detail: "Add a buyer and a problem so scans know what to look for.",
    };
  }
  if (!isPro) {
    return {
      tone: "success",
      label: "Saved",
      detail: "Prospect scans are part of Pro. This brief is used once you upgrade.",
    };
  }
  if (serviceProfile.embeddingStatus !== "completed") {
    return {
      tone: "progress",
      label: "Updating",
      detail: "Applying your last save. Scans use the previous version until it finishes.",
      action: { label: "Refresh targeting", run: "targeting" },
    };
  }
  return {
    tone: "success",
    label: "Ready",
    detail: "The next scan uses this brief.",
  };
}

function latestScanMessage(latestScan: LatestScan) {
  if (!latestScan) return "No scan has used this brief yet.";

  if (latestScan.summary.stopReason === "profile_refresh_required") {
    return "Stopped before matching because your website needs a fresh read.";
  }

  if (!latestScan.isTerminal) {
    return "A scan is running with this brief. New prospects appear in Prospects when it finishes.";
  }

  const conversations = latestScan.summary.totalHits;
  const plausible = latestScan.summary.plausibleHits;
  if (conversations !== null && plausible !== null) {
    return `Checked ${conversations} public ${conversations === 1 ? "conversation" : "conversations"} and found ${plausible} plausible ${plausible === 1 ? "prospect" : "prospects"}.`;
  }

  return "The last scan finished. Its matches are in Prospects.";
}

function ResultLine({
  result,
  id,
  className,
}: {
  result: ProspectActionResult | null;
  id?: string;
  className?: string;
}) {
  if (!result) return null;
  return (
    <p
      id={id}
      className={cn(
        "text-sm leading-5",
        result.ok ? "text-success" : "text-danger",
        className,
      )}
    >
      {result.message}
    </p>
  );
}

function WebsiteSourceControl({
  savedWebsiteUrl,
  websiteDraft,
  websiteChanged,
  isPending,
  result,
  onWebsiteDraftChange,
  onWebsiteReset,
  onWebsiteSave,
}: {
  savedWebsiteUrl: string;
  websiteDraft: string;
  websiteChanged: boolean;
  isPending: boolean;
  result: ProspectActionResult | null;
  onWebsiteDraftChange: (value: string) => void;
  onWebsiteReset: () => void;
  onWebsiteSave: () => void;
}) {
  const [isChanging, setIsChanging] = useState(false);
  // The header always names the saved source, never the unsaved draft.
  const savedDomain = websiteDomain(savedWebsiteUrl) ?? "No website yet";
  const draftDomain = websiteDomain(websiteDraft);
  const showForm = isChanging && !result?.ok;
  const hasError = result !== null && !result.ok;

  return (
    <div className="border-t border-border px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-xs leading-5 text-subtle">Website source</p>
          <p className="truncate text-sm font-medium text-foreground">{savedDomain}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          aria-expanded={showForm}
          aria-controls="targeting-website-form"
          onClick={() => {
            onWebsiteReset();
            setIsChanging(!showForm);
          }}
        >
          {showForm ? "Cancel" : "Change website"}
        </Button>
      </div>

      {showForm ? (
        <form
          id="targeting-website-form"
          className="mt-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onWebsiteSave();
          }}
        >
          <label htmlFor="targeting-website-url" className="text-sm font-semibold text-foreground">
            New website
          </label>
          <p id="targeting-website-help" className="mt-0.5 text-sm leading-5 text-muted-foreground">
            Changing the source rebuilds this targeting profile before Arcli looks for new conversations.
          </p>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <Input
              id="targeting-website-url"
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              value={websiteDraft}
              disabled={isPending}
              aria-invalid={hasError || undefined}
              aria-describedby={
                hasError ? "targeting-website-help targeting-website-result" : "targeting-website-help"
              }
              className="h-9 bg-card text-sm sm:flex-1"
              onChange={(event) => onWebsiteDraftChange(event.target.value)}
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save and rebuild"}
            </Button>
          </div>
          {websiteChanged && draftDomain && !hasError ? (
            <p className="mt-2 text-sm leading-5 text-warning">
              Buyers, problem and signals will be redrafted from {draftDomain}. Your current answers will be replaced.
            </p>
          ) : null}
        </form>
      ) : null}

      <div aria-live="polite">
        <ResultLine result={result} id="targeting-website-result" className="mt-2" />
      </div>
    </div>
  );
}

type TargetingStep = "buyer" | "problem" | "signals" | "competitors";

const targetingStepPanelId: Record<TargetingStep, string> = {
  buyer: "targeting-buyer-panel",
  problem: "targeting-problem-panel",
  signals: "targeting-signals-panel",
  competitors: "targeting-competitors-panel",
};

/** One part of the brief: its saved answer, or its fields while editing. */
function TargetingStepCard({
  title,
  description,
  isOpen,
  isEmpty,
  isChanged,
  panelId,
  onToggle,
  view,
  children,
}: {
  title: string;
  description: string;
  isOpen: boolean;
  isEmpty: boolean;
  isChanged: boolean;
  panelId: string;
  onToggle: () => void;
  view: ReactNode;
  children: ReactNode;
}) {
  const headingId = `${panelId}-title`;

  return (
    <section aria-labelledby={headingId} className="px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={headingId} className="scroll-mt-5 text-base font-semibold text-foreground">
              {title}
            </h3>
            {isChanged ? (
              <StatusBadge tone="info" size="compact">Unsaved</StatusBadge>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
        >
          {isOpen ? "Done" : isEmpty ? "Add" : "Edit"}
          <span className="sr-only">: {title}</span>
        </Button>
      </div>
      <div id={panelId} className="mt-3">
        {isOpen ? children : view}
      </div>
    </section>
  );
}

function EmptyAnswer({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-5 text-subtle">{children}</p>;
}

function SignalGroups({ fields }: { fields: ServiceProfileFields }) {
  const groups = [
    { label: "Problems buyers mention", items: fields.pain_points },
    { label: "Moments that make it urgent", items: fields.buying_triggers },
  ].filter((group) => group.items.length > 0);

  if (groups.length === 0) return <EmptyAnswer>No signals yet.</EmptyAnswer>;
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-xs leading-5 text-subtle">{group.label}</p>
          <TagList items={group.items} className="mt-1" />
        </div>
      ))}
    </div>
  );
}

function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// While the website is being read there is nothing to edit yet. Refreshing
// lets the editor appear on its own once the first draft exists.
const PREPARING_REFRESH_MS = 10_000;

export function TargetingEditor({
  serviceProfile,
  fields,
  isPro,
  changedFieldCount,
  queryError,
  latestScan,
  savedWebsiteUrl,
  websiteDraft,
  websiteChanged,
  isWebsitePending,
  websiteResult,
  isRefreshing,
  refreshResult,
  onFieldChange,
  onDiscoveryQueriesChange,
  onSave,
  onValidate,
  onRefreshTargeting,
  onRefreshWebsite,
  onWebsiteDraftChange,
  onWebsiteReset,
  onWebsiteSave,
}: TargetingEditorProps) {
  const router = useRouter();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<TargetingStep | null>(null);
  const { isSaving } = useBriefSaveSection("profile", {
    changeCount: changedFieldCount,
    saveLabel: "Save & update targeting",
    save: onSave,
    validate: onValidate,
  });
  const requiresProfileRefresh =
    latestScan?.summary.stopReason === "profile_refresh_required";
  const readiness = targetingReadiness(serviceProfile, isPro, requiresProfileRefresh);
  const saved = serviceProfile.fields;
  const hasCategorizedQueries = fields.discovery_queries.length > 0;
  // A failed prompt check opens Advanced targeting so the invalid field is visible.
  const isAdvancedOpen = advancedOpen || queryError !== null;

  useEffect(() => {
    if (serviceProfile.hasProfile) return;
    const timer = window.setInterval(() => router.refresh(), PREPARING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router, serviceProfile.hasProfile]);

  useEffect(() => {
    if (!activeStep) return;
    document
      .getElementById(targetingStepPanelId[activeStep])
      ?.querySelector<HTMLElement>("input, textarea")
      ?.focus();
  }, [activeStep]);

  useEffect(() => {
    if (!queryError) return;
    document.getElementById(queryError.inputId)?.focus();
  }, [queryError]);

  const toggleStep = (step: TargetingStep) =>
    setActiveStep((current) => (current === step ? null : step));

  const statusPanel = (
    <section
      aria-labelledby="targeting-status-title"
      className={cn(
        "rounded-lg border bg-card",
        readiness.tone === "warning" ? "border-warning/40" : "border-border",
      )}
    >
      <h2 id="targeting-status-title" className="sr-only">
        Brief status
      </h2>
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusBadge tone={readiness.tone}>{readiness.label}</StatusBadge>
            <p className="text-sm leading-5 text-foreground">{readiness.detail}</p>
          </div>
          {isPro && serviceProfile.hasProfile ? (
            <p className="text-sm leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">Latest discovery:</span>{" "}
              {latestScanMessage(latestScan)}
            </p>
          ) : null}
          <div aria-live="polite">
            <ResultLine result={refreshResult} />
          </div>
        </div>
        {readiness.action ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRefreshing || isWebsitePending}
            onClick={
              readiness.action.run === "website" ? onRefreshWebsite : onRefreshTargeting
            }
          >
            {isRefreshing || isWebsitePending ? "Refreshing…" : readiness.action.label}
          </Button>
        ) : null}
      </div>

      <WebsiteSourceControl
        savedWebsiteUrl={savedWebsiteUrl}
        websiteDraft={websiteDraft}
        websiteChanged={websiteChanged}
        isPending={isWebsitePending}
        result={websiteResult}
        onWebsiteDraftChange={onWebsiteDraftChange}
        onWebsiteReset={onWebsiteReset}
        onWebsiteSave={onWebsiteSave}
      />
    </section>
  );

  if (!serviceProfile.hasProfile) {
    return (
      <>
        {statusPanel}
        <EmptyState
          icon={FileSearch}
          title="Your brief will appear here"
          description="Arcli drafts buyers, a problem and public signals from your website. This page updates on its own when the draft is ready, usually within a few minutes."
        />
      </>
    );
  }

  return (
    <>
      {statusPanel}

      <section
        aria-labelledby="targeting-title"
        className="rounded-lg border border-border bg-card"
      >
        <div className="px-4 pt-4 sm:px-5 sm:pt-5">
          <h2 id="targeting-title" className="text-lg font-semibold text-foreground">
            Who should Arcli look for?
          </h2>
          <p className="mt-0.5 max-w-[70ch] text-sm leading-5 text-muted-foreground">
            A practical buyer, problem and a few public signals are enough. Plausible conversations are worth a review.
          </p>
        </div>

        <div className="mt-4 divide-y divide-border border-t border-border">
          <TargetingStepCard
            title="Who has the problem?"
            description="The people, teams or company situations most likely to act."
            isOpen={activeStep === "buyer"}
            isEmpty={fields.target_audience.length === 0}
            isChanged={!sameValue(fields.target_audience, saved?.target_audience)}
            panelId={targetingStepPanelId.buyer}
            onToggle={() => toggleStep("buyer")}
            view={
              fields.target_audience.length > 0 ? (
                <TagList items={fields.target_audience} />
              ) : (
                <EmptyAnswer>No buyers yet.</EmptyAnswer>
              )
            }
          >
            <SignalField
              label="Target buyers"
              description="Roles, teams, company types or situations. A few clear groups beat a long list of job titles."
              value={fields.target_audience}
              placeholder="RevOps leaders, B2B SaaS founders"
              disabled={isSaving}
              onChange={(value) => onFieldChange("target_audience", value)}
            />
          </TargetingStepCard>

          <TargetingStepCard
            title="What are they trying to solve?"
            description="The costly or frustrating situation, in the buyer's own words."
            isOpen={activeStep === "problem"}
            isEmpty={!fields.core_problem.trim()}
            isChanged={fields.core_problem !== (saved?.core_problem ?? "")}
            panelId={targetingStepPanelId.problem}
            onToggle={() => toggleStep("problem")}
            view={
              fields.core_problem.trim() ? (
                <p className="max-w-[75ch] text-sm leading-6 text-foreground">
                  {fields.core_problem}
                </p>
              ) : (
                <EmptyAnswer>No problem described yet.</EmptyAnswer>
              )
            }
          >
            <TextProfileField
              label="Core problem"
              description="The delay, risk, cost or manual work that makes someone look for help."
              value={fields.core_problem}
              placeholder="Teams spend hours sorting noisy conversations before they know who is worth contacting."
              disabled={isSaving}
              onChange={(value) => onFieldChange("core_problem", value)}
            />
          </TargetingStepCard>

          <TargetingStepCard
            title="What should Arcli recognise publicly?"
            description="Problems and moments that make a conversation worth a human review."
            isOpen={activeStep === "signals"}
            isEmpty={fields.pain_points.length + fields.buying_triggers.length === 0}
            isChanged={
              !sameValue(fields.pain_points, saved?.pain_points) ||
              !sameValue(fields.buying_triggers, saved?.buying_triggers)
            }
            panelId={targetingStepPanelId.signals}
            onToggle={() => toggleStep("signals")}
            view={<SignalGroups fields={fields} />}
          >
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
              <SignalField
                label="Problems buyers mention"
                description="Frustrations or outcomes that come up before someone looks for a solution."
                value={fields.pain_points}
                placeholder="Manual lead research takes too long"
                disabled={isSaving}
                onChange={(value) => onFieldChange("pain_points", value)}
              />
              <SignalField
                label="Moments that make it urgent"
                description="Events or wording that suggest the buyer needs help soon."
                value={fields.buying_triggers}
                placeholder="New growth target, evaluating a tool"
                disabled={isSaving}
                onChange={(value) => onFieldChange("buying_triggers", value)}
              />
            </div>
          </TargetingStepCard>

          {/* Competitor names drive the most precise searches ("X alternative",
              "switching from X"), so they sit with the main steps, not in advanced. */}
          <TargetingStepCard
            title="Which tools do they use today?"
            description="We look for people asking for an alternative to these or moving off them."
            isOpen={activeStep === "competitors"}
            isEmpty={fields.competitor_terms.length === 0}
            isChanged={!sameValue(fields.competitor_terms, saved?.competitor_terms)}
            panelId={targetingStepPanelId.competitors}
            onToggle={() => toggleStep("competitors")}
            view={
              fields.competitor_terms.length > 0 ? (
                <TagList items={fields.competitor_terms} />
              ) : (
                <EmptyAnswer>No competitors yet. Adding two to four gives Arcli its most precise searches.</EmptyAnswer>
              )
            }
          >
            <SignalField
              label="Competitors to monitor"
              description="Products or workarounds your buyers use now. A post that only names one never counts as a signal on its own."
              value={fields.competitor_terms}
              placeholder="ExampleCRM, manual spreadsheets"
              disabled={isSaving}
              onChange={(value) => onFieldChange("competitor_terms", value)}
            />
          </TargetingStepCard>

          <div>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-b-lg px-4 py-3.5 text-left transition-colors hover:bg-off-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5"
              aria-expanded={isAdvancedOpen}
              aria-controls="targeting-advanced-panel"
              onClick={() => setAdvancedOpen(!isAdvancedOpen)}
            >
              <span className="min-w-0">
                <span className="block text-base font-semibold text-foreground">
                  Advanced targeting
                </span>
                <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">
                  Buyer language and what to ignore.
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                  isAdvancedOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>

            {isAdvancedOpen ? (
              <div id="targeting-advanced-panel" className="space-y-6 px-4 pb-5 pt-1 sm:px-5">
                <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
                  <SignalField
                    label="Useful outcomes"
                    description="Results a buyer is actively trying to achieve."
                    value={fields.use_cases}
                    placeholder="Avoid manual handoffs that delay work"
                    disabled={isSaving}
                    onChange={(value) => onFieldChange("use_cases", value)}
                  />
                  <SignalField
                    label="Urgency signals"
                    description="Words or events that show a problem needs attention soon."
                    value={fields.urgency_signals}
                    placeholder="Customers are blocked, deadline this week"
                    disabled={isSaving}
                    onChange={(value) => onFieldChange("urgency_signals", value)}
                  />
                  {!hasCategorizedQueries ? (
                    <SignalField
                      label="Buyer-language phrases"
                      description="Natural phrases a buyer might use when asking for help."
                      value={fields.search_terms}
                      placeholder="Need a better way to handle failed payments"
                      disabled={isSaving}
                      onChange={(value) => onFieldChange("search_terms", value)}
                    />
                  ) : null}
                </div>

                <TextProfileField
                  label="Why you are a good fit"
                  description="Optional. Helps separate the problem you solve from a broad category."
                  value={fields.unique_value_prop}
                  placeholder="We turn public buyer signals into explainable prospect matches."
                  disabled={isSaving}
                  onChange={(value) => onFieldChange("unique_value_prop", value)}
                />

                <div>
                  {queryError ? (
                    <p role="alert" className="mb-2 flex items-start gap-2 text-sm leading-5 text-danger">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {queryError.message}
                    </p>
                  ) : null}
                  <DiscoveryQueryEditor
                    value={fields.discovery_queries}
                    disabled={isSaving}
                    onChange={onDiscoveryQueriesChange}
                  />
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
                  <SignalField
                    label="Exclude these audiences"
                    description="People or companies whose conversations should never count as prospects."
                    value={fields.excluded_audiences}
                    placeholder="Agencies, job seekers"
                    disabled={isSaving}
                    onChange={(value) => onFieldChange("excluded_audiences", value)}
                  />
                  <SignalField
                    label="Ignore these terms"
                    description="Words that commonly create weak or irrelevant matches."
                    value={fields.negative_keywords}
                    placeholder="Student, free template"
                    disabled={isSaving}
                    onChange={(value) => onFieldChange("negative_keywords", value)}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
