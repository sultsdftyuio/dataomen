import type {
  BuyerDemandReportView,
  CrawlJobView,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";

/**
 * Pure status derivation for the live discovery page. It turns the crawl job,
 * targeting brief and discovery run into one honest status: what is happening,
 * which step it is on, and, when something failed, which step and what the
 * person can do about it. No React here so the rules stay easy to test.
 */

export const DISCOVERY_STEPS = [
  "Read your website",
  "Prepare your targeting brief",
  "Search public conversations",
  "Check candidates",
] as const;

export type DiscoveryStatusKind = "working" | "queued" | "error" | "ready";

/** What the primary button does when a scan stops. */
export type DiscoveryRecovery =
  | "open-prospects"
  | "check-website"
  | "retry-brief"
  | "check-again";

export type DiscoveryStatus = {
  kind: DiscoveryStatusKind;
  title: string;
  detail: string;
  /** Index into DISCOVERY_STEPS; equal to its length when every step is done. */
  stepIndex: number;
  /** Set when the scan stopped at a step. */
  failedStep?: number;
  recovery?: DiscoveryRecovery;
  /**
   * A heuristic or not-yet-confirmed failure. The page keeps checking slowly
   * so it can recover on its own if the backend resumes the job.
   */
  recoverable?: boolean;
  /** A finished scan where some sources didn't respond. */
  partialCoverage?: boolean;
};

export type DiscoveryStatusInput = {
  websiteUrl: string;
  crawlJob: CrawlJobView | null;
  serviceProfile: ServiceProfileView;
  buyerDemandReport: BuyerDemandReportView | null;
  isWarmingUp: boolean;
  awaitingDiscoveryStart?: boolean;
  scanWasJustRequested?: boolean;
  mode?: "onboarding" | "scan";
};

const ACTIVE_CRAWL_STATUSES = ["queued", "pending", "processing"];
const PROFILE_EXTRACTION_PHASES = ["crawl_persisted", "extracting_profile", "persisting_profile"];
const QUEUE_CAPACITY_REASONS = ["admission_rejected", "queue_unavailable"];
const STALLED_CRAWL_MS = 10 * 60 * 1000;

export function normalizedStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, "_") ?? null;
}

export function websiteDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}

export function isCrawlActive(crawlJob: CrawlJobView | null) {
  return ACTIVE_CRAWL_STATUSES.includes(normalizedStatus(crawlJob?.status) ?? "");
}

function isActiveCrawlStalled(crawlJob: CrawlJobView | null) {
  if (!crawlJob || !isCrawlActive(crawlJob)) return false;

  const timestamp = Date.parse(crawlJob.lastHeartbeatAt ?? crawlJob.updatedAt ?? "");
  return Number.isFinite(timestamp) && Date.now() - timestamp > STALLED_CRAWL_MS;
}

export function isEmbeddingPending(serviceProfile: ServiceProfileView) {
  const embeddingStatus = normalizedStatus(serviceProfile.embeddingStatus);
  return Boolean(embeddingStatus && embeddingStatus !== "completed");
}

/**
 * Crawl failures carry machine reasons ("admission_rejected") and worker
 * messages. Map the ones we know to plain copy and never show the raw text.
 */
function crawlFailure(crawlJob: CrawlJobView | null, domain: string): DiscoveryStatus {
  const reason = normalizedStatus(crawlJob?.failureReason ?? crawlJob?.phase);

  if (QUEUE_CAPACITY_REASONS.includes(reason ?? "")) {
    return {
      kind: "error",
      title: "Couldn't start reading your website",
      detail: `Arcli is reading other websites and couldn't add ${domain} to the queue. Try again from Prospects in a few minutes.`,
      stepIndex: 0,
      failedStep: 0,
      recovery: "open-prospects",
    };
  }

  if (reason === "profile_content_missing") {
    return {
      kind: "error",
      title: `Couldn't find what you offer on ${domain}`,
      detail:
        "Arcli read the site, but its pages didn't describe your product. Check that the address points to your main website, then try again.",
      stepIndex: 0,
      failedStep: 0,
      recovery: "check-website",
    };
  }

  return {
    kind: "error",
    title: `Couldn't read ${domain}`,
    detail: "Check that the website address is right and the site is public, then try again.",
    stepIndex: 0,
    failedStep: 0,
    recovery: "check-website",
  };
}

