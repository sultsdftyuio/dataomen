"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  ServiceProfileFields,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import BillingTestSwitcher from "./billing-test-switcher";
import { ServiceProfileSettings } from "./service-profile-settings";
import WorkspaceBillingCard, {
  type WorkspaceBillingCardProps,
} from "./workspace-billing-card";
import WorkspaceSettingsPreview from "./workspace-settings-preview";

type WorkspaceInitialData = {
  websiteUrl?: string;
};

interface WorkspaceTabProps {
  tenantId?: string | null;
  initialData?: WorkspaceInitialData;
  initialProfile?: ServiceProfileView | null;
  serviceProfile?: ServiceProfileView | null;
  planData?: WorkspaceBillingCardProps["planData"];
  billingTestControlsEnabled?: boolean;
  [legacyProp: string]: unknown;
}

export default function WorkspaceTab({
  tenantId = null,
  initialData,
  initialProfile = null,
  serviceProfile = null,
  planData,
  billingTestControlsEnabled = false,
}: WorkspaceTabProps) {
  const profile = initialProfile ?? serviceProfile;
  const websiteUrl =
    profile?.websiteUrl ?? initialData?.websiteUrl ?? "";
  const [previewFields, setPreviewFields] =
    useState<ServiceProfileFields | null>(profile?.fields ?? null);

  useEffect(() => {
    setPreviewFields(profile?.fields ?? null);
  }, [profile?.id, profile?.updatedAt, profile?.fields]);

  const handleProfileFieldsChange = useCallback(
    (fields: ServiceProfileFields) => {
      setPreviewFields(fields);
    },
    [],
  );

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 pb-12 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Website URL and Matching Brief</CardTitle>
            <CardDescription>
              Review your service profile. Adjust the audience, pain, value
              proposition, and bad-fit signals used by the prospect engine.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {profile ? (
              <ServiceProfileSettings
                serviceProfile={profile}
                websiteUrl={websiteUrl}
                onFieldsChange={handleProfileFieldsChange}
              />
            ) : (
              <div className="rounded-lg border bg-muted/40 p-5 text-sm text-muted-foreground">
                Service profile settings will appear after the workspace
                context is available.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
        <WorkspaceBillingCard planData={planData} />
        {billingTestControlsEnabled ? (
          <BillingTestSwitcher currentStatus={planData?.planStatus} />
        ) : null}

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              Structured Profile
              <span className="shrink-0 rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                READ ONLY
              </span>
            </CardTitle>
            <CardDescription>
              Read-only preview of the payload prepared for the matching
              engine. Shows only tenant-safe profile fields.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WorkspaceSettingsPreview
              tenantId={tenantId}
              serviceProfile={profile}
              fields={previewFields}
            />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
