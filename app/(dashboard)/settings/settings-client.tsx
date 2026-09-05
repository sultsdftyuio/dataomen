"use client";

import type { User } from "@supabase/supabase-js";
import { Building2, CircleUserRound, Globe2, Mail, MessageCircleMore, Settings2 } from "lucide-react";

import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";
import WorkspaceBillingCard, {
  type WorkspaceBillingCardProps,
} from "@/components/settings/workspace_page/workspace-billing-card";
import BillingTestSwitcher from "@/components/settings/workspace_page/billing-test-switcher";
import WorkspaceTab from "@/components/settings/workspace_page/workspace-tab";
import LogoutButton from "@/components/dashboard/logout-button";
import { C } from "@/lib/tokens";

type SettingsClientProps = {
  user: User;
  initialSettings: any;
  serviceProfile: ServiceProfileView | null;
  planData: WorkspaceBillingCardProps["planData"];
  showBillingTestControls: boolean;
};

function websiteDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}

export default function SettingsClient({
  user,
  initialSettings,
  serviceProfile,
  planData,
  showBillingTestControls,
}: SettingsClientProps) {
  const workspaceSettings = initialSettings?.workspace ?? {};
  const workspaceName = workspaceSettings.companyName || "Workspace";
  const websiteUrl = serviceProfile?.websiteUrl ?? workspaceSettings.websiteUrl ?? "";
  const initialData = { websiteUrl };
  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col gap-5 overflow-y-auto pb-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5" style={{ borderColor: C.rule }}>
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
            <Settings2 className="size-3.5" aria-hidden="true" /> Account & workspace
          </div>
          <h1 className="pfd mt-2 text-3xl leading-none" style={{ color: C.navy }}>
            Settings
          </h1>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            Manage your account, prospecting setup, and subscription in one place.
          </p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2 text-right" style={{ borderColor: C.rule }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.muted }}>Current workspace</p>
          <p className="mt-0.5 text-sm font-semibold" style={{ color: C.navy }}>{workspaceName}</p>
        </div>
      </header>

      <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: C.rule, boxShadow: "0 8px 28px rgba(10,22,40,0.04)" }}>
            <div className="border-b px-5 py-4" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
              <h2 className="text-sm font-semibold" style={{ color: C.navy }}>Account</h2>
              <p className="mt-1 text-xs" style={{ color: C.muted }}>The account currently signed in to this workspace.</p>
            </div>
            <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: C.bluePale, color: C.blue }}>
                  <CircleUserRound className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.muted }}>Signed in as</p>
                  <p className="mt-0.5 truncate text-sm font-semibold" style={{ color: C.navy }}>{displayName}</p>
                  <p className="text-xs" style={{ color: C.navySoft }}>Account owner</p>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:border-l sm:pl-5" style={{ borderColor: C.rule }}>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: C.offWhite, color: C.navySoft }}>
                  <Building2 className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.muted }}>Workspace</p>
                  <p className="mt-0.5 truncate text-sm font-semibold" style={{ color: C.navy }}>{workspaceName}</p>
                  <p className="flex items-center gap-1 truncate text-xs" style={{ color: C.navySoft }}>
                    <Globe2 className="size-3 shrink-0" aria-hidden="true" />
                    {websiteUrl ? websiteDomain(websiteUrl) : "Website not connected"}
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 items-start gap-3 rounded-lg border px-3 py-3 sm:col-span-2" style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: C.white, color: C.blue }}>
                  <Mail className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>Account email</p>
                  <p className="mt-1 break-all text-sm font-semibold leading-5" style={{ color: C.navy }}>{user.email ?? "No email available"}</p>
                  <p className="mt-1 text-xs leading-4" style={{ color: C.navySoft }}>Used for sign-in and account updates.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 sm:col-span-2" style={{ borderColor: C.rule }}>
                <div>
                  <p className="text-xs font-semibold" style={{ color: C.navy }}>Signed-in session</p>
                  <p className="mt-0.5 text-xs" style={{ color: C.navySoft }}>Sign out securely from this device.</p>
                </div>
                <LogoutButton />
              </div>
            </div>
          </section>

          <WorkspaceTab initialData={initialData} serviceProfile={serviceProfile} />
        </div>

        <aside className="min-w-0 space-y-3 xl:sticky xl:top-0 xl:self-start">
          <WorkspaceBillingCard planData={planData} />
          {showBillingTestControls ? (
            <BillingTestSwitcher currentStatus={planData?.planStatus} />
          ) : null}

          <section className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2.5" style={{ borderColor: C.rule }}>
            <MessageCircleMore className="size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
            <p className="text-xs leading-5" style={{ color: C.muted }}>
              Need help or have a suggestion?{" "}
              <a
                href="mailto:support@arcli.tech?subject=Arcli%20feedback%20or%20support"
                className="font-semibold underline underline-offset-2"
                style={{ color: C.blue }}
              >
                Email support
              </a>
              .
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