function briefFailure(serviceProfile: ServiceProfileView): DiscoveryStatus {
  const reason = normalizedStatus(serviceProfile.embeddingFailureReason);

  return {
    kind: "error",
    title: "Couldn't prepare your targeting brief",
    detail:
      reason === "time_limit_exceeded"
        ? "Arcli read your website, but preparing the brief took too long and stopped. Try again."
        : "Arcli read your website, but couldn't turn it into a targeting brief. Try again.",
    stepIndex: 1,
    failedStep: 1,
    recovery: "retry-brief",
  };
}

function finishedSearch(report: BuyerDemandReportView): DiscoveryStatus {
  const status = normalizedStatus(report.status);

  // A failed or skipped run found nothing because sources didn't answer, not
  // because there are no buyers. Say so and stop at the search step.
  if (status === "failed" || status === "skipped") {
    return {
      kind: "error",
      title: "The search didn't finish",
      detail:
        "Public sources didn't respond during this scan, so nothing was collected. Your existing prospects are unchanged.",
      stepIndex: 2,
      failedStep: 2,
      recovery: "open-prospects",
    };
  }

  const partialCoverage = status === "partial" || status === "degraded";
  return {
    kind: "ready",
    title: partialCoverage ? "Scan finished with partial coverage" : "Scan finished",
    detail: report.summary.verifierPending
      ? "Sources have finished. Arcli is still checking some candidates, and they'll appear in Prospects when ready."
      : partialCoverage
        ? "Some sources didn't respond, so this scan saw fewer conversations than usual. Opening Prospects."
        : "Opening Prospects. A finished scan doesn't always produce a new prospect.",
    stepIndex: DISCOVERY_STEPS.length,
    partialCoverage,
  };
}

