"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ExternalLink,
  Globe2,
  MessageSquareText,
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
import { Textarea } from "@/components/ui/textarea";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import {
  saveServiceProfile,
  submitLeadFeedback,
  submitWebsiteForCrawl,
} from "./actions";
import {
  FEEDBACK_OPTIONS,
  type LeadFeedbackValue,
  type ProspectActionResult,
  type QualifiedLeadView,
  type ServiceProfileFields,
  type ServiceProfileView,
} from "./prospect-types";

type ProspectDashboardClientProps = {
  initialWebsiteUrl: string | null;
  serviceProfile: ServiceProfileView;
  leads: QualifiedLeadView[];
  verifierThreshold: number;
};

type ListTone = {
  color: string;
  background: string;
  border: string;
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

function formatScore(score: number) {
  return `${Math.round(score * 100)}%`;
}

function formatDate(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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

function LeadFeedbackButtons({
  leadId,
  disabled,
  onFeedback,
}: {
  leadId: string;
  disabled: boolean;
  onFeedback: (leadId: string, value: LeadFeedbackValue) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FEEDBACK_OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onFeedback(leadId, option.value)}
          style={{
            borderColor: option.value === "good_lead" ? C.green : C.ruleDark,
            color: option.value === "good_lead" ? C.green : C.navySoft,
            backgroundColor: C.white,
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export default function ProspectDashboardClient({
  initialWebsiteUrl,
  serviceProfile,
  leads,
  verifierThreshold,
}: ProspectDashboardClientProps) {
  const router = useRouter();
  const [websiteUrl, setWebsiteUrl] = useState(
    initialWebsiteUrl ?? serviceProfile.websiteUrl ?? "",
  );
  const [profileFields, setProfileFields] = useState<ServiceProfileFields>(
    serviceProfile.fields,
  );
  const [websiteResult, setWebsiteResult] = useState<ProspectActionResult | null>(null);
  const [profileResult, setProfileResult] = useState<ProspectActionResult | null>(null);
  const [feedbackMessages, setFeedbackMessages] = useState<Record<string, string>>({});
  const [pendingFeedbackLeadId, setPendingFeedbackLeadId] = useState<string | null>(null);
  const [isWebsitePending, startWebsiteTransition] = useTransition();
  const [isProfilePending, startProfileTransition] = useTransition();
  const [isFeedbackPending, startFeedbackTransition] = useTransition();

  useEffect(() => {
    setProfileFields(serviceProfile.fields);
  }, [serviceProfile.id, serviceProfile.updatedAt, serviceProfile.fields]);

  useEffect(() => {
    setWebsiteUrl(initialWebsiteUrl ?? serviceProfile.websiteUrl ?? "");
  }, [initialWebsiteUrl, serviceProfile.websiteUrl]);

  const profileStatus = useMemo(() => {
    if (!serviceProfile.hasProfile) return "Awaiting profile";
    if (serviceProfile.status === "approved") return "Approved";
    return "Review";
  }, [serviceProfile.hasProfile, serviceProfile.status]);

  const updateField = <Key extends keyof ServiceProfileFields>(
    key: Key,
    value: ServiceProfileFields[Key],
  ) => {
    setProfileFields((current) => ({ ...current, [key]: value }));
  };

  const handleWebsiteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    formData.set("website_url", websiteUrl);

    startWebsiteTransition(async () => {
      const result = await submitWebsiteForCrawl(formData);
      setWebsiteResult(result);

      if (result.ok) {
        router.refresh();
      }
    });
  };

  const persistProfile = (intent: "save" | "approve") => {
    startProfileTransition(async () => {
      const result = await saveServiceProfile(
        serviceProfile.id,
        serviceProfile.hasProfile,
        profileFields,
        intent,
      );
      setProfileResult(result);

      if (result.ok) {
        router.refresh();
      }
    });
  };

  const handleFeedback = (leadId: string, value: LeadFeedbackValue) => {
    setPendingFeedbackLeadId(leadId);
    startFeedbackTransition(async () => {
      const result = await submitLeadFeedback(leadId, value);
      setFeedbackMessages((current) => ({
        ...current,
        [leadId]: result.message,
      }));
      setPendingFeedbackLeadId(null);
    });
  };

  return (
    <div
      className="mx-auto flex w-full max-w-7xl flex-col gap-6"
      style={{ color: C.text }}
    >
      <div className="flex flex-col gap-2 border-b pb-5" style={{ borderColor: C.rule }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: C.navy }}>
              Prospect Intelligence
            </h1>
            <p className="mt-1 text-sm" style={{ color: C.muted }}>
              Qualified opportunities with the reason they surfaced.
            </p>
          </div>
          <Badge
            variant="outline"
            className="rounded-md px-3 py-1"
            style={{
              borderColor: C.ruleDark,
              backgroundColor: C.white,
              color: C.navySoft,
            }}
          >
            Verifier threshold {formatScore(verifierThreshold)}
          </Badge>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <Card className="rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
          <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
              <Globe2 className="size-4" style={{ color: C.blue }} />
              <CardTitle className="text-base" style={{ color: C.navy }}>
                Website Onboarding
              </CardTitle>
            </div>
            <CardDescription style={{ color: C.muted }}>
              Submit the website used by the crawler and profile worker.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleWebsiteSubmit}>
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
                style={{
                  backgroundColor: C.navy,
                  color: C.white,
                }}
              >
                <Send className="size-4" />
                {isWebsitePending ? "Submitting..." : "Submit Website"}
              </Button>
              <ResultText result={websiteResult} />
            </form>
          </CardContent>
        </Card>

        <Card
          id="service-profile"
          className="rounded-lg shadow-sm"
          style={{ borderColor: C.rule }}
        >
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Target className="size-4" style={{ color: C.blue }} />
                <CardTitle className="text-base" style={{ color: C.navy }}>
                  Service Profile
                </CardTitle>
              </div>
              <Badge
                variant="outline"
                className="rounded-md"
                style={{
                  borderColor:
                    serviceProfile.status === "approved" ? C.green : C.ruleDark,
                  color:
                    serviceProfile.status === "approved" ? C.green : C.navySoft,
                  backgroundColor:
                    serviceProfile.status === "approved" ? C.greenPale : C.white,
                }}
              >
                {profileStatus}
              </Badge>
            </div>
            <CardDescription style={{ color: C.muted }}>
              Review the profile the matcher uses before surfacing leads.
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
                  style={{
                    backgroundColor: C.green,
                    color: C.white,
                  }}
                >
                  <CheckCircle2 className="size-4" />
                  Approve Profile
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="leads" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: C.navy }}>
              Qualified Leads
            </h2>
            <p className="mt-1 text-sm" style={{ color: C.muted }}>
              {leads.length} lead{leads.length === 1 ? "" : "s"} passed the verifier.
            </p>
          </div>
          <Badge
            variant="outline"
            className="rounded-md"
            style={{
              borderColor: C.green,
              backgroundColor: C.greenPale,
              color: C.green,
            }}
          >
            <ShieldCheck className="size-3" />
            Qualified only
          </Badge>
        </div>

        {leads.length === 0 ? (
          <div
            className="rounded-lg border p-8 text-center"
            style={{ borderColor: C.rule, backgroundColor: C.white }}
          >
            <Sparkles className="mx-auto size-5" style={{ color: C.blue }} />
            <h3 className="mt-3 text-sm font-semibold" style={{ color: C.navy }}>
              No qualified leads yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: C.muted }}>
              New matches will appear after the crawler, embeddings, matcher, and
              verifier produce qualified records for this workspace.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {leads.map((lead) => {
              const matchedAt = formatDate(lead.matchedAt);
              const postedAt = formatDate(lead.sourcePost.publishedAt);
              const feedbackPending =
                isFeedbackPending && pendingFeedbackLeadId === lead.id;

              return (
                <Card
                  key={lead.id}
                  className="rounded-lg shadow-sm"
                  style={{ borderColor: C.rule }}
                >
                  <CardHeader className="gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="rounded-md"
                            style={{
                              borderColor: C.green,
                              backgroundColor: C.greenPale,
                              color: C.green,
                            }}
                          >
                            {formatScore(lead.verifierScore)}
                          </Badge>
                          {lead.similarityScore !== null ? (
                            <Badge
                              variant="outline"
                              className="rounded-md"
                              style={{
                                borderColor: C.ruleDark,
                                backgroundColor: C.white,
                                color: C.navySoft,
                              }}
                            >
                              Semantic {formatScore(lead.similarityScore)}
                            </Badge>
                          ) : null}
                          <span className="text-xs" style={{ color: C.muted }}>
                            {lead.sourcePost.source}
                            {lead.sourcePost.community
                              ? ` / ${lead.sourcePost.community}`
                              : ""}
                            {matchedAt ? ` / matched ${matchedAt}` : ""}
                          </span>
                        </div>
                        <CardTitle
                          className="break-words text-base leading-snug"
                          style={{ color: C.navy }}
                        >
                          {lead.sourcePost.title}
                        </CardTitle>
                      </div>
                      {lead.sourcePost.url ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          style={{
                            borderColor: C.ruleDark,
                            backgroundColor: C.white,
                            color: C.blue,
                          }}
                        >
                          <a
                            href={lead.sourcePost.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="size-4" />
                            Open
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div
                        className="rounded-md border p-3"
                        style={{
                          borderColor: C.amber,
                          backgroundColor: C.amberPale,
                        }}
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase">
                          <MessageSquareText className="size-3.5" />
                          <span style={{ color: C.amber }}>Pain Detected</span>
                        </div>
                        <p className="text-sm leading-6" style={{ color: C.navy }}>
                          {lead.painDetected}
                        </p>
                      </div>
                      <div
                        className="rounded-md border p-3"
                        style={{
                          borderColor: C.blueLight,
                          backgroundColor: C.blueTint,
                        }}
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase">
                          <Target className="size-3.5" />
                          <span style={{ color: C.blue }}>Match Reason</span>
                        </div>
                        <p className="text-sm leading-6" style={{ color: C.navy }}>
                          {lead.matchReason}
                        </p>
                      </div>
                    </div>

                    <div
                      className="rounded-md border p-3"
                      style={{ borderColor: C.rule, backgroundColor: C.offWhite }}
                    >
                      <div
                        className="mb-2 flex flex-wrap gap-2 text-xs"
                        style={{ color: C.muted }}
                      >
                        {lead.sourcePost.author ? (
                          <span>Author {lead.sourcePost.author}</span>
                        ) : null}
                        {postedAt ? <span>Posted {postedAt}</span> : null}
                      </div>
                      <p
                        className={cn(
                          "whitespace-pre-wrap break-words text-sm leading-6",
                          "max-h-56 overflow-auto",
                        )}
                        style={{ color: C.navySoft }}
                      >
                        {lead.sourcePost.text}
                      </p>
                    </div>

                    <div
                      className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
                      style={{ borderColor: C.rule }}
                    >
                      <LeadFeedbackButtons
                        leadId={lead.id}
                        disabled={feedbackPending}
                        onFeedback={handleFeedback}
                      />
                      {feedbackMessages[lead.id] ? (
                        <span className="text-xs font-medium" style={{ color: C.green }}>
                          {feedbackMessages[lead.id]}
                        </span>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
