"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { C } from "@/lib/tokens";
import { updateResultEmailPreference } from "@/lib/result-email-client";
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
import { ResultEmailPrompt, type ResultEmailOffer } from "./result-email-prompt";

type WorkspaceProvisioningPanelProps = {
  workspacePending?: boolean;
  initialWebsiteUrl?: string | null;
  crawlJob?: CrawlJobView | null;
  serviceProfile?: ServiceProfileView;
  initialResultEmailOffer?: ResultEmailOffer;
};

function websiteDomainForPrompt(value: string): string | null {
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const parsed = new URL(candidate);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.hostname
      ? parsed.hostname.replace(/^www\./i, "")
      : null;
  } catch {
    return null;
  }
}

export function WorkspaceProvisioningPanel({
  workspacePending = false,
  initialWebsiteUrl = null,
  crawlJob = null,
  serviceProfile,
  initialResultEmailOffer = { status: "unavailable", email: null },
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
  const [resultEmailOffer, setResultEmailOffer] = useState(initialResultEmailOffer);
  const [emailPromptOpen, setEmailPromptOpen] = useState(false);
  const [emailPromptError, setEmailPromptError] = useState<string | null>(null);
  const [pendingWebsiteUrl, setPendingWebsiteUrl] = useState<string | null>(null);
  const [emailPromptAnswered, setEmailPromptAnswered] = useState(false);

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
        urgency_signals: profileFields.urgency_signals,
        discovery_queries: profileFields.discovery_queries,
        search_terms: profileFields.search_terms,
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

  const queueWebsite = async (url: string) => {
    const formData = new FormData();
    formData.set("website_url", url);

    let result: ProspectActionResult;
    try {
      result = await submitWebsiteForCrawl(formData);
    } catch {
      result = { ok: false, message: "Could not start the website analysis. Please try again." };
    }
    setWebsiteResult(result);
    const now = Date.now();
    setStatusNow(now);

    if (result.ok) {
      setSubmittedWebsiteUrl(url);
      setSubmittedAt(now);
      // The discovery screen owns progress for the crawl and first source scan.
      router.replace("/onboarding/discovery?scan=1");
      return;
    }
    setSubmittedAt(null);
    router.refresh();
  };

  const handleWebsiteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = websiteUrl.trim();
    const domain = websiteDomainForPrompt(url);
    if (!domain) {
      setWebsiteResult({ ok: false, message: "Enter a valid company website domain." });
      return;
    }
    setWebsiteResult(null);

    if (resultEmailOffer.status === "off" && resultEmailOffer.email && !emailPromptAnswered) {
      setPendingWebsiteUrl(url);
      setEmailPromptError(null);
      setEmailPromptOpen(true);
      return;
    }
    startWebsiteTransition(() => queueWebsite(url));
  };

  const confirmEmailChoice = (enable: boolean) => {
    if (!pendingWebsiteUrl) return;
    startWebsiteTransition(async () => {
      try {
        await updateResultEmailPreference(enable);
        setResultEmailOffer((current) => ({ ...current, status: enable ? "on" : "off" }));
      } catch (error) {
        if (enable) {
          setEmailPromptError(
            error instanceof Error ? error.message : "Could not save your email choice.",
          );
          return;
        }
        // This account was already effectively off. A preference-service
        // failure must not block the website setup when no opt-in occurred.
        console.warn("[RESULT_EMAIL_OPT_OUT_DURING_ONBOARDING_FAILED]");
      }
      setEmailPromptAnswered(true);
      setEmailPromptOpen(false);
      setEmailPromptError(null);
      const url = pendingWebsiteUrl;
      setPendingWebsiteUrl(null);
      await queueWebsite(url);
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
        router.replace("/onboarding/discovery?scan=1");
        return;
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
      <>
        <WebsiteConnectState
          websiteUrl={websiteUrl}
          websiteResult={websiteResult}
          isWebsitePending={isWebsitePending}
          resultEmailOffer={resultEmailOffer}
          emailPromptAnswered={emailPromptAnswered}
          onWebsiteUrlChange={setWebsiteUrl}
          onWebsiteSubmit={handleWebsiteSubmit}
        />
        {resultEmailOffer.email ? (
          <ResultEmailPrompt
            open={emailPromptOpen}
            domain={websiteDomainForPrompt(pendingWebsiteUrl ?? "") ?? "your website"}
            email={resultEmailOffer.email}
            pending={isWebsitePending}
            error={emailPromptError}
            onOpenChange={(open) => {
              setEmailPromptOpen(open);
              if (!open) {
                setPendingWebsiteUrl(null);
                setEmailPromptError(null);
              }
            }}
            onContinue={() => confirmEmailChoice(false)}
            onEnable={() => confirmEmailChoice(true)}
          />
        ) : null}
      </>
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
