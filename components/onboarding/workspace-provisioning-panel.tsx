"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { C } from "@/lib/tokens";
import {
  createManualServiceProfile,
  saveServiceProfile,
  submitWebsiteForCrawl,
} from "@/app/(dashboard)/dashboard/actions";
import type {
  CrawlJobView,
  ProspectActionResult,
  ServiceProfileFields,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import {
  ActiveCrawlState,
  CrawlAttentionState,
  LOCAL_CRAWL_TRIGGER_GRACE_MS,
  crawlJobNeedsAttention,
  normalizedStatus,
} from "./workspace-provisioning-crawl";
import {
  EMPTY_FIELDS,
  ProfileReviewState,
} from "./workspace-provisioning-profile";
import {
  WebsiteConnectState,
  WorkspacePendingState,
} from "./workspace-provisioning-states";

type WorkspaceProvisioningPanelProps = {
  workspacePending?: boolean;
  initialWebsiteUrl?: string | null;
  crawlJob?: CrawlJobView | null;
  serviceProfile?: ServiceProfileView;
};

export function WorkspaceProvisioningPanel({
  workspacePending = false,
  initialWebsiteUrl = null,
  crawlJob = null,
  serviceProfile,
}: WorkspaceProvisioningPanelProps) {
  const router = useRouter();
  const [websiteUrl, setWebsiteUrl] = useState(
    initialWebsiteUrl ?? serviceProfile?.websiteUrl ?? "",
  );
  const [submittedWebsiteUrl, setSubmittedWebsiteUrl] = useState<string | null>(null);
  const [profileFields, setProfileFields] = useState<ServiceProfileFields>(
    serviceProfile?.fields ?? EMPTY_FIELDS,
  );
  const [websiteResult, setWebsiteResult] = useState<ProspectActionResult | null>(null);
  const [profileResult, setProfileResult] = useState<ProspectActionResult | null>(null);
  const [isWebsitePending, startWebsiteTransition] = useTransition();
  const [isProfilePending, startProfileTransition] = useTransition();
  const [isManualPending, startManualTransition] = useTransition();
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);
  const [statusNow, setStatusNow] = useState(() => Date.now());

  const effectiveWebsiteUrl =
    submittedWebsiteUrl ?? initialWebsiteUrl ?? serviceProfile?.websiteUrl ?? "";
  const hasProfile = Boolean(serviceProfile?.hasProfile);
  const crawlStatus = normalizedStatus(crawlJob?.status);
  const hasFreshLocalSubmit = Boolean(
    submittedWebsiteUrl &&
      effectiveWebsiteUrl &&
      submittedWebsiteUrl.trim() === effectiveWebsiteUrl.trim(),
  );
  const localSubmitAge = submittedAt ? statusNow - submittedAt : null;
  const hasLocalSubmitGrace =
    hasFreshLocalSubmit &&
    localSubmitAge !== null &&
    localSubmitAge < LOCAL_CRAWL_TRIGGER_GRACE_MS;
  const hasTerminalCrawl =
    crawlStatus === "failed" || crawlStatus === "dead_lettered";
  const needsCrawlAttention =
    Boolean(effectiveWebsiteUrl) &&
    !hasProfile &&
    (hasTerminalCrawl ||
      (!hasLocalSubmitGrace && crawlJobNeedsAttention(crawlJob, statusNow)));
  const isCrawling = Boolean(effectiveWebsiteUrl) && !hasProfile && !needsCrawlAttention;

  useEffect(() => {
    setWebsiteUrl(initialWebsiteUrl ?? serviceProfile?.websiteUrl ?? "");
  }, [initialWebsiteUrl, serviceProfile?.websiteUrl]);

  useEffect(() => {
    setProfileFields(serviceProfile?.fields ?? EMPTY_FIELDS);
  }, [serviceProfile?.id, serviceProfile?.updatedAt, serviceProfile?.fields]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setStatusNow(Date.now());
      if (isCrawling) {
        router.refresh();
      }
    }, isCrawling ? 5000 : 30000);

    return () => window.clearInterval(intervalId);
  }, [isCrawling, router]);

  const reviewJson = useMemo(() => {
    return (
      serviceProfile?.rawProfile ?? {
        target_audience: profileFields.target_audience,
        core_problem: profileFields.core_problem,
        unique_value_prop: profileFields.unique_value_prop,
        pain_points: profileFields.pain_points,
        buying_triggers: profileFields.buying_triggers,
        negative_keywords: profileFields.negative_keywords,
        excluded_audiences: profileFields.excluded_audiences,
      }
    );
  }, [profileFields, serviceProfile?.rawProfile]);

  const updateField = <Key extends keyof ServiceProfileFields>(
    key: Key,
    value: ServiceProfileFields[Key],
  ) => {
    setProfileFields((current) => ({ ...current, [key]: value }));
  };

  const handleWebsiteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    formData.set("website_url", websiteUrl);

    startWebsiteTransition(async () => {
      const result = await submitWebsiteForCrawl(formData);
      setWebsiteResult(result);
      const now = Date.now();
      setStatusNow(now);

      if (result.ok) {
        setSubmittedWebsiteUrl(websiteUrl.trim());
        setSubmittedAt(now);
      } else {
        setSubmittedAt(null);
      }
      router.refresh();
    });
  };

  const retryCrawl = () => {
    if (!effectiveWebsiteUrl) return;

    const formData = new FormData();
    formData.set("website_url", effectiveWebsiteUrl);

    startWebsiteTransition(async () => {
      const result = await submitWebsiteForCrawl(formData);
      setWebsiteResult(result);
      const now = Date.now();
      setStatusNow(now);

      if (result.ok) {
        setSubmittedWebsiteUrl(effectiveWebsiteUrl.trim());
        setSubmittedAt(now);
      } else {
        setSubmittedAt(null);
      }
      router.refresh();
    });
  };

  const startManualProfile = () => {
    if (!effectiveWebsiteUrl) return;

    const formData = new FormData();
    formData.set("website_url", effectiveWebsiteUrl);

    startManualTransition(async () => {
      const result = await createManualServiceProfile(formData);
      setWebsiteResult(result);
      setStatusNow(Date.now());

      if (result.ok) {
        setSubmittedWebsiteUrl(null);
        setSubmittedAt(null);
        router.refresh();
      }
    });
  };

  const persistProfile = (intent: "save" | "approve") => {
    if (!serviceProfile) return;

    startProfileTransition(async () => {
      const result = await saveServiceProfile(
        serviceProfile.id,
        serviceProfile.hasProfile,
        profileFields,
        intent,
      );
      setProfileResult(result);

      if (result.ok && intent === "approve") {
        router.replace("/dashboard");
        return;
      }

      if (result.ok) {
        router.refresh();
      }
    });
  };

  if (workspacePending) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: C.offWhite, color: C.text }}>
        <WorkspacePendingState />
      </div>
    );
  }

  if (!effectiveWebsiteUrl) {
    return (
      <WebsiteConnectState
        websiteUrl={websiteUrl}
        websiteResult={websiteResult}
        isWebsitePending={isWebsitePending}
        onWebsiteUrlChange={setWebsiteUrl}
        onWebsiteSubmit={handleWebsiteSubmit}
      />
    );
  }

  if (needsCrawlAttention) {
    return (
      <CrawlAttentionState
        crawlJob={crawlJob}
        effectiveWebsiteUrl={effectiveWebsiteUrl}
        isManualPending={isManualPending}
        isWebsitePending={isWebsitePending}
        statusNow={statusNow}
        websiteResult={websiteResult}
        retryCrawl={retryCrawl}
        startManualProfile={startManualProfile}
      />
    );
  }

  if (isCrawling) {
    return (
      <ActiveCrawlState
        crawlJob={crawlJob}
        effectiveWebsiteUrl={effectiveWebsiteUrl}
        isManualPending={isManualPending}
        statusNow={statusNow}
        websiteResult={websiteResult}
        startManualProfile={startManualProfile}
        onRefreshStatus={() => router.refresh()}
      />
    );
  }

  return (
    <ProfileReviewState
      effectiveWebsiteUrl={effectiveWebsiteUrl}
      isProfilePending={isProfilePending}
      profileFields={profileFields}
      profileResult={profileResult}
      reviewJson={reviewJson}
      persistProfile={persistProfile}
      updateField={updateField}
    />
  );
}
