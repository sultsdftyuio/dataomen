"use client";

import WorkspaceTab from "@/components/settings/workspace_page/workspace-tab";
import type { User } from "@supabase/supabase-js";
import type { WorkspaceBillingCardProps } from "@/components/settings/workspace_page/workspace-billing-card";
import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";

type SettingsClientProps = {
  user: User;
  initialSettings: any;
  isRecoveryMode: boolean;
  planData: WorkspaceBillingCardProps["planData"];
  billingTestControlsEnabled: boolean;
  serviceProfile: ServiceProfileView | null;
  tenantId: string | null;
};

export default function SettingsClient({
  user,
  initialSettings,
  isRecoveryMode,
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
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workspace Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your company profile, core Arcli configuration, and billing.
        </p>
      </div>
      
      <hr className="border-border" />
      
      {/* Directly render the workspace tab content, bypassing any Tab layouts */}
      <WorkspaceTab 
			initialData={initialData}
			// @ts-ignore keep recovery-mode wiring while the tab props stay backward-compatible
        isRecoveryMode={isRecoveryMode}
        planData={planData}
        billingTestControlsEnabled={billingTestControlsEnabled}
        serviceProfile={serviceProfile}
        tenantId={tenantId}
      />
    </div>
  );
} 