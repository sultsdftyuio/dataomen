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

  const reviewJson = useMemo(
    () =>
      serviceProfile.rawProfile ?? {
        target_audience: profileFields.target_audience,
        core_problem: profileFields.core_problem,
        unique_value_prop: profileFields.unique_value_prop,
        pain_points: profileFields.pain_points,
        buying_triggers: profileFields.buying_triggers,
        negative_keywords: profileFields.negative_keywords,
        excluded_audiences: profileFields.excluded_audiences,
      },
    [profileFields, serviceProfile.rawProfile],
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

  return (
    <ProfileReviewState
      embedded
      showApproveAction={false}
      effectiveWebsiteUrl={serviceProfile.websiteUrl ?? websiteUrl}
      isProfilePending={isPending}
      profileFields={profileFields}
      profileResult={profileResult}
      reviewJson={reviewJson}
      persistProfile={persistProfile}
      updateField={updateField}
      eyebrow="MATCHING BRIEF"
      title="Review your service profile."
      description="Adjust the audience, pain, value proposition, and bad-fit signals used by the prospect engine."
      statusLabel={serviceProfile.embeddingStatus === "completed" ? "Active" : "Regenerating"}
      saveLabel="Save & regenerate"
      savingLabel="Saving..."
      saveHelpText="Saving updates the workspace profile and regenerates matching embeddings in the background."
    />
  );
}
