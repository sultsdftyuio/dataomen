"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";
import { ContextCard, ContextLayout } from "@/components/dashboard/ContextLayout";
import { LoadError } from "@/components/dashboard/LoadError";
import { PageHeader } from "@/components/dashboard/PageHeader";
import LogoutButton from "@/components/dashboard/logout-button";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-section";
import { BillingNotice, type CheckoutReturn } from "@/components/settings/workspace_page/billing-notice";
import CrawlNotificationPreferences from "@/components/settings/workspace_page/crawl-notification-preferences";
import WorkspaceBillingCard, {
  type WorkspaceBillingCardProps,
} from "@/components/settings/workspace_page/workspace-billing-card";
import WorkspaceTab from "@/components/settings/workspace_page/workspace-tab";
import { workspaceDisplayName } from "@/lib/workspace/display-name";

import { PasswordRow } from "./password-form";
import { SettingsNav, type SettingsNavItem } from "./settings-nav";
import "./settings-client.css";

/** Owner/admin, member, or unknown when the membership lookup failed. */
export type WorkspaceRole = "admin" | "member" | "unknown";

type SettingsClientProps = {
  user: User;
  /** buildSettingsSnapshot() output; only workspace.companyName and websiteUrl are read here. */
  initialSettings: unknown;
  initialCrawlNotificationEmailsEnabled: boolean;
  canReceiveResultEmails: boolean;
  serviceProfile: ServiceProfileView | null;
  planData: WorkspaceBillingCardProps["planData"];
  /** The workspace couldn't be resolved: workspace sections show a load error instead of defaults. */
  workspaceUnavailable?: boolean;
  workspaceRole?: WorkspaceRole;
  emailPreferenceUnavailable?: boolean;
  checkoutReturn?: CheckoutReturn;
  /** Arrived from a password reset link. */
  passwordRecovery?: boolean;
};

const NAV_ITEMS: SettingsNavItem[] = [
  { id: "profile", label: "Profile" },
  { id: "billing", label: "Plan and billing" },
  { id: "workspace", label: "Prospecting setup" },
  { id: "result-emails", label: "Result emails" },
  { id: "support", label: "Support" },
];

const UNAVAILABLE_NAV_ITEMS: SettingsNavItem[] = [
  { id: "profile", label: "Profile" },
  { id: "support", label: "Support" },
];

function readWorkspaceSettings(value: unknown): { companyName: string; websiteUrl: string } {
  const workspace = (value as { workspace?: { companyName?: unknown; websiteUrl?: unknown } } | null)?.workspace;
  return {
    companyName: typeof workspace?.companyName === "string" ? workspace.companyName : "",
    websiteUrl: typeof workspace?.websiteUrl === "string" ? workspace.websiteUrl : "",
  };
}

const LINK_CLASS =
  "rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none";

export default function SettingsClient({
  user,
  initialSettings,
  initialCrawlNotificationEmailsEnabled,
  canReceiveResultEmails,
  serviceProfile,
  planData,
  workspaceUnavailable = false,
  workspaceRole,
  emailPreferenceUnavailable = false,
  checkoutReturn = null,
  passwordRecovery = false,
}: SettingsClientProps) {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();
  const workspaceSettings = readWorkspaceSettings(initialSettings);
  const workspaceName = workspaceDisplayName(workspaceSettings.companyName);
  const hasWorkspaceName = workspaceName !== "Workspace";
  const websiteUrl = serviceProfile?.websiteUrl || workspaceSettings.websiteUrl;
  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "No name set";
  // Older callers only pass canReceiveResultEmails, which is the same owner/admin check.
  const role: WorkspaceRole = workspaceRole ?? (canReceiveResultEmails ? "admin" : "member");
  // An unknown role still shows billing controls: the server enforces the rule
  // and the card explains a refusal, which beats hiding the fix from an owner.
  const canManageBilling = role !== "member";
  const hasPassword = (user.app_metadata?.providers as string[] | undefined)?.includes("email") ?? user.app_metadata?.provider === "email";

  const panel = (
    <>
      <ContextCard>
        <span className="flex min-w-0 flex-col leading-snug">
          <span className="truncate text-[15px] font-semibold text-[var(--rail-foreground)]">{displayName}</span>
          <span className="truncate text-xs">{user.email ?? "No email address"}</span>
        </span>
        {hasWorkspaceName && !workspaceUnavailable ? (
          <span className="arc-context-note text-xs">Workspace: {workspaceName}</span>
        ) : null}
      </ContextCard>
      <h2 className="arc-context-heading">Sections</h2>
      <SettingsNav items={workspaceUnavailable ? UNAVAILABLE_NAV_ITEMS : NAV_ITEMS} />
    </>
  );

  return (
    <ContextLayout label="Settings overview" panel={panel}>
      <div className="arc-workspace-page settings-page">
        <PageHeader
          title="Settings"
          description={
            hasWorkspaceName && !workspaceUnavailable
              ? `Your account, plan, prospecting setup and emails for ${workspaceName}.`
              : "Your account, plan, prospecting setup and emails."
          }
        />

        {workspaceUnavailable ? null : (
          <BillingNotice planData={planData} checkoutReturn={checkoutReturn} canManageBilling={canManageBilling} />
        )}

        <div className="settings-page__sections">
          <SettingsSection id="profile" title="Profile" description="The account signed in to this workspace.">
            <SettingsRow label="Name">{displayName}</SettingsRow>
            <SettingsRow label="Email address" hint="For sign-in and account messages">
              {user.email ?? <span className="text-muted-foreground">No email address</span>}
            </SettingsRow>
            {/* Unnamed workspaces get no row: "Workspace" alone says nothing and can't be edited here. */}
            {workspaceUnavailable || !hasWorkspaceName ? null : (
              <SettingsRow label="Workspace" hint={role === "admin" ? "You're an owner or admin" : role === "member" ? "You're a member" : undefined}>
                {workspaceName}
              </SettingsRow>
            )}
            <PasswordRow recovery={passwordRecovery} hasPassword={hasPassword} />
            <SettingsRow label="Session" hint="Signed in on this device" action={<LogoutButton />} />
          </SettingsSection>

          {workspaceUnavailable ? (
            <LoadError
              thing="Your workspace details"
              description="Your plan, prospecting setup and email choices are hidden until they load, so nothing here is out of date. Try again, and if it keeps happening, email support@arcli.tech."
              onRetry={() => startRetry(() => router.refresh())}
              retrying={isRetrying}
            />
          ) : (
            <>
              <WorkspaceBillingCard
                planData={planData}
                canManageBilling={canManageBilling}
                checkoutConfirming={checkoutReturn === "confirming"}
              />
              <WorkspaceTab initialData={{ websiteUrl }} serviceProfile={serviceProfile} />
              <CrawlNotificationPreferences
                initialEnabled={initialCrawlNotificationEmailsEnabled}
                eligible={canReceiveResultEmails}
                accountEmail={user.email ?? null}
                roleUnknown={role === "unknown"}
                preferenceUnavailable={emailPreferenceUnavailable}
              />
            </>
          )}

          <SettingsSection id="support" title="Support">
            <p className="px-4 py-3.5 text-sm leading-6 text-muted-foreground md:px-5">
              Questions, problems or ideas? Email{" "}
              <a href="mailto:support@arcli.tech?subject=Arcli%20support" className={LINK_CLASS}>
                support@arcli.tech
              </a>
              .
            </p>
          </SettingsSection>
        </div>
      </div>
    </ContextLayout>
  );
}
