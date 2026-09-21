"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Globe2,
  Loader2,
  Save,
  Settings2,
  Target,
} from "lucide-react";

import type {
  BuyerDemandReportView,
  ProspectActionResult,
  ServiceProfileFields,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { DiscoveryQueryEditor } from "@/components/onboarding/workspace-provisioning-profile";
import { ResultText } from "@/components/onboarding/workspace-provisioning-states";
import { Button } from "@/components/ui/button";
import type { DiscoveryQuery } from "@/lib/discovery-queries";
import { C } from "@/lib/tokens";
import { SignalField, TextProfileField } from "./targeting-fields";
import { websiteDomain } from "./website-url";

type TargetingEditorProps = {
  serviceProfile: ServiceProfileView;
  fields: ServiceProfileFields;
  isPro: boolean;
  changedFieldCount: number;
  isPending: boolean;
  isWebsitePending: boolean;
  result: ProspectActionResult | null;
  websiteDraft: string;
  websiteChanged: boolean;
  latestScan: Pick<
    BuyerDemandReportView,
    "status" | "updatedAt" | "isTerminal" | "summary"
  > | null;
  onFieldChange: <Key extends keyof ServiceProfileFields>(
    key: Key,
    value: ServiceProfileFields[Key],
  ) => void;
  onDiscoveryQueriesChange: (value: DiscoveryQuery[]) => void;
  onSave: () => void;
  onWebsiteDraftChange: (value: string) => void;
  onWebsiteSave: () => void;
};

type Readiness = {
  label: string;
  detail: string;
  color: string;
  backgroundColor: string;
};

function targetingReadiness(
  serviceProfile: ServiceProfileView,
  isPro: boolean,
): Readiness {
  if (!serviceProfile.hasProfile) {
    return {
      label: "Preparing",
      detail: "Reading your website to prepare targeting.",
      color: C.blue,
      backgroundColor: C.bluePale,
    };
  }
  if (serviceProfile.embeddingStatus === "failed") {
    return {
      label: "Needs refresh",
      detail: "Refresh the targeting profile before the next scan.",
      color: C.amber,
      backgroundColor: C.amberPale,
    };
  }
  if (!isPro) {
    return {
      label: "Profile ready",
      detail: "Your saved targeting is ready when lead discovery is available.",
      color: C.green,
      backgroundColor: C.greenPale,
    };
  }
  if (serviceProfile.embeddingStatus !== "completed") {
    return {
      label: "Updating",
      detail: "Your last saved targeting remains active while this updates.",
      color: C.blue,
      backgroundColor: C.bluePale,
    };
  }
  return {
    label: "Active",
    detail: "This targeting is used in your next discovery scan.",
    color: C.green,
    backgroundColor: C.greenPale,
  };
}

function WebsiteSourceControl({
  websiteDraft,
  websiteChanged,
  requiresProfileRefresh,
  isPending,
  onWebsiteDraftChange,
  onWebsiteSave,
}: Pick<
  TargetingEditorProps,
  | "websiteDraft"
  | "websiteChanged"
  | "onWebsiteDraftChange"
  | "onWebsiteSave"
> & { isPending: boolean; requiresProfileRefresh: boolean }) {
  const [isChanging, setIsChanging] = useState(false);
  const domain = websiteDomain(websiteDraft) ?? "Website needed";

  return (
    <section
      className="rounded-xl border bg-white px-4 py-3"
      style={{ borderColor: C.rule }}
      aria-labelledby="targeting-website-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: C.bluePale, color: C.blue }}
          >
            <Globe2 className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p
              id="targeting-website-title"
              className="text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: C.blue }}
            >
              Website source
            </p>
            <p className="truncate text-sm font-semibold" style={{ color: C.navy }}>
              {domain}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => setIsChanging((current) => !current)}
          style={{ color: C.blue }}
        >
          {isChanging ? "Cancel" : "Change website"}
        </Button>
      </div>

      {isChanging ? (
        <div
          className="mt-3 border-t pt-3"
          style={{ borderColor: C.rule }}
        >
          <label
            htmlFor="targeting-website-url"
            className="text-xs font-semibold"
            style={{ color: C.navy }}
          >
            New website URL
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="targeting-website-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              value={websiteDraft}
              disabled={isPending}
              className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              style={{ borderColor: C.rule, color: C.navy }}
              onChange={(event) => onWebsiteDraftChange(event.target.value)}
            />
            <Button
              type="button"
              className="h-10 shrink-0"
              disabled={isPending || !websiteDraft.trim() || !websiteChanged}
              onClick={onWebsiteSave}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {isPending ? "Saving..." : "Save and rebuild"}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>
            Changing the source rebuilds this targeting profile before Arcli looks for new conversations.
          </p>
        </div>
      ) : null}

      {requiresProfileRefresh ? (
        <div
          className="mt-3 flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: C.amber, backgroundColor: C.amberPale }}
        >
          <p className="text-xs leading-5" style={{ color: C.amber }}>
            The latest scan needs a fresh website profile before matching can resume.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={onWebsiteSave}
            style={{ borderColor: C.amber, color: C.amber }}
          >
            {isPending ? "Refreshing..." : "Refresh website profile"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

type TargetingStep = "buyer" | "problem" | "signals";

const targetingStepPanelId: Record<TargetingStep, string> = {
  buyer: "targeting-buyer-panel",
  problem: "targeting-problem-panel",
  signals: "targeting-signals-panel",
};

function TargetingStepCard({
  step,
  title,
  description,
  summary,
  isOpen,
  onClick,
  panelId,
}: {
  step: number;
  title: string;
  description: string;
  summary: string;
  isOpen: boolean;
  onClick: () => void;
  panelId: string;
}) {
  return (
    <button
      type="button"
      className="flex min-h-44 w-full flex-col rounded-xl border bg-white p-4 text-left transition-colors hover:bg-[#F8FBFD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ borderColor: isOpen ? C.blue : C.rule }}
      aria-expanded={isOpen}
      aria-controls={panelId}
      onClick={onClick}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{ backgroundColor: C.bluePale, color: C.blue }}
        >
          {step}
        </span>
        <ChevronDown
          className={isOpen ? "size-4 rotate-180" : "size-4"}
          style={{ color: C.muted }}
          aria-hidden="true"
        />
      </div>
      <h2 className="mt-4 text-base font-semibold" style={{ color: C.navy }}>
        {title}
      </h2>
      <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
        {description}
      </p>
      <p
        className="mt-auto line-clamp-2 pt-3 text-xs font-semibold leading-5"
        style={{ color: C.blue }}
      >
        {summary}
      </p>
    </button>
  );
}

function latestScanMessage(
  latestScan: TargetingEditorProps["latestScan"],
) {
  if (!latestScan) {
    return "No current discovery result yet. Your saved targeting will be used when the next scan runs.";
  }

  if (latestScan.summary.stopReason === "profile_refresh_required") {
    return "The last scan stopped before matching because its website profile needs a refresh.";
  }

  if (!latestScan.isTerminal) {
    return "A discovery scan is still using this targeting. Results will appear in Prospects when it finishes.";
  }

  const conversations = latestScan.summary.totalHits;
  const plausible = latestScan.summary.plausibleHits;
  if (conversations !== null && plausible !== null) {
    return `Latest scan checked ${conversations} public ${conversations === 1 ? "conversation" : "conversations"} and surfaced ${plausible} plausible ${plausible === 1 ? "opportunity" : "opportunities"}.`;
  }

  return "The latest discovery scan finished. Review Prospects for its matching results.";
}

export function TargetingEditor({
  serviceProfile,
  fields,
  isPro,
  changedFieldCount,
  isPending,
  isWebsitePending,
  result,
  websiteDraft,
  websiteChanged,
  latestScan,
  onFieldChange,
  onDiscoveryQueriesChange,
  onSave,
  onWebsiteDraftChange,
  onWebsiteSave,
}: TargetingEditorProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<TargetingStep | null>(null);
  const readiness = targetingReadiness(serviceProfile, isPro);
  const hasCategorizedQueries = fields.discovery_queries.length > 0;
  const requiresProfileRefresh =
    latestScan?.summary.stopReason === "profile_refresh_required";
  const needsRefresh =
    serviceProfile.hasProfile &&
    isPro &&
    serviceProfile.embeddingStatus !== "completed";
  const canSave = changedFieldCount > 0 || needsRefresh;
  const saveLabel = isPending
    ? "Saving..."
    : changedFieldCount > 0
      ? "Save & update targeting"
      : "Refresh targeting";
  const buyerSummary =
    fields.target_audience.length > 0
      ? `${fields.target_audience.length} buyer ${fields.target_audience.length === 1 ? "group" : "groups"} defined`
      : "Add target buyers";
  const problemSummary = fields.core_problem.trim() || "Describe the problem";
  const signalCount = fields.pain_points.length + fields.buying_triggers.length;
  const signalSummary =
    signalCount > 0
      ? `${signalCount} public ${signalCount === 1 ? "signal" : "signals"} defined`
      : "Add public signals";

  return (
    <div className="space-y-4">
      <section
        className="rounded-xl border bg-white p-4 sm:p-5"
        style={{ borderColor: C.rule }}
        aria-labelledby="targeting-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: C.bluePale, color: C.blue }}
            >
              <Target className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 id="targeting-title" className="text-xl font-semibold" style={{ color: C.navy }}>
                Who should Arcli look for?
              </h2>
            </div>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ color: readiness.color, backgroundColor: readiness.backgroundColor }}
          >
            {readiness.label}
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6" style={{ color: C.navySoft }}>
          Give Arcli a practical buyer, problem, and a few public signals. You do not need a perfect customer profile—plausible conversations are enough to review.
        </p>
        <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>
          {readiness.detail}
        </p>
        <p className="mt-2 text-xs leading-5" style={{ color: C.navySoft }}>
          <span className="font-semibold" style={{ color: C.navy }}>
            Latest discovery: 
          </span>
          {latestScanMessage(latestScan)}
        </p>
      </section>

      <WebsiteSourceControl
        websiteDraft={websiteDraft}
        websiteChanged={websiteChanged}
        requiresProfileRefresh={requiresProfileRefresh}
        isPending={isWebsitePending}
        onWebsiteDraftChange={onWebsiteDraftChange}
        onWebsiteSave={onWebsiteSave}
      />

      {!serviceProfile.hasProfile ? (
        <section
          className="rounded-xl border px-4 py-5"
          style={{ borderColor: C.blueLight, backgroundColor: C.bluePale }}
        >
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 size-4 animate-spin" style={{ color: C.blue }} aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold" style={{ color: C.navy }}>
                Preparing your starting point
              </h2>
              <p className="mt-1 text-xs leading-5" style={{ color: C.navySoft }}>
                Arcli is turning the website into an editable targeting draft. Return here when preparation finishes to refine the buyer, problem, and signals.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <TargetingStepCard
              step={1}
              title="Who has the problem?"
              description="Name the people, teams, or company situations most likely to act."
              summary={buyerSummary}
              isOpen={activeStep === "buyer"}
              onClick={() => setActiveStep((current) => current === "buyer" ? null : "buyer")}
              panelId={targetingStepPanelId.buyer}
            />
            <TargetingStepCard
              step={2}
              title="What are they trying to solve?"
              description="Describe the costly or frustrating situation in the buyer's own terms."
              summary={problemSummary}
              isOpen={activeStep === "problem"}
              onClick={() => setActiveStep((current) => current === "problem" ? null : "problem")}
              panelId={targetingStepPanelId.problem}
            />
            <TargetingStepCard
              step={3}
              title="What should Arcli recognise publicly?"
              description="Add the problems and moments that make a conversation worth a human review."
              summary={signalSummary}
              isOpen={activeStep === "signals"}
              onClick={() => setActiveStep((current) => current === "signals" ? null : "signals")}
              panelId={targetingStepPanelId.signals}
            />
          </div>

          {activeStep === "buyer" ? (
            <section
              id={targetingStepPanelId.buyer}
              className="rounded-xl border bg-white p-4"
              style={{ borderColor: C.blue }}
            >
              <SignalField
                label="Target buyers"
                description="Use roles, teams, company types, or situations—not a long list of job titles."
                value={fields.target_audience}
                placeholder="RevOps leaders, B2B SaaS founders"
                disabled={isPending}
                onChange={(value) => onFieldChange("target_audience", value)}
              />
            </section>
          ) : null}

          {activeStep === "problem" ? (
            <section
              id={targetingStepPanelId.problem}
              className="rounded-xl border bg-white p-4"
              style={{ borderColor: C.blue }}
            >
              <TextProfileField
                label="Core problem"
                description="Focus on the delay, risk, cost, or manual work that makes someone look for help."
                value={fields.core_problem}
                placeholder="Teams spend hours sorting noisy conversations before they know who is worth contacting."
                disabled={isPending}
                onChange={(value) => onFieldChange("core_problem", value)}
              />
            </section>
          ) : null}

          {activeStep === "signals" ? (
            <section
              id={targetingStepPanelId.signals}
              className="rounded-xl border bg-white p-4"
              style={{ borderColor: C.blue }}
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <SignalField
                  label="Problems buyers mention"
                  description="Frustrations or outcomes that appear before someone seeks a solution."
                  value={fields.pain_points}
                  placeholder="Manual lead research takes too long"
                  disabled={isPending}
                  onChange={(value) => onFieldChange("pain_points", value)}
                />
                <SignalField
                  label="Moments that make it urgent"
                  description="Events or wording that suggest the buyer may need help soon."
                  value={fields.buying_triggers}
                  placeholder="New growth target, evaluating a tool"
                  disabled={isPending}
                  onChange={(value) => onFieldChange("buying_triggers", value)}
                />
              </div>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: C.rule }}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((current) => !current)}
            >
              <span className="flex items-center gap-2.5">
                <Settings2 className="size-4" style={{ color: C.blue }} aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold" style={{ color: C.navy }}>
                    Advanced targeting
                  </span>
                  <span className="mt-0.5 block text-xs leading-5" style={{ color: C.muted }}>
                    Fine-tune buyer language and keep common false positives out.
                  </span>
                </span>
              </span>
              <ChevronDown
                className={advancedOpen ? "size-4 rotate-180" : "size-4"}
                style={{ color: C.muted }}
                aria-hidden="true"
              />
            </button>

            {advancedOpen ? (
              <div className="space-y-4 border-t p-4" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
                <div className="grid gap-3 lg:grid-cols-2">
                  <SignalField
                    label="Useful outcomes"
                    description="Results a buyer is actively trying to achieve."
                    value={fields.use_cases}
                    placeholder="Avoid manual handoffs that delay work"
                    disabled={isPending}
                    onChange={(value) => onFieldChange("use_cases", value)}
                  />
                  <SignalField
                    label="Urgency signals"
                    description="Specific words or events that show a problem needs attention soon."
                    value={fields.urgency_signals}
                    placeholder="Customers are blocked, deadline this week"
                    disabled={isPending}
                    onChange={(value) => onFieldChange("urgency_signals", value)}
                  />
                  <SignalField
                    label="Competitors to monitor"
                    description="Alternatives that can reveal comparison or switching conversations."
                    value={fields.competitor_terms}
                    placeholder="ExampleCRM, manual spreadsheets"
                    disabled={isPending}
                    onChange={(value) => onFieldChange("competitor_terms", value)}
                  />
                  {!hasCategorizedQueries ? (
                    <SignalField
                      label="Buyer-language phrases"
                      description="Natural phrases a buyer might use when asking for help."
                      value={fields.search_terms}
                      placeholder="Need a better way to handle failed payments"
                      disabled={isPending}
                      onChange={(value) => onFieldChange("search_terms", value)}
                    />
                  ) : null}
                </div>

                <TextProfileField
                  label="Why you are a good fit"
                  description="Optional context that helps distinguish the problem you solve from a broad category."
                  value={fields.unique_value_prop}
                  placeholder="We turn public buyer signals into explainable prospect matches."
                  disabled={isPending}
                  onChange={(value) => onFieldChange("unique_value_prop", value)}
                />

                <DiscoveryQueryEditor
                  value={fields.discovery_queries}
                  disabled={isPending}
                  onChange={onDiscoveryQueriesChange}
                />

                <div className="grid gap-3 lg:grid-cols-2">
                  <SignalField
                    label="Exclude these audiences"
                    description="People or companies Arcli should not treat as prospects."
                    value={fields.excluded_audiences}
                    placeholder="Agencies, job seekers"
                    disabled={isPending}
                    onChange={(value) => onFieldChange("excluded_audiences", value)}
                  />
                  <SignalField
                    label="Ignore these terms"
                    description="Words that commonly create weak or irrelevant matches."
                    value={fields.negative_keywords}
                    placeholder="Student, free template"
                    disabled={isPending}
                    onChange={(value) => onFieldChange("negative_keywords", value)}
                  />
                </div>
              </div>
            ) : null}
          </section>

          <div
            className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: C.rule }}
          >
            <div className="min-w-0" aria-live="polite">
              <ResultText result={result} />
              <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                {changedFieldCount > 0
                  ? `${changedFieldCount} ${changedFieldCount === 1 ? "change" : "changes"} will update matching for the next scan.`
                  : needsRefresh
                    ? "Refresh the targeting profile before the next scan."
                    : "Your saved targeting is ready for the next scan."}
              </p>
            </div>
            <Button
              type="button"
              disabled={isPending || !canSave}
              className="h-10 shrink-0"
              onClick={onSave}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              {saveLabel}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
