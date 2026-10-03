"use client";

import type { User } from "@supabase/supabase-js";
import { Building2, CircleUserRound, Globe2, Mail, MessageCircleMore, Settings2 } from "lucide-react";

import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";
import WorkspaceBillingCard, {
  type WorkspaceBillingCardProps,
} from "@/components/settings/workspace_page/workspace-billing-card";
import BillingTestSwitcher from "@/components/settings/workspace_page/billing-test-switcher";
import CrawlNotificationPreferences from "@/components/settings/workspace_page/crawl-notification-preferences";
import WorkspaceTab from "@/components/settings/workspace_page/workspace-tab";
import LogoutButton from "@/components/dashboard/logout-button";
import { C } from "@/lib/tokens";
import { workspaceDisplayName } from "@/lib/workspace/display-name";
import "./settings-client.css";

type SettingsClientProps = {
  user: User;
  initialSettings: any;
  initialCrawlNotificationEmailsEnabled: boolean;
  canReceiveResultEmails: boolean;
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
  initialCrawlNotificationEmailsEnabled,
  canReceiveResultEmails,
  serviceProfile,
  planData,
  showBillingTestControls,
}: SettingsClientProps) {
  const workspaceSettings = initialSettings?.workspace ?? {};
  const workspaceName = workspaceDisplayName(workspaceSettings.companyName);
  const websiteUrl = serviceProfile?.websiteUrl ?? workspaceSettings.websiteUrl ?? "";
  const initialData = { websiteUrl };
  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";

  return (
    <div className="arc-workspace-page arc-settings-page">
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

      <div className="arc-settings-page__layout">
        <nav className="arc-settings-page__nav" aria-label="Settings sections">
          <a href="#profile">Profile</a>
          <a href="#workspace">Workspace and website</a>
          <a href="#billing">Plan and billing</a>
          <a href="#email-updates">Email updates</a>
          <a href="#support">Support</a>
        </nav>
        <div className="arc-settings-page__sections">
          <section id="profile" className="arc-settings-account" aria-labelledby="settings-account-title">
            <div className="arc-settings-account__heading">
              <h2 id="settings-account-title">Profile</h2>
              <p>The account currently signed in to this workspace.</p>
            </div>
            <div className="arc-settings-account__row">
              <span className="arc-settings-account__icon"><CircleUserRound size={18} aria-hidden="true" /></span>
              <div><strong>Name</strong><small>Your account display name</small></div>
              <span className="arc-settings-account__value">{displayName}</span>
            </div>
            <div className="arc-settings-account__row">
              <span className="arc-settings-account__icon"><Mail size={18} aria-hidden="true" /></span>
              <div><strong>Email address</strong><small>Used for sign-in and account updates</small></div>
              <span className="arc-settings-account__value">{user.email ?? "No email available"}</span>
            </div>
            <div className="arc-settings-account__row">
              <span className="arc-settings-account__icon"><Building2 size={18} aria-hidden="true" /></span>
              <div><strong>Workspace</strong><small>Your current workspace</small></div>
              <span className="arc-settings-account__value">{workspaceName}</span>
            </div>
            <div className="arc-settings-account__row">
              <span className="arc-settings-account__icon"><Globe2 size={18} aria-hidden="true" /></span>
              <div><strong>Website</strong><small>The source for your brief</small></div>
              <span className="arc-settings-account__value">{websiteUrl ? websiteDomain(websiteUrl) : "Website not connected"}</span>
            </div>
            <div className="arc-settings-account__row">
              <span className="arc-settings-account__icon"><CircleUserRound size={18} aria-hidden="true" /></span>
              <div><strong>Session</strong><small>Signed in on this device</small></div>
              <span className="arc-settings-account__value"><LogoutButton /></span>
            </div>
          </section>

          <div id="workspace"><WorkspaceTab initialData={initialData} serviceProfile={serviceProfile} /></div>
          <div id="billing"><WorkspaceBillingCard planData={planData} /></div>
          <div id="email-updates"><CrawlNotificationPreferences
            initialEnabled={initialCrawlNotificationEmailsEnabled}
            eligible={canReceiveResultEmails}
            accountEmail={user.email ?? null}
          /></div>
          {showBillingTestControls ? (
            <BillingTestSwitcher currentStatus={planData?.planStatus} />
          ) : null}

          <section id="support" className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2.5" style={{ borderColor: C.rule }}>
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
        </div>
      </div>
    </div>
  );
}
