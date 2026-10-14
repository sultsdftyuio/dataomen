"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { BriefSaveOutcome } from "@/app/(dashboard)/dashboard/brief/brief-save";
import {
  EMPTY_FIELDS,
} from "@/components/onboarding/workspace-provisioning-profile";
import type {
  BuyerDemandReportView,
  ProspectActionResult,
  ServiceProfileFields,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import {
  DISCOVERY_QUERY_TYPES,
  discoveryQueryPlanValidationError,
  discoveryQueryTypeLabel,
  type DiscoveryQuery,
} from "@/lib/discovery-queries";
import { TargetingEditor, type DiscoveryQueryError } from "./targeting-editor";
import { normalizeSignals } from "./targeting-fields";
import { normalizeWebsiteUrl, websiteDomain } from "./website-url";

type ServiceProfileSettingsProps = {
  serviceProfile: ServiceProfileView;
  websiteUrl: string;
  isPro: boolean;
  latestScan?: Pick<
    BuyerDemandReportView,
    "status" | "updatedAt" | "isTerminal" | "summary"
  > | null;
};

type SettingsProfileResponse = {
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

type SettingsRequestResult =
  | { kind: "saved" }
  | { kind: "saved-without-scan" }
  | { kind: "invalid-queries" }
  | { kind: "failed" };

const NETWORK_FAILURE =
  "Couldn't reach Arcli. Check your connection and try again; your changes are still here.";

// The settings API's own messages are written for operators (worker names,
// schema rules), so they are logged by the API and never shown here.
async function sendSettingsUpdate(body: object): Promise<SettingsRequestResult> {
  const response = await fetch("/api/settings/workspace", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response
    .json()
    .catch(() => ({}))) as SettingsProfileResponse;

  if (!response.ok) {
    return payload.details?.fieldErrors?.discovery_queries?.length
      ? { kind: "invalid-queries" }
      : { kind: "failed" };
  }
  return payload.scanStarted === false
    ? { kind: "saved-without-scan" }
    : { kind: "saved" };
}

function discoveryQueryInputId(index: number) {
  // Matches the input ids DiscoveryQueryEditor renders for each prompt slot.
  return `discovery-query-${DISCOVERY_QUERY_TYPES[index]}-${index}`;
}

const INVALID_QUERIES: DiscoveryQueryError = {
  message:
    "Check the search prompts in Advanced targeting: each needs 2 to 14 words, written the way a buyer would put it, with no repeats or site names.",
  inputId: discoveryQueryInputId(0),
};

/** Mirrors the API's prompt rules so the failing slot can be named and focused. */
function discoveryQueryError(queries: readonly DiscoveryQuery[]): DiscoveryQueryError | null {
  if (queries.length === 0) return null;

  const filled = new Set(
    queries.filter((query) => query.phrase.trim()).map((query) => query.query_type),
  );
  const missingIndex = DISCOVERY_QUERY_TYPES.findIndex((type) => !filled.has(type));
  if (missingIndex >= 0) {
    return {
      message: `Enter a phrase for "${discoveryQueryTypeLabel(DISCOVERY_QUERY_TYPES[missingIndex])}" in Advanced targeting. Once one search prompt is filled, all six are needed.`,
      inputId: discoveryQueryInputId(missingIndex),
    };
  }
  return discoveryQueryPlanValidationError(queries) ? INVALID_QUERIES : null;
}

function fieldsFingerprint(fields: ServiceProfileFields) {
  return JSON.stringify(fields);
}

export function ServiceProfileSettings({
  serviceProfile,
  websiteUrl,
  isPro,
  latestScan = null,
}: ServiceProfileSettingsProps) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [isWebsitePending, startWebsiteTransition] = useTransition();
  const resolvedWebsiteUrl = serviceProfile.websiteUrl ?? websiteUrl;
  const savedFields = serviceProfile.fields ?? EMPTY_FIELDS;
  const savedFingerprint = fieldsFingerprint(savedFields);
  const [websiteDraft, setWebsiteDraft] = useState(resolvedWebsiteUrl);
  const [profileFields, setProfileFields] = useState<ServiceProfileFields>(savedFields);
  const [syncedFingerprint, setSyncedFingerprint] = useState(savedFingerprint);
  const [lastSentFingerprint, setLastSentFingerprint] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<DiscoveryQueryError | null>(null);
  const [websiteResult, setWebsiteResult] = useState<ProspectActionResult | null>(null);
  const [refreshResult, setRefreshResult] = useState<ProspectActionResult | null>(null);

  // Any save on this page refreshes the server props. Adopt the new saved copy
  // only when the draft has no unsaved edits (or is exactly what was just
  // sent); otherwise a save elsewhere would silently replace the user's work.
  if (syncedFingerprint !== savedFingerprint) {
    setSyncedFingerprint(savedFingerprint);
    const draftFingerprint = fieldsFingerprint(profileFields);
    if (draftFingerprint === syncedFingerprint || draftFingerprint === lastSentFingerprint) {
      setProfileFields(savedFields);
    }
  }

  const [syncedWebsiteUrl, setSyncedWebsiteUrl] = useState(resolvedWebsiteUrl);
  if (syncedWebsiteUrl !== resolvedWebsiteUrl) {
    setSyncedWebsiteUrl(resolvedWebsiteUrl);
    setWebsiteDraft(resolvedWebsiteUrl);
  }

  const changedFieldCount = useMemo(
    () =>
      (Object.keys(profileFields) as Array<keyof ServiceProfileFields>).filter(
        (key) => JSON.stringify(profileFields[key]) !== JSON.stringify(savedFields[key]),
      ).length,
    [profileFields, savedFields],
  );

  const updateField: UpdateField = (key, value) => {
    setProfileFields((current) => ({ ...current, [key]: value }));
  };

  const updateDiscoveryQueries = (value: DiscoveryQuery[]) => {
    setQueryError(null);
    updateField("discovery_queries", value);
    if (value.length === DISCOVERY_QUERY_TYPES.length) {
      updateField(
        "search_terms",
        normalizeSignals(value.map((query) => query.phrase)),
      );
    }
  };

  const validateProfileChanges = (): BriefSaveOutcome | null => {
    const invalidQueries = discoveryQueryError(profileFields.discovery_queries);
    setQueryError(invalidQueries);
    return invalidQueries
      ? { ok: false, message: "Nothing was saved: a search prompt in Advanced targeting needs attention." }
      : null;
  };

  const saveProfileChanges = async (): Promise<BriefSaveOutcome> => {
    const sent = profileFields;
    try {
      const result = await sendSettingsUpdate({
        serviceProfileId: serviceProfile.id,
        serviceProfile: sent,
      });
      if (result.kind === "invalid-queries") {
        setQueryError(INVALID_QUERIES);
        return { ok: false, message: "Buyers, problem and signals weren't saved: one search prompt needs attention." };
      }
      if (result.kind === "failed") {
        return {
          ok: false,
          message: "Buyers, problem and signals weren't saved. Your changes are still here; try again in a minute.",
        };
      }

      setLastSentFingerprint(fieldsFingerprint(sent));
      if (result.kind === "saved-without-scan") {
        return {
          ok: false,
          message: "Buyers, problem and signals were saved, but matching didn't update. Save again in a few minutes.",
        };
      }
      return {
        ok: true,
        message: isPro
          ? "Targeting saved. Matching updates before the next scan."
          : "Targeting saved. Prospect scans start when you upgrade to Pro.",
      };
    } catch {
      return { ok: false, message: NETWORK_FAILURE };
    }
  };

  // Re-applies the saved profile (not the draft) when matching failed to update.
  const refreshTargeting = () => {
    setRefreshResult(null);
    startRefresh(async () => {
      try {
        const result = await sendSettingsUpdate({
          serviceProfileId: serviceProfile.id,
          serviceProfile: savedFields,
        });
        setRefreshResult(
          result.kind === "saved"
            ? { ok: true, message: "Refresh started. Matching updates before the next scan." }
            : { ok: false, message: "The refresh didn't start. Try again in a few minutes." },
        );
        router.refresh();
      } catch {
        setRefreshResult({ ok: false, message: NETWORK_FAILURE });
      }
    });
  };

  const submitWebsite = (normalizedWebsiteUrl: string) => {
    startWebsiteTransition(async () => {
      try {
        const response = await fetch("/api/settings/workspace", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl: normalizedWebsiteUrl }),
        });
        const domain = websiteDomain(normalizedWebsiteUrl) ?? "your website";
        setWebsiteResult(
          response.ok
            ? {
                ok: true,
                message: isPro
                  ? `Website saved. Arcli is reading ${domain} and will redraft this brief; this page updates when it's ready.`
                  : `Website saved. Arcli is reading ${domain} to redraft this brief. Free workspaces include this one read; ongoing refreshes are part of Pro.`,
              }
            : {
                ok: false,
                message: "The website wasn't saved. Check the address and try again in a minute.",
              },
        );
        router.refresh();
      } catch {
        setWebsiteResult({ ok: false, message: NETWORK_FAILURE });
      }
    });
  };

  const refreshWebsiteContext = () => {
    let normalizedWebsiteUrl: string;
    try {
      normalizedWebsiteUrl = normalizeWebsiteUrl(websiteDraft);
    } catch {
      normalizedWebsiteUrl = "";
    }
    const domain = normalizedWebsiteUrl ? websiteDomain(normalizedWebsiteUrl) : null;
    if (!domain || !domain.includes(".")) {
      setWebsiteResult({
        ok: false,
        message: "Enter your company website, like northwind.io.",
      });
      return;
    }
    if (normalizedWebsiteUrl === safeNormalize(resolvedWebsiteUrl)) {
      setWebsiteResult({
        ok: false,
        message: `${domain} is already your website source. Enter a different one, or choose Cancel.`,
      });
      return;
    }
    setWebsiteResult(null);
    submitWebsite(normalizedWebsiteUrl);
  };

  const websiteChanged = (() => {
    try {
      return normalizeWebsiteUrl(websiteDraft) !== normalizeWebsiteUrl(resolvedWebsiteUrl);
    } catch {
      return false;
    }
  })();

  return (
    <TargetingEditor
      serviceProfile={serviceProfile}
      fields={profileFields}
      isPro={isPro}
      changedFieldCount={changedFieldCount}
      queryError={queryError}
      latestScan={latestScan}
      savedWebsiteUrl={resolvedWebsiteUrl}
      websiteDraft={websiteDraft}
      websiteChanged={websiteChanged}
      isWebsitePending={isWebsitePending}
      websiteResult={websiteResult}
      isRefreshing={isRefreshing}
      refreshResult={refreshResult}
      onFieldChange={updateField}
      onDiscoveryQueriesChange={updateDiscoveryQueries}
      onSave={saveProfileChanges}
      onValidate={validateProfileChanges}
      onRefreshTargeting={refreshTargeting}
      onRefreshWebsite={() => submitWebsite(safeNormalize(resolvedWebsiteUrl))}
      onWebsiteDraftChange={(value) => {
        setWebsiteDraft(value);
        if (websiteResult && !websiteResult.ok) setWebsiteResult(null);
      }}
      onWebsiteReset={() => {
        setWebsiteDraft(resolvedWebsiteUrl);
        setWebsiteResult(null);
      }}
      onWebsiteSave={refreshWebsiteContext}
    />
  );
}

function safeNormalize(value: string) {
  try {
    return normalizeWebsiteUrl(value);
  } catch {
    return value;
  }
}