export function deriveDiscoveryStatus({
  websiteUrl,
  crawlJob,
  serviceProfile,
  buyerDemandReport,
  isWarmingUp,
  awaitingDiscoveryStart = false,
  scanWasJustRequested = false,
  mode = "onboarding",
}: DiscoveryStatusInput): DiscoveryStatus {
  const domain = websiteDomain(websiteUrl);
  const crawlStatus = normalizedStatus(crawlJob?.status);
  const crawlPhase = normalizedStatus(crawlJob?.phase);
  const embeddingStatus = normalizedStatus(serviceProfile.embeddingStatus);
  const crawlActive = isCrawlActive(crawlJob);
  const readingStep = PROFILE_EXTRACTION_PHASES.includes(crawlPhase ?? "") ? 1 : 0;

  if (!crawlJob && !serviceProfile.hasProfile && scanWasJustRequested) {
    return {
      kind: "working",
      title: "Starting to read your website",
      detail: `Your request is saved. Arcli will start reading ${domain} in a moment.`,
      stepIndex: 0,
    };
  }

  if (!crawlJob && !serviceProfile.hasProfile) {
    return {
      kind: "error",
      title: mode === "scan" ? "Your scan didn't start" : "Your first scan didn't start",
      detail: `Arcli couldn't confirm that ${domain} was added to the reading queue. Open Prospects to try again, or check the website address.`,
      stepIndex: 0,
      failedStep: 0,
      recovery: "open-prospects",
      recoverable: true,
    };
  }

  if (crawlStatus === "failed" || crawlStatus === "dead_lettered") {
    return crawlFailure(crawlJob, domain);
  }

  // Runs whether or not a brief already exists, so a hung re-read of an
  // existing website is caught too (it used to spin forever).
  if (isActiveCrawlStalled(crawlJob)) {
    return {
      kind: "error",
      title: serviceProfile.hasProfile
        ? "Re-reading your website has stopped updating"
        : "Reading your website has stopped updating",
      detail:
        "There's been no progress for more than 10 minutes. This page keeps checking and carries on if the scan resumes. If it doesn't, check the website address.",
      stepIndex: readingStep,
      failedStep: readingStep,
      recovery: "check-again",
      recoverable: true,
    };
  }

  if (!serviceProfile.hasProfile && crawlStatus === "completed") {
    return {
      kind: "error",
      title: "Couldn't build a targeting brief from your website",
      detail:
        "Arcli finished reading the site but couldn't work out what you offer. Check the website address, then try again.",
      stepIndex: 1,
      failedStep: 1,
      recovery: "check-website",
    };
  }

  if (["failed", "error", "dead_lettered"].includes(embeddingStatus ?? "")) {
    return briefFailure(serviceProfile);
  }

  // A rescan re-reads a website that already has a brief. Without this branch
  // the page skipped to the last step while the site was still being read.
  if (crawlActive && serviceProfile.hasProfile) {
    return crawlPhase === "queued"
      ? {
          kind: "queued",
          title: "Waiting to re-read your website",
          detail: "Arcli reads one website at a time on your plan. Your place is saved and it starts automatically.",
          stepIndex: 0,
        }
      : {
          kind: "working",
          title: "Re-reading your website",
          detail: `Arcli is reading ${domain} again to refresh your targeting brief before it searches.`,
          stepIndex: readingStep,
        };
  }

  if (awaitingDiscoveryStart) {
    return {
      kind: "working",
      title: "Starting a new search",
      detail: "Arcli is getting public sources ready to search with your current targeting brief.",
      stepIndex: 2,
    };
  }

  if (buyerDemandReport?.isTerminal) return finishedSearch(buyerDemandReport);

  if (!serviceProfile.hasProfile && crawlPhase === "queued") {
    return {
      kind: "queued",
      title: "Waiting to read your website",
      detail: "Arcli reads one website at a time on your plan. Your place is saved and it starts automatically.",
      stepIndex: 0,
    };
  }

  if (!serviceProfile.hasProfile) {
    return {
      kind: "working",
      title: "Reading your website",
      detail: `Arcli is finding the pages on ${domain} that describe your product and who it's for.`,
      stepIndex: readingStep,
    };
  }

  if (embeddingStatus && embeddingStatus !== "completed") {
    return {
      kind: "working",
      title: "Preparing your targeting brief",
      detail: "Arcli is turning your website into the problems and buyers it should look for.",
      stepIndex: 1,
    };
  }

  if (isWarmingUp) {
    return {
      kind: "working",
      title: "Searching public conversations",
      detail: "Arcli is looking for people who describe the problem you solve, and filtering out poor matches.",
      stepIndex: 2,
    };
  }

  if (crawlStatus === "completed") {
    return {
      kind: "ready",
      title: mode === "scan" ? "Scan finished" : "Your website is ready",
      detail: "Opening Prospects while Arcli finishes checking new conversations.",
      stepIndex: DISCOVERY_STEPS.length,
    };
  }

  return {
    kind: "working",
    title: "Finishing up",
    detail: "Arcli is doing a final check before showing your results.",
    stepIndex: 3,
  };
}

/** The newest timestamp across the work that is actually running. */
export function latestUpdate({
  crawlJob,
  serviceProfile,
  buyerDemandReport,
  awaitingDiscoveryStart = false,
}: Pick<
  DiscoveryStatusInput,
  "crawlJob" | "serviceProfile" | "buyerDemandReport" | "awaitingDiscoveryStart"
>) {
  // A just-requested search has no new row yet; older rows would make a fresh
  // request look days stale.
  if (awaitingDiscoveryStart) return null;

  const timestamps = [
    crawlJob?.lastHeartbeatAt,
    crawlJob?.updatedAt,
    serviceProfile.updatedAt,
    buyerDemandReport?.updatedAt,
  ]
    .map((value) => Date.parse(value ?? ""))
    .filter((value) => Number.isFinite(value));

  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

export function relativeUpdateLabel(timestamp: number | null) {
  if (timestamp === null) return "Waiting for the first update";

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 15) return "Updated just now";
  if (seconds < 60) return "Updated less than a minute ago";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Updated ${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  return `Updated ${Math.floor(hours / 24)} days ago`;
}
