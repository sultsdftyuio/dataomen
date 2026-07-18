"use client";

import type { User } from "@supabase/supabase-js";

import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";
import WorkspaceTab from "@/components/settings/workspace_page/workspace-tab";
import type { WorkspaceBillingCardProps } from "@/components/settings/workspace_page/workspace-billing-card";

type SettingsClientProps = {
  user: User;
  initialSettings: any;
  planData: WorkspaceBillingCardProps["planData"];
  billingTestControlsEnabled: boolean;
  serviceProfile: ServiceProfileView | null;
  tenantId: string | null;
};

export default function SettingsClient({
  user,
  initialSettings,
  planData,
  billingTestControlsEnabled,
  serviceProfile,
  tenantId,
}: SettingsClientProps) {
  const workspaceSettings = initialSettings?.workspace ?? {};
  const initialData = {
    fullName:
      user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
    authEmail: user.email ?? "",
    companyName: workspaceSettings.companyName ?? "",
    supportEmail:
      workspaceSettings.replyToEmail ?? workspaceSettings.senderEmail ?? "",
    websiteUrl: workspaceSettings.websiteUrl ?? "",
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Workspace Settings
        </h1>
        <p className="mt-1 text-muted-foreground">
          Manage your company profile, core Arcli configuration, and billing.
        </p>
      </div>

      <hr className="border-border" />

      <WorkspaceTab
        initialData={initialData}
        planData={planData}
        billingTestControlsEnabled={billingTestControlsEnabled}
        serviceProfile={serviceProfile}
        tenantId={tenantId}
      />
    </div>
  );
}
