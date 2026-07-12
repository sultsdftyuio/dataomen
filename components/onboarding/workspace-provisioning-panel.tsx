"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Globe2,
  Loader2,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAsyncProvisioning } from "@/hooks/useAsyncProvisioning";
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

type WorkspaceProvisioningPanelProps = {
  workspacePending?: boolean;
  initialWebsiteUrl?: string | null;
  crawlJob?: CrawlJobView | null;
  serviceProfile?: ServiceProfileView;
};

type ListTone = {
  color: string;
  background: string;
  border: string;
};

const EMPTY_FIELDS: ServiceProfileFields = {
  target_audience: [],
  core_problem: "",
  unique_value_prop: "",
  use_cases: [],
  pain_points: [],
  buying_triggers: [],
  negative_keywords: [],
  excluded_audiences: [],
};

const LIST_TONES: Record<string, ListTone> = {
  blue: {
    color: C.blue,
    background: C.bluePale,
    border: C.blueLight,
  },
  green: {
    color: C.green,
    background: C.greenPale,
    border: C.green,
  },
  amber: {
    color: C.amber,
    background: C.amberPale,
    border: C.amber,
  },
  red: {
    color: C.red,
    background: C.redPale,
    border: C.red,
  },
};

const LOCAL_CRAWL_TRIGGER_GRACE_MS = 25 * 1000;
const STALE_CRAWL_HEARTBEAT_MS = 4 * 60 * 1000;

const CRAWL_PHASES = [
  { key: "queued", label: "Queued" },
  { key: "crawling", label: "Crawling pages" },
  { key: "crawl_persisted", label: "Pages captured" },
  { key: "extracting_profile", label: "Extracting profile" },
  { key: "persisting_profile", label: "Saving brief" },
] as const;

function normalizedStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, "_") ?? null;
}

function timestampAgeMs(value: string | null | undefined, now = Date.now()) {
  if (!value) return null;

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;

  return now - parsed;
}

function crawlJobNeedsAttention(
  crawlJob: CrawlJobView | null | undefined,
  now = Date.now(),
) {
  const status = normalizedStatus(crawlJob?.status);
  if (status === "failed" || status === "dead_lettered") return true;

  if (status === "pending" || status === "processing") {
    const heartbeatAge = timestampAgeMs(
      crawlJob?.lastHeartbeatAt ?? crawlJob?.updatedAt,
      now,
    );
    return heartbeatAge === null || heartbeatAge > STALE_CRAWL_HEARTBEAT_MS;
  }

  return !crawlJob;
}

function crawlStatusMessage(crawlJob: CrawlJobView | null | undefined) {
  const status = normalizedStatus(crawlJob?.status);
  const phase = crawlJob?.phase?.replace(/_/g, " ") ?? null;

  if (status === "failed") {
    return crawlJob?.failureReason
      ? `The crawl failed during ${phase ?? "processing"}: ${crawlJob.failureReason}.`
      : "The crawl failed before a service profile was created.";
  }

  if (status === "dead_lettered") {
    return "The crawl retried too many times and was paused for review.";
  }

  if (status === "pending" || status === "processing") {
    return phase
      ? `The last crawl stopped reporting progress during ${phase}.`
      : "The last crawl stopped reporting progress.";
  }

  return "This website was submitted before crawl tracking was available.";
}

function activeCrawlPhase(crawlJob: CrawlJobView | null | undefined) {
  const phase = normalizedStatus(crawlJob?.phase);
  if (!phase) return "queued";
  return phase;
}

function activeCrawlTitle(crawlJob: CrawlJobView | null | undefined) {
  const phase = activeCrawlPhase(crawlJob);
  const phaseLabels: Record<string, string> = {
    queued: "Queued for crawl",
    starting: "Starting crawler",
    crawling: "Crawling your website",
    crawl_persisted: "Website pages captured",
    extracting_profile: "Extracting service profile",
    persisting_profile: "Saving service profile",
  };

  return phaseLabels[phase] ?? "Crawling your website";
}

