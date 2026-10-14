"use client";

import Link from "next/link";

import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

import { websiteDomain } from "./website-url";

type WorkspaceInitialData = {
  websiteUrl?: string;
};

interface WorkspaceTabProps {
  initialData?: WorkspaceInitialData;
  initialProfile?: ServiceProfileView | null;
  serviceProfile?: ServiceProfileView | null;
  [legacyProp: string]: unknown;
}

type BriefStatus = { tone: StatusTone; label: string; detail: string };

// fetchServiceProfile returns an empty profile (hasProfile: false) rather than
// null, so the brief's state is read from hasProfile and embeddingStatus.
// Only "completed" is ready; "failed" must not be reported as in progress.
function briefStatus(profile: ServiceProfileView | null): BriefStatus {
  if (!profile?.hasProfile) {
    return {
      tone: "neutral",
      label: "Not set up",
      detail: "Add your website to create the targeting brief behind your prospect scans.",
    };
  }
  if (profile.embeddingStatus === "completed") {
    return {
      tone: "success",
      label: "Ready",
      detail: "Describes the buyers, problems and language Arcli looks for in each scan.",
    };
  }
  if (profile.embeddingStatus === "failed") {
    return {
      tone: "danger",
      label: "Needs attention",
      detail: "Your latest changes couldn't be prepared for scans. Open the brief and save it again to retry.",
    };
  }
  return {
    tone: "progress",
    label: "Updating",
    detail: "Your latest changes are being prepared for scans. This usually takes a few minutes.",
  };
}

/** The Prospecting setup section: the website and the targeting brief behind every scan. */
export default function WorkspaceTab({ initialData, initialProfile = null, serviceProfile = null }: WorkspaceTabProps) {
  const profile = initialProfile ?? serviceProfile;
  const websiteUrl = profile?.websiteUrl ?? initialData?.websiteUrl ?? "";
  const domain = websiteUrl ? websiteDomain(websiteUrl) ?? websiteUrl : null;
  const status = briefStatus(profile);
  const needsSetup = !profile?.hasProfile && !domain;

  return (
    <SettingsSection
      id="workspace"
      title="Prospecting setup"
      description="Your website and targeting brief decide which conversations Arcli finds for you."
    >
      <SettingsRow label="Website" hint="Your targeting brief is built from it">
        {domain ? (
          <span title={websiteUrl}>{domain}</span>
        ) : (
          <span className="text-muted-foreground">No website added</span>
        )}
      </SettingsRow>
      <SettingsRow
        label="Targeting brief"
        className="md:items-start"
        action={
          needsSetup ? (
            <Button asChild size="sm">
              <Link href="/onboarding/workspace">Add your website</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/brief">Edit targeting brief</Link>
            </Button>
          )
        }
      >
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <p className="mt-1.5 max-w-[56ch] text-sm leading-6 text-muted-foreground">{status.detail}</p>
      </SettingsRow>
    </SettingsSection>
  );
}
