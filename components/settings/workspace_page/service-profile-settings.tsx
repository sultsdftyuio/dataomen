"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleDotDashed } from "lucide-react";

import {
  EMPTY_FIELDS,
  ProfileReviewState,
  type ProfilePersistIntent,
} from "@/components/onboarding/workspace-provisioning-profile";
import type {
  ProspectActionResult,
  ServiceProfileFields,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { C } from "@/lib/tokens";

type ServiceProfileSettingsProps = {
  serviceProfile: ServiceProfileView;
  websiteUrl: string;
  onFieldsChange?: (fields: ServiceProfileFields) => void;
};

type SettingsProfileResponse = {
  error?: string;
  message?: string;
};

type UpdateField = <Key extends keyof ServiceProfileFields>(
  key: Key,
  value: ServiceProfileFields[Key],
) => void;

async function readSettingsProfileResult(
  response: Response,
): Promise<ProspectActionResult> {
  const payload = (await response
    .json()
    .catch(() => ({}))) as SettingsProfileResponse;

  if (!response.ok) {
    return {
      ok: false,
      message:
        payload.error ??
        "Could not update the service profile. Check the fields and try again.",
    };
  }

  return {
    ok: true,
    message:
      payload.message ??
      "Service profile saved. Matching embeddings are regenerating.",
  };
}

export function ServiceProfileSettings({
  serviceProfile,
  websiteUrl,
  onFieldsChange,
}: ServiceProfileSettingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [profileFields, setProfileFields] = useState<ServiceProfileFields>(
    serviceProfile.fields ?? EMPTY_FIELDS,
  );
  const [profileResult, setProfileResult] =
    useState<ProspectActionResult | null>(null);

  useEffect(() => {
    setProfileFields(serviceProfile.fields ?? EMPTY_FIELDS);
  }, [serviceProfile.id, serviceProfile.updatedAt, serviceProfile.fields]);

  useEffect(() => {
    onFieldsChange?.(profileFields);
  }, [onFieldsChange, profileFields]);

  const reviewJson = useMemo(
    () => ({
      target_audience: profileFields.target_audience,
      core_problem: profileFields.core_problem,
      unique_value_prop: profileFields.unique_value_prop,
      use_cases: profileFields.use_cases,
      pain_points: profileFields.pain_points,
      buying_triggers: profileFields.buying_triggers,
      negative_keywords: profileFields.negative_keywords,
      excluded_audiences: profileFields.excluded_audiences,
    }),
    [profileFields],
  );

  const hasProfileContent = useMemo(
    () =>
      Object.values(profileFields).some((value) =>
        Array.isArray(value)
          ? value.length > 0
          : value.trim().length > 0,
      ),
    [profileFields],
  );

  const updateField: UpdateField = (key, value) => {
    setProfileFields((current) => ({ ...current, [key]: value }));
  };

  const persistProfile = (_intent: ProfilePersistIntent) => {
    startTransition(async () => {
      const response = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceProfileId: serviceProfile.id,
          serviceProfile: profileFields,
        }),
      });

      const result = await readSettingsProfileResult(response);
      setProfileResult(result);

      if (result.ok) {
        router.refresh();
      }
    });
  };

  if (!serviceProfile.hasProfile) {
    return (
      <section
        className="rounded-lg border bg-white p-5 shadow-sm"
        style={{ borderColor: C.rule }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: C.bluePale, color: C.blue }}
          >
            <CircleDotDashed className="size-4 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: C.navy }}>
              Service profile extraction is in progress
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

  const statusLabel =
    serviceProfile.embeddingStatus === "completed" ? "Active" : "Regenerating";

  return (
    <div className="space-y-4">
      <div
        className="flex flex-col gap-3 rounded-lg border px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: C.rule, backgroundColor: C.offWhite }}
      >
        <div className="min-w-0">
          <span className="font-semibold" style={{ color: C.navy }}>
            Source:
          </span>{" "}
          <span className="break-all" style={{ color: C.muted }}>
            {serviceProfile.websiteUrl ?? websiteUrl}
          </span>
        </div>
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 font-semibold"
          style={{
            borderColor: C.blueLight,
            backgroundColor: C.bluePale,
            color: C.blue,
          }}
        >
          <CircleDotDashed className="size-3.5" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

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

      <ProfileReviewState
        embedded
        showApproveAction={false}
        showHeader={false}
        showStructuredPreview={false}
        effectiveWebsiteUrl={serviceProfile.websiteUrl ?? websiteUrl}
        isProfilePending={isPending}
        profileFields={profileFields}
        profileResult={profileResult}
        reviewJson={reviewJson}
        persistProfile={persistProfile}
        updateField={updateField}
        statusLabel={statusLabel}
        saveLabel="Save & regenerate"
        savingLabel="Saving..."
        saveHelpText="Saving updates the workspace profile and regenerates matching embeddings in the background."
      />
    </div>
  );
}