function activeCrawlDetail(crawlJob: CrawlJobView | null | undefined) {
  const phase = activeCrawlPhase(crawlJob);
  const phaseDetails: Record<string, string> = {
    queued: "Waiting for the worker to claim the job.",
    starting: "The worker has picked up the website.",
    crawling: "Collecting the homepage and high-signal product pages.",
    crawl_persisted: "Raw page content was saved. Profile extraction is next.",
    extracting_profile: "Extracting audience, pain, value proposition, and bad-fit signals.",
    persisting_profile: "Writing the extracted profile to your workspace.",
  };

  return phaseDetails[phase] ?? "Working on your service profile.";
}

function crawlProgressValue(crawlJob: CrawlJobView | null | undefined) {
  const phase = activeCrawlPhase(crawlJob);
  const progress: Record<string, number> = {
    queued: 12,
    starting: 20,
    crawling: 42,
    crawl_persisted: 62,
    extracting_profile: 78,
    persisting_profile: 90,
  };

  return progress[phase] ?? 28;
}

function crawlStepState(
  stepKey: string,
  crawlJob: CrawlJobView | null | undefined,
) {
  const activeIndex = CRAWL_PHASES.findIndex(
    (phase) => phase.key === activeCrawlPhase(crawlJob),
  );
  const stepIndex = CRAWL_PHASES.findIndex((phase) => phase.key === stepKey);

  if (activeIndex < 0) return "pending";
  if (stepIndex < activeIndex) return "complete";
  if (stepIndex === activeIndex) return "active";
  return "pending";
}

