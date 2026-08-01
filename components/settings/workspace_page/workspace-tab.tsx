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
    <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-4 pb-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-xs font-semibold">Your brief</CardTitle>
            <CardDescription className="text-xs leading-5">
              Set the source URL, then tune the buyer language used to search
              Hacker News and X, rank fit, and filter bad-fit conversations.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0">
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

      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-3 lg:self-start">
        <WorkspaceBillingCard planData={planData} />
        {billingTestControlsEnabled ? (
          <BillingTestSwitcher currentStatus={planData?.planStatus} />
        ) : null}

        <Card className="bg-muted/50">
          <CardHeader className="p-3">
            <CardTitle className="flex items-center justify-between gap-3">
              Your profile
              <span className="shrink-0 rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                READ ONLY
              </span>
            </CardTitle>
            <CardDescription className="text-xs leading-5">
              Read-only preview of the payload prepared for the matching
              engine. Shows only tenant-safe profile fields.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0">
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
