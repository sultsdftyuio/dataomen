"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CircleDotDashed,
  FileSearch,
  Globe2,
  Loader2,
  Radar,
  Save,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DiscoveryQueryEditor,
  EMPTY_FIELDS,
  type ProfilePersistIntent,
} from "@/components/onboarding/workspace-provisioning-profile";
import { ResultText } from "@/components/onboarding/workspace-provisioning-states";
import type {
  BuyerDemandReportView,
  CrawlJobView,
  ProspectActionResult,
  ServiceProfileFields,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import {
  DISCOVERY_QUERY_TYPES,
  type DiscoveryQuery,
} from "@/lib/discovery-queries";
import { C } from "@/lib/tokens";
import { TargetingEditor } from "./targeting-editor";
import {
  normalizeSignals,
  SignalField,
  TextProfileField,
} from "./targeting-fields";
import { normalizeWebsiteUrl, websiteDomain } from "./website-url";

type SignalFieldKey =
  | "target_audience"
  | "use_cases"
  | "pain_points"
  | "buying_triggers"
  | "urgency_signals"
  | "search_terms"
  | "competitor_terms"
  | "negative_keywords"
  | "excluded_audiences";

type TextFieldKey = "core_problem" | "unique_value_prop";

type ServiceProfileSettingsProps = {
  serviceProfile: ServiceProfileView;
  crawlJob: CrawlJobView | null;
  websiteUrl: string;
  isPro: boolean;
  latestScan?: Pick<
    BuyerDemandReportView,
    "status" | "updatedAt" | "isTerminal" | "summary"
  > | null;
  onFieldsChange?: (fields: ServiceProfileFields) => void;
  layout?: "standard" | "progressive";
};

type SettingsProfileResponse = {
  error?: string;
  message?: string;
  scanStarted?: boolean;
  details?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
};

type UpdateField = <Key extends keyof ServiceProfileFields>(
  key: Key,
  value: ServiceProfileFields[Key],
) => void;

const SIGNAL_FIELDS: Array<{
  key: SignalFieldKey;
  label: string;
  description: string;
  placeholder: string;
}> = [
  {
    key: "target_audience",
    label: "Target audience",
    description: "Roles, teams, and company types most likely to buy.",
    placeholder: "RevOps leaders, B2B SaaS founders",
  },
  {
    key: "use_cases",
    label: "Primary use cases",
    description: "Outcomes buyers are actively trying to achieve.",
    placeholder: "Avoid manual handoffs that delay work",
  },
  {
    key: "pain_points",
    label: "Pain points",
    description: "Specific frustrations prospects mention before searching.",
    placeholder: "Manual lead research takes too long",
  },
  {
    key: "buying_triggers",
    label: "Buying triggers",
    description: "Events that make the problem urgent enough to act on.",
    placeholder: "New growth target, tool evaluation",
  },
  {
    key: "urgency_signals",
    label: "Urgency signals",
    description: "Words or events that show a buyer needs a solution soon.",
    placeholder: "Customers are blocked, deadline this week",
  },
  {
    key: "search_terms",
    label: "Buyer-language phrases",
    description:
      "Short phrases a buyer would naturally write while looking for help. Legacy profiles use these until a categorized plan is available.",
    placeholder: "e.g. need a better way to handle failed payments",
  },
  {
    key: "competitor_terms",
    label: "Competitors to monitor",
    description:
      "Named alternatives to watch for complaints, comparisons, and switching conversations. A name alone never qualifies a lead.",
    placeholder: "ExampleCRM, manual spreadsheets",
  },
  {
    key: "negative_keywords",
    label: "Negative keywords",
    description: "Terms that usually indicate weak or irrelevant intent.",
    placeholder: "student, free template",
  },
  {
    key: "excluded_audiences",
    label: "Excluded audiences",
    description: "People or companies the discovery engine should ignore.",
    placeholder: "Agencies, job seekers",
  },
];

const TEXT_FIELDS: Array<{
  key: TextFieldKey;
  label: string;
  description: string;
  placeholder: string;
}> = [
  {
    key: "core_problem",
    label: "Core problem",
    description: "The painful situation that creates urgency.",
    placeholder:
      "Example: Teams spend hours scanning noisy sources before they can tell which prospects are worth reviewing.",
  },
  {
    key: "unique_value_prop",
    label: "Unique value proposition",
    description: "Why your approach is meaningfully different.",
    placeholder:
      "Example: Arcli turns public buying signals into verified prospect matches with explainable fit reasons.",
  },
];

async function readSettingsProfileResult(
  response: Response,
): Promise<ProspectActionResult> {
  const payload = (await response
    .json()
    .catch(() => ({}))) as SettingsProfileResponse;

  if (!response.ok) {
    const validationMessage = [
      ...(payload.details?.fieldErrors?.discovery_queries ?? []),
      ...(payload.details?.formErrors ?? []),
    ].find((message) => message.trim().length > 0);

    return {
      ok: false,
      message:
        validationMessage ??
        payload.error ??
        "Could not update the service profile. Check the fields and try again.",
    };
  }

  return {
    ok: payload.scanStarted !== false,
    message:
      payload.message ?? "Service profile saved. Matching embeddings are regenerating.",
  };
}

export function ServiceProfileSettings({
  serviceProfile,
  crawlJob,
  websiteUrl,
  isPro,
  latestScan = null,
  onFieldsChange,
  layout = "standard",
}: ServiceProfileSettingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isWebsitePending, startWebsiteTransition] = useTransition();
  const resolvedWebsiteUrl = serviceProfile.websiteUrl ?? websiteUrl;
  const [websiteDraft, setWebsiteDraft] = useState(resolvedWebsiteUrl);
  const [profileFields, setProfileFields] = useState<ServiceProfileFields>(
    serviceProfile.fields ?? EMPTY_FIELDS,
  );
  const [profileResult, setProfileResult] =
    useState<ProspectActionResult | null>(null);

  useEffect(() => {
    setProfileFields(serviceProfile.fields ?? EMPTY_FIELDS);
  }, [serviceProfile.id, serviceProfile.updatedAt, serviceProfile.fields]);

  useEffect(() => {
    setWebsiteDraft(resolvedWebsiteUrl);
  }, [resolvedWebsiteUrl]);

  useEffect(() => {
    onFieldsChange?.(profileFields);
  }, [onFieldsChange, profileFields]);

  const hasProfileContent = useMemo(
    () =>
      Object.values(profileFields).some((value) =>
        Array.isArray(value)
          ? value.length > 0
          : value.trim().length > 0,
      ),
    [profileFields],
  );
  const changedFieldCount = useMemo(() => {
    const initialFields = serviceProfile.fields ?? EMPTY_FIELDS;

    return (Object.keys(profileFields) as Array<keyof ServiceProfileFields>).filter(
      (key) =>
        JSON.stringify(profileFields[key]) !== JSON.stringify(initialFields[key]),
    ).length;
  }, [profileFields, serviceProfile.fields]);

  const updateField: UpdateField = (key, value) => {
    setProfileFields((current) => ({ ...current, [key]: value }));
  };

  const updateDiscoveryQueries = (value: DiscoveryQuery[]) => {
    updateField("discovery_queries", value);
    if (value.length === DISCOVERY_QUERY_TYPES.length) {
      updateField(
        "search_terms",
        normalizeSignals(value.map((query) => query.phrase)),
      );
    }
  };

  const persistProfile = (_intent: ProfilePersistIntent) => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/workspace", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceProfileId: serviceProfile.id,
            serviceProfile: profileFields,
          }),
        });

        const result = await readSettingsProfileResult(response);
        setProfileResult(
          result.ok
            ? {
                ok: true,
                message:
                  isPro
                    ? "Brief refresh queued. Matching will use your saved buyer, problem, and signal updates."
                    : "Brief saved. Lead discovery remains locked until you upgrade to Pro.",
              }
            : result,
        );

        if (result.ok || response.status === 202) {
          router.refresh();
        }
      } catch {
        setProfileResult({
          ok: false,
          message: "Could not reach the workspace settings API.",
        });
      }
    });
  };

  const refreshWebsiteContext = () => {
    startWebsiteTransition(async () => {
      let normalizedWebsiteUrl: string;
      try {
        normalizedWebsiteUrl = normalizeWebsiteUrl(websiteDraft);
      } catch (error) {
        setProfileResult({
          ok: false,
          message:
            error instanceof Error ? error.message : "Enter a valid website URL.",
        });
        return;
      }

      try {
        const response = await fetch("/api/settings/workspace", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl: normalizedWebsiteUrl }),
        });
        const result = await readSettingsProfileResult(response);
        setProfileResult(
          result.ok
            ? {
                ok: true,
                message:
                  isPro
                    ? "Website update queued. Arcli will rebuild your matching brief, then continue automatic 24–48 hour refreshes."
                    : "Website update queued. Your Free plan includes this one website crawl; upgrade to enable ongoing monitoring and lead discovery.",
              }
            : result,
        );
        if (result.ok) {
          router.refresh();
          return;
        }

        router.refresh();
      } catch {
        setProfileResult({
          ok: false,
          message: "Could not reach the workspace settings API.",
        });
      }
    });
  };

  const websiteChanged = (() => {
    try {
      return normalizeWebsiteUrl(websiteDraft) !== normalizeWebsiteUrl(resolvedWebsiteUrl);
    } catch {
      return false;
    }
  })();

  if (layout === "progressive") {
    return (
      <TargetingEditor
        serviceProfile={serviceProfile}
        fields={profileFields}
        isPro={isPro}
        changedFieldCount={changedFieldCount}
        isPending={isPending}
        isWebsitePending={isWebsitePending}
        result={profileResult}
        websiteDraft={websiteDraft}
        websiteChanged={websiteChanged}
        latestScan={latestScan}
        onFieldChange={updateField}
        onDiscoveryQueriesChange={updateDiscoveryQueries}
        onSave={() => persistProfile("save")}
        onWebsiteDraftChange={setWebsiteDraft}
        onWebsiteSave={refreshWebsiteContext}
      />
    );
  }

  if (!serviceProfile.hasProfile) {
    return (
      <section
        className="rounded-md border bg-white p-3 shadow-sm"
        style={{ borderColor: C.rule }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: C.bluePale, color: C.blue }}
          >
            <CircleDotDashed className="size-4 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xs font-semibold" style={{ color: C.navy }}>
              Getting ready
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
              The editable matching brief will appear here after the crawl
              extracts the first profile for this workspace.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const statusLabel = !isPro
    ? "Profile ready"
    : serviceProfile.embeddingStatus === "completed"
      ? "Active"
      : "Regenerating";
  const activeWebsiteDomain = websiteDomain(resolvedWebsiteUrl);
  const draftedWebsiteDomain = websiteDomain(websiteDraft);
  return (
    <div className="space-y-5">
      <section
        className="overflow-hidden rounded-xl border bg-white shadow-sm"
        style={{ borderColor: C.rule }}
        aria-labelledby="discovery-source-title"
      >
        <div className="h-1" style={{ backgroundColor: C.blue }} />
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className="flex size-10 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: C.bluePale, color: C.blue }}
              >
                <Globe2 className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: C.blue }}>
                  Source of truth
                </p>
                <h2 id="discovery-source-title" className="mt-1 text-lg font-semibold tracking-tight" style={{ color: C.navy }}>
                  Your discovery website
                </h2>
                <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                  This site defines the buyer brief behind every scan and lead decision.
                </p>
              </div>
            </div>
            <span
              className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
              style={{ borderColor: C.green, backgroundColor: C.greenPale, color: C.green }}
            >
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              {statusLabel}
            </span>
          </div>

          <div className="mt-5">
            <label htmlFor="matching-website-url" className="text-sm font-semibold" style={{ color: C.navy }}>
              Website to analyze
            </label>
            <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Globe2
                  className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2"
                  style={{ color: C.muted }}
                  aria-hidden="true"
                />
                <input
                  id="matching-website-url"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  spellCheck={false}
                  value={websiteDraft}
                  disabled={isWebsitePending}
                  className="h-12 w-full rounded-lg border bg-background py-2 pl-12 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  style={{ borderColor: draftedWebsiteDomain ? C.blueLight : C.rule, color: C.navy }}
                  onChange={(event) => setWebsiteDraft(event.target.value)}
                />
              </div>
              <Button
                type="button"
                className="h-12 shrink-0 rounded-lg px-4"
                disabled={isWebsitePending || !websiteDraft.trim() || !websiteChanged}
                onClick={refreshWebsiteContext}
                style={{ backgroundColor: C.navy, color: C.white }}
              >
                {isWebsitePending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="size-4" aria-hidden="true" />
                )}
                {isWebsitePending ? "Saving..." : "Save website"}
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: C.muted }}>
              {draftedWebsiteDomain ? (
                <span className="inline-flex items-center gap-1.5" style={{ color: C.green }}>
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  Ready to update {draftedWebsiteDomain}
                </span>
              ) : (
                <span>Paste a domain or full URL. We add https automatically.</span>
              )}
              {activeWebsiteDomain && !websiteChanged ? <span>Currently using {activeWebsiteDomain}</span> : null}
            </div>
          </div>

          {websiteChanged ? (
            <div
              className="mt-4 rounded-lg border px-3 py-3 text-xs leading-5"
              style={{ borderColor: C.amber, backgroundColor: C.amberPale, color: C.amber }}
            >
              <span className="font-semibold">You are replacing the discovery source.</span>{" "}
              We will crawl this website and create a fresh matching brief for it.
            </div>
          ) : null}

          <ol className="mt-5 grid gap-2 sm:grid-cols-3">
            {[
              { icon: FileSearch, label: "Read key pages" },
              { icon: Target, label: "Build your brief" },
              { icon: Radar, label: "Scan conversations" },
            ].map(({ icon: Icon, label }, index) => (
              <li key={label} className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs" style={{ borderColor: C.rule, color: C.navySoft }}>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ backgroundColor: C.bluePale, color: C.blue }}>{index + 1}</span>
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="font-medium">{label}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {!hasProfileContent ? (
        <div
          className="rounded-lg border px-4 py-3 text-sm leading-6"
          style={{
            borderColor: C.blueLight,
            backgroundColor: C.bluePale,
            color: C.navySoft,
          }}
        >
          No matching signals have been extracted yet. You can add the brief
          manually here, or wait for regeneration to finish and refresh the
          workspace.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {SIGNAL_FIELDS.slice(0, 2).map((field) => (
          <SignalField
            key={field.key}
            label={field.label}
            description={field.description}
            value={profileFields[field.key]}
            placeholder={field.placeholder}
            disabled={isPending}
            onChange={(value) => updateField(field.key, value)}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {TEXT_FIELDS.map((field) => (
          <TextProfileField
            key={field.key}
            label={field.label}
            description={field.description}
            value={profileFields[field.key]}
            placeholder={field.placeholder}
            disabled={isPending}
            onChange={(value) => updateField(field.key, value)}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SIGNAL_FIELDS.slice(2)
          .filter(
            (field) =>
              field.key !== "search_terms" ||
              profileFields.discovery_queries.length === 0,
          )
          .map((field) => (
            <SignalField
              key={field.key}
              label={field.label}
              description={field.description}
              value={profileFields[field.key]}
              placeholder={field.placeholder}
              disabled={isPending}
              onChange={(value) => updateField(field.key, value)}
            />
          ))}
      </div>

      <DiscoveryQueryEditor
        value={profileFields.discovery_queries}
        disabled={isPending}
        onChange={updateDiscoveryQueries}
      />

      <div
        className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: C.rule }}
      >
        <div className="min-w-0" aria-live="polite">
          <ResultText result={profileResult} />
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            Saving updates the matching brief without re-crawling the website.
          </p>
        </div>

        <Button
          type="button"
          disabled={isPending}
          className="h-9 shrink-0 rounded-md"
          onClick={() => persistProfile("save")}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {isPending ? "Saving..." : "Save brief"}
        </Button>
      </div>
    </div>
  );
}