function formatStatusAge(crawlJob: CrawlJobView | null | undefined, now = Date.now()) {
  const ageMs = timestampAgeMs(
    crawlJob?.lastHeartbeatAt ?? crawlJob?.updatedAt,
    now,
  );
  if (ageMs === null || ageMs < 0) return "just now";

  const totalSeconds = Math.floor(ageMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s ago`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  return `${totalMinutes}m ago`;
}

function normalizeItems(items: string[]) {
  const seen = new Set<string>();

  return items.reduce<string[]>((nextItems, item) => {
    const normalized = item.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();

    if (normalized && !seen.has(key)) {
      seen.add(key);
      nextItems.push(normalized);
    }

    return nextItems;
  }, []);
}

function ResultText({ result }: { result: ProspectActionResult | null }) {
  if (!result) return null;

  return (
    <div
      className="rounded-md border px-3 py-2 text-xs font-medium"
      style={{
        borderColor: result.ok ? C.green : C.red,
        backgroundColor: result.ok ? C.greenPale : C.redPale,
        color: result.ok ? C.green : C.red,
      }}
    >
      {result.message}
    </div>
  );
}

function ListEditor({
  label,
  value,
  placeholder,
  tone,
  onChange,
}: {
  label: string;
  value: string[];
  placeholder: string;
  tone: ListTone;
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const commitDraft = () => {
    if (!draft.trim()) {
      setDraft("");
      return;
    }

    onChange(normalizeItems([...value, draft]));
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <Label style={{ color: C.navy }}>{label}</Label>
      <div
        className="flex min-h-24 flex-wrap items-start gap-2 rounded-md border p-2"
        style={{ borderColor: C.rule, backgroundColor: C.white }}
      >
        {value.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border px-2 text-xs font-semibold"
            style={{
              borderColor: tone.border,
              backgroundColor: tone.background,
              color: tone.color,
            }}
          >
            <input
              aria-label={`${label} item ${index + 1}`}
              value={item}
              className="min-w-20 bg-transparent outline-none"
              style={{ width: `${Math.min(Math.max(item.length + 2, 10), 28)}ch` }}
              onBlur={() => onChange(normalizeItems(value))}
              onChange={(event) => {
                const next = [...value];
                next[index] = event.target.value;
                onChange(next);
              }}
            />
            <button
              type="button"
              aria-label={`Remove ${item}`}
              className="inline-flex size-5 items-center justify-center rounded-md"
              onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}

        <div className="flex min-h-7 min-w-48 flex-1 items-center gap-2">
          <Plus className="size-3.5" style={{ color: C.muted }} />
          <input
            aria-label={placeholder}
            value={draft}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            style={{ color: C.navy }}
            onBlur={commitDraft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commitDraft();
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

function WorkspacePendingState() {
  const router = useRouter();
  const { status, message } = useAsyncProvisioning();
  const isFailed = status === "FAILED";

  useEffect(() => {
    if (status === "READY") {
      router.refresh();
    }
  }, [router, status]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        {isFailed ? (
          <>
            <div
              className="mb-4 flex size-12 items-center justify-center rounded-full"
              style={{ backgroundColor: C.redPale }}
            >
              <AlertCircle className="size-6" style={{ color: C.red }} />
            </div>
            <h1 className="text-lg font-semibold" style={{ color: C.navy }}>
              Setup took too long
            </h1>
            <p className="mt-2 text-sm leading-6" style={{ color: C.muted }}>
              We could not confirm the workspace mapping in time. Your account data is safe.
            </p>
            <Button
              type="button"
              className="mt-6"
              onClick={() => window.location.reload()}
              style={{ backgroundColor: C.navy, color: C.white }}
            >
              Retry connection
            </Button>
          </>
        ) : (
          <>
            <div className="mb-7 flex items-center gap-2">
              <div
                className="size-3 animate-[bounce_1s_infinite_-0.3s] rounded-full"
                style={{ backgroundColor: C.blue }}
              />
              <div
                className="size-3 animate-[bounce_1s_infinite_-0.15s] rounded-full"
                style={{ backgroundColor: C.blue }}
              />
              <div
                className="size-3 animate-[bounce_1s_infinite] rounded-full"
                style={{ backgroundColor: C.blue }}
              />
            </div>
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: C.navy }}>
              Securing your workspace
            </h1>
            <p className="mt-3 text-sm font-medium" style={{ color: C.muted }}>
              {message || "Preparing your environment"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

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
      <main
        className="flex min-h-screen items-center justify-center p-6"
        style={{ backgroundColor: C.offWhite, color: C.text }}
      >
        <Card className="w-full max-w-xl rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
          <CardHeader className="space-y-3">
            <div
              className="flex size-10 items-center justify-center rounded-md"
              style={{ backgroundColor: C.bluePale, color: C.blue }}
            >
              <Globe2 className="size-5" />
            </div>
            <div>
              <CardTitle className="text-xl" style={{ color: C.navy }}>
                Connect your website
              </CardTitle>
              <CardDescription className="mt-2" style={{ color: C.muted }}>
                Arcli will crawl it and extract the service profile used by the prospect engine.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleWebsiteSubmit}>
              <div className="space-y-2">
                <Label htmlFor="website_url" style={{ color: C.navy }}>
                  Website URL
                </Label>
                <Input
                  id="website_url"
                  name="website_url"
                  type="url"
                  placeholder="https://company.com"
                  value={websiteUrl}
                  disabled={isWebsitePending}
                  onChange={(event) => setWebsiteUrl(event.target.value)}
                  style={{ borderColor: C.rule, color: C.navy }}
                />
              </div>
              <Button
                type="submit"
                disabled={isWebsitePending || !websiteUrl.trim()}
                className="w-full"
                style={{ backgroundColor: C.navy, color: C.white }}
              >
                {isWebsitePending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {isWebsitePending ? "Starting crawl..." : "Start website crawl"}
              </Button>
              <ResultText result={websiteResult} />
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (needsCrawlAttention) {
    return (
      <main
        className="flex min-h-screen items-center justify-center p-6"
        style={{ backgroundColor: C.offWhite, color: C.text }}
      >
        <Card className="w-full max-w-xl rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
          <CardHeader className="space-y-3 text-center">
            <div
              className="mx-auto flex size-11 items-center justify-center rounded-md"
              style={{ backgroundColor: C.redPale, color: C.red }}
            >
              <AlertCircle className="size-5" />
            </div>
            <div>
              <CardTitle className="text-xl" style={{ color: C.navy }}>
                Crawl needs attention
              </CardTitle>
              <CardDescription className="mt-2" style={{ color: C.muted }}>
                {effectiveWebsiteUrl}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="rounded-md border px-3 py-3 text-sm leading-6"
              style={{
                borderColor: C.red,
                backgroundColor: C.redPale,
                color: C.red,
              }}
            >
              {crawlStatusMessage(crawlJob)}
            </div>
            {crawlJob?.errorMessage ? (
              <p className="text-xs leading-5" style={{ color: C.muted }}>
                {crawlJob.errorMessage}
              </p>
            ) : null}
            <div
              className="grid gap-2 rounded-md border p-3 text-left text-xs"
              style={{ borderColor: C.rule, backgroundColor: C.white }}
            >
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: C.muted }}>Last backend signal</span>
                <span className="font-semibold" style={{ color: C.navy }}>
                  {formatStatusAge(crawlJob, statusNow)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: C.muted }}>Status</span>
                <span className="font-semibold" style={{ color: C.navy }}>
                  {crawlJob?.status ?? "not tracked"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ color: C.muted }}>Phase</span>
                <span className="font-semibold" style={{ color: C.navy }}>
                  {crawlJob?.phase?.replace(/_/g, " ") ?? "missing"}
                </span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                disabled={isWebsitePending || isManualPending}
                className="w-full"
                onClick={retryCrawl}
                style={{ backgroundColor: C.navy, color: C.white }}
              >
                {isWebsitePending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {isWebsitePending ? "Restarting..." : "Retry crawl"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isWebsitePending || isManualPending}
                className="w-full"
                onClick={startManualProfile}
                style={{
                  borderColor: C.ruleDark,
                  backgroundColor: C.white,
                  color: C.navy,
                }}
              >
                {isManualPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Target className="size-4" />
                )}
                {isManualPending ? "Opening..." : "Enter manually"}
              </Button>
            </div>
            <ResultText result={websiteResult} />
          </CardContent>
        </Card>
      </main>
    );
  }

  if (isCrawling) {
    return (
      <main
        className="flex min-h-screen items-center justify-center p-6"
        style={{ backgroundColor: C.offWhite, color: C.text }}
      >
        <Card className="w-full max-w-xl rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
          <CardHeader className="space-y-3 text-center">
            <div
              className="mx-auto flex size-11 items-center justify-center rounded-md"
              style={{ backgroundColor: C.bluePale, color: C.blue }}
            >
              <Sparkles className="size-5 animate-pulse" />
            </div>
            <div>
              <CardTitle className="text-xl" style={{ color: C.navy }}>
                {activeCrawlTitle(crawlJob)}
              </CardTitle>
              <CardDescription className="mt-2" style={{ color: C.muted }}>
                {effectiveWebsiteUrl}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                <span style={{ color: C.muted }}>
                  {activeCrawlDetail(crawlJob)}
                </span>
                <span style={{ color: C.blue }}>
                  {crawlJob
                    ? `Signal ${formatStatusAge(crawlJob, statusNow)}`
                    : "Sending trigger"}
                </span>
              </div>
              <Progress value={crawlProgressValue(crawlJob)} />
            </div>
            <div
              className="grid gap-2 rounded-md border p-3"
              style={{ borderColor: C.rule, backgroundColor: C.white }}
            >
              {CRAWL_PHASES.map((phase) => {
                const state = crawlStepState(phase.key, crawlJob);
                return (
                  <div
                    key={phase.key}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold"
                        style={{
                          borderColor:
                            state === "complete" || state === "active"
                              ? C.blue
                              : C.ruleDark,
                          backgroundColor:
                            state === "complete"
                              ? C.blue
                              : state === "active"
                                ? C.bluePale
                                : C.white,
                          color:
                            state === "complete"
                              ? C.white
                              : state === "active"
                                ? C.blue
                                : C.muted,
                        }}
                      >
                        {state === "complete" ? <CheckCircle2 className="size-3" /> : null}
                      </span>
                      <span
                        className="truncate"
                        style={{ color: state === "pending" ? C.muted : C.navy }}
                      >
                        {phase.label}
                      </span>
                    </div>
                    {state === "active" ? (
                      <Loader2 className="size-3.5 animate-spin" style={{ color: C.blue }} />
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isManualPending}
                onClick={startManualProfile}
                style={{
                  borderColor: C.ruleDark,
                  backgroundColor: C.white,
                  color: C.navy,
                }}
              >
                {isManualPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Target className="size-4" />
                )}
                Enter manually
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.refresh()}
                style={{
                  borderColor: C.ruleDark,
                  backgroundColor: C.white,
                  color: C.navy,
                }}
              >
                Refresh status
              </Button>
            </div>
            <ResultText result={websiteResult} />
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen p-4 sm:p-6 lg:p-8"
      style={{ backgroundColor: C.offWhite, color: C.text }}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-5" style={{ borderColor: C.rule }}>
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: C.navy }}>
              Review your service profile
            </h1>
            <p className="mt-1 text-sm" style={{ color: C.muted }}>
              {effectiveWebsiteUrl}
            </p>
          </div>
          <Badge
            variant="outline"
            className="rounded-md px-3 py-1"
            style={{
              borderColor: C.blueLight,
              backgroundColor: C.bluePale,
              color: C.blue,
            }}
          >
            Pending review
          </Badge>
        </div>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(320px,5fr)]">
          <Card className="rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
            <CardHeader className="gap-2">
              <div className="flex items-center gap-2">
                <Target className="size-4" style={{ color: C.blue }} />
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Editable Profile
                </CardTitle>
              </div>
              <CardDescription style={{ color: C.muted }}>
                This profile becomes the matching brief for qualified prospect discovery.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <ListEditor
                  label="Target Audience"
                  value={profileFields.target_audience}
                  placeholder="Add audience"
                  tone={LIST_TONES.blue}
                  onChange={(value) => updateField("target_audience", value)}
                />
                <ListEditor
                  label="Use Cases"
                  value={profileFields.use_cases}
                  placeholder="Add use case"
                  tone={LIST_TONES.green}
                  onChange={(value) => updateField("use_cases", value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="core_problem" style={{ color: C.navy }}>
                    Core Problem
                  </Label>
                  <Textarea
                    id="core_problem"
                    value={profileFields.core_problem}
                    onChange={(event) => updateField("core_problem", event.target.value)}
                    className="min-h-28"
                    style={{ borderColor: C.rule, color: C.navy }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unique_value_prop" style={{ color: C.navy }}>
                    Unique Value Prop
                  </Label>
                  <Textarea
                    id="unique_value_prop"
                    value={profileFields.unique_value_prop}
                    onChange={(event) =>
                      updateField("unique_value_prop", event.target.value)
                    }
                    className="min-h-28"
                    style={{ borderColor: C.rule, color: C.navy }}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ListEditor
                  label="Pain Points"
                  value={profileFields.pain_points}
                  placeholder="Add pain point"
                  tone={LIST_TONES.amber}
                  onChange={(value) => updateField("pain_points", value)}
                />
                <ListEditor
                  label="Buying Triggers"
                  value={profileFields.buying_triggers}
                  placeholder="Add trigger"
                  tone={LIST_TONES.green}
                  onChange={(value) => updateField("buying_triggers", value)}
                />
                <ListEditor
                  label="Negative Keywords"
                  value={profileFields.negative_keywords}
                  placeholder="Add keyword"
                  tone={LIST_TONES.red}
                  onChange={(value) => updateField("negative_keywords", value)}
                />
                <ListEditor
                  label="Excluded Audiences"
                  value={profileFields.excluded_audiences}
                  placeholder="Add exclusion"
                  tone={LIST_TONES.red}
                  onChange={(value) => updateField("excluded_audiences", value)}
                />
              </div>

              <div
                className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
                style={{ borderColor: C.rule }}
              >
                <ResultText result={profileResult} />
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isProfilePending}
                    onClick={() => persistProfile("save")}
                    style={{
                      borderColor: C.ruleDark,
                      backgroundColor: C.white,
                      color: C.navy,
                    }}
                  >
                    <Save className="size-4" />
                    Save Refinements
                  </Button>
                  <Button
                    type="button"
                    disabled={isProfilePending}
                    onClick={() => persistProfile("approve")}
                    style={{ backgroundColor: C.green, color: C.white }}
                  >
                    {isProfilePending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Approve & Activate Engine
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
            <CardHeader className="gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4" style={{ color: C.green }} />
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Extracted JSON
                </CardTitle>
              </div>
              <CardDescription style={{ color: C.muted }}>
                Structured output from the profile extraction worker.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre
                className="max-h-[560px] overflow-auto rounded-md border p-3 text-xs leading-5"
                style={{
                  borderColor: C.rule,
                  backgroundColor: C.navy,
                  color: C.offWhite,
                }}
              >
                {JSON.stringify(reviewJson, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
