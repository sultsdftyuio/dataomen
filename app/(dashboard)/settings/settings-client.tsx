"use client";

import type { User } from "@supabase/supabase-js";

import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";
import AutoStartProCheckout from "@/components/settings/workspace_page/auto-start-pro-checkout";
import WorkspaceTab from "@/components/settings/workspace_page/workspace-tab";

type SettingsClientProps = {
  user: User;
  initialSettings: any;
  serviceProfile: ServiceProfileView | null;
  autoStartProCheckout: boolean;
};

export default function SettingsClient({
  user,
  initialSettings,
  serviceProfile,
  autoStartProCheckout,
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
      <AutoStartProCheckout enabled={autoStartProCheckout} />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
          Workspace
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Workspace settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep the website and matching brief behind your prospect scans current.
        </p>
      </div>

      <hr className="border-border" />

      <WorkspaceTab
        initialData={initialData}
        serviceProfile={serviceProfile}
      />
    </div>
  );
}
