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
    <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-4 overflow-y-auto pr-1 pb-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
          Workspace
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Workspace settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the source, matching brief, and plan behind your prospect scans.
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
