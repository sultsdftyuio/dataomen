"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Globe2,
  Plus,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { z } from "zod";

import { C } from "@/lib/tokens";

const PROGRESS_PHASES = [
  "Initializing Firecrawl...",
  "Scraping landing pages...",
  "LLM analyzing target audience...",
  "Extracting pain points...",
] as const;

const tagSchema = z.string().trim().min(2);

const brainProfileSchema = z.object({
  company_name: z.string().trim().min(1),
  one_liner: z.string().trim().min(1),
  target_audience: z.array(tagSchema).default([]),
  core_problem_solved: z.string().trim().min(1),
  key_value_propositions: z.array(tagSchema).default([]),
  ideal_customer_pain_points: z.array(tagSchema).default([]),
  negative_keywords: z.array(tagSchema).default([]),
});

export type WorkspaceBrainProfile = z.infer<typeof brainProfileSchema>;

type WorkspaceBrainGeneratorProps = {
  companyName: string;
  websiteUrl: string;
  isPending: boolean;
  onWebsiteUrlChange: (value: string) => void;
  onApplyProfile: (profile: WorkspaceBrainProfile) => void;
  onSaveAndActivate: (profile: WorkspaceBrainProfile) => void;
};

type GeneratorStatus = "idle" | "processing" | "review";

type TagListEditorProps = {
  label: string;
  value: string[];
  color: string;
  background: string;
  borderColor: string;
  placeholder: string;
  onChange: (value: string[]) => void;
};

function normalizeTags(tags: string[]) {
  const seen = new Set<string>();

  return tags.reduce<string[]>((acc, tag) => {
    const normalized = tag.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();

    if (normalized.length > 0 && !seen.has(key)) {
      seen.add(key);
      acc.push(normalized);
    }

    return acc;
  }, []);
}

function parseGeneratedProfile(payload: unknown) {
  const maybeProfile =
    payload && typeof payload === "object" && "profile" in payload
      ? (payload as { profile?: unknown }).profile
      : payload && typeof payload === "object" && "data" in payload
        ? (payload as { data?: unknown }).data
        : payload;

  return brainProfileSchema.parse(maybeProfile);
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function payloadMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;

  const message =
    "message" in payload
      ? (payload as { message?: unknown }).message
      : "error" in payload
        ? (payload as { error?: unknown }).error
        : null;

  return typeof message === "string" ? message : null;
}

function TagListEditor({
  label,
  value,
  color,
  background,
  borderColor,
  placeholder,
  onChange,
}: TagListEditorProps) {
  const [draft, setDraft] = useState("");

  const commitDraft = () => {
    if (!draft.trim()) {
      setDraft("");
      return;
    }

    onChange(normalizeTags([...value, draft]));
    setDraft("");
  };

  const updateTag = (index: number, nextValue: string) => {
    const nextTags = [...value];
    nextTags[index] = nextValue;
    onChange(nextTags);
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>
        {label}
      </label>
      <div
        style={{
          minHeight: 72,
          borderRadius: 6,
          border: `1px solid ${C.rule}`,
          background: C.white,
          padding: 8,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 6,
          boxShadow:
            "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)",
        }}
      >
        {value.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            style={{
              minHeight: 28,
              maxWidth: "100%",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              borderRadius: 6,
              border: `1px solid ${borderColor}`,
              background,
              color,
              padding: "2px 5px 2px 8px",
            }}
          >
            <input
              aria-label={`Edit ${label} tag ${index + 1}`}
              value={tag}
              onBlur={() => onChange(normalizeTags(value))}
              onChange={(event) => updateTag(index, event.target.value)}
              style={{
                width: `${Math.max(8, Math.min(28, tag.length + 2))}ch`,
                minWidth: 70,
                maxWidth: 220,
                border: 0,
                outline: "none",
                background: "transparent",
                color: "inherit",
                fontSize: 11,
                fontWeight: 700,
              }}
            />
            <button
              aria-label={`Remove ${tag}`}
              type="button"
              onClick={() => removeTag(index)}
              style={{
                width: 20,
                height: 20,
                border: 0,
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.75,
              }}
            >
              <X size={12} />
            </button>
          </span>
        ))}

        <div
          style={{
            minHeight: 28,
            minWidth: 180,
            flex: "1 1 180px",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: C.muted,
          }}
        >
          <Plus size={13} />
          <input
            aria-label={placeholder}
            value={draft}
            placeholder={placeholder}
            onBlur={commitDraft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commitDraft();
              }
            }}
            style={{
              width: "100%",
              minWidth: 0,
              border: 0,
              outline: "none",
              background: "transparent",
              color: C.navy,
              fontSize: 12,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceBrainGenerator({
  companyName,
  websiteUrl,
  isPending,
  onWebsiteUrlChange,
  onApplyProfile,
  onSaveAndActivate,
}: WorkspaceBrainGeneratorProps) {
  const [status, setStatus] = useState<GeneratorStatus>("idle");
  const [progressTick, setProgressTick] = useState(0);
  const [profile, setProfile] = useState<WorkspaceBrainProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow =
    "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  const normalizedWebsiteUrl = websiteUrl.trim();
  const activePhase = PROGRESS_PHASES[progressTick % PROGRESS_PHASES.length];
  const progressValue = Math.min(94, 18 + progressTick * 10);
  const canGenerate = normalizedWebsiteUrl.length > 0 && !isPending;

  useEffect(() => {
    if (status !== "processing") return;

    const intervalId = window.setInterval(() => {
      setProgressTick((current) => current + 1);
    }, 1300);

    return () => window.clearInterval(intervalId);
  }, [status]);

  const previewTitle = useMemo(() => {
    if (profile?.company_name) return profile.company_name;
    if (companyName) return companyName;
    return "Workspace Intelligence";
  }, [companyName, profile?.company_name]);

  const updateProfile = (nextProfile: WorkspaceBrainProfile) => {
    setProfile(nextProfile);
    setError(null);
  };

  const updateArrayField = (
    field: keyof Pick<
      WorkspaceBrainProfile,
      | "target_audience"
      | "key_value_propositions"
      | "ideal_customer_pain_points"
      | "negative_keywords"
    >,
    value: string[],
  ) => {
    if (!profile) return;

    updateProfile({
      ...profile,
      [field]: normalizeTags(value),
    });
  };

  const generateBrain = async () => {
    setError(null);

    if (!normalizedWebsiteUrl) {
      setError("Add your company website URL before generating the Arcli Brain.");
      return;
    }

    try {
      new URL(normalizedWebsiteUrl);
    } catch {
      setError("Enter a valid website URL, including https://.");
      return;
    }

    setStatus("processing");
    setProgressTick(0);

    try {
      const response = await fetch("/api/settings/workspace/brain/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: normalizedWebsiteUrl,
          websiteUrl: normalizedWebsiteUrl,
        }),
      });
      const payload = await readResponsePayload(response);

      if (!response.ok) {
        throw new Error(
          payloadMessage(payload) || "Arcli could not generate a workspace brain.",
        );
      }

      const generatedProfile = parseGeneratedProfile(payload);
      updateProfile(generatedProfile);
      setStatus("review");
    } catch (caughtError) {
      setStatus("idle");
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Arcli could not generate a workspace brain.",
      );
    }
  };

  return (
    <section
      style={{
        background: C.white,
        borderRadius: 8,
        border: surfaceBorder,
        boxShadow: surfaceShadow,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderBottom: `1px solid ${C.rule}`,
          paddingBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Brain size={16} color={C.blue} />
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: C.navySoft,
              margin: 0,
            }}
          >
            Arcli Brain
          </h2>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: status === "review" ? C.green : C.blue,
            background: status === "review" ? C.greenPale : C.bluePale,
            border: `1px solid ${
              status === "review" ? "rgba(16,185,129,0.2)" : "rgba(27,110,191,0.2)"
            }`,
            borderRadius: 999,
            padding: "3px 8px",
            whiteSpace: "nowrap",
          }}
        >
          {status === "review" ? "Ready to activate" : "Workspace-aware"}
        </span>
      </div>

      {status === "processing" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: C.bluePale,
                color: C.blue,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={16} className="animate-pulse" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>
                Building from {normalizedWebsiteUrl}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {activePhase}
              </div>
            </div>
          </div>

          <div
            aria-hidden
            style={{
              height: 8,
              borderRadius: 999,
              background: C.offWhite,
              overflow: "hidden",
              border: `1px solid ${C.rule}`,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressValue}%`,
                borderRadius: 999,
                background: C.blue,
                transition: "width 0.25s ease",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {PROGRESS_PHASES.map((phase, index) => {
              const isActive = phase === activePhase;
              const hasPassed = progressTick > index;

              return (
                <div
                  key={phase}
                  style={{
                    minHeight: 52,
                    borderRadius: 6,
                    border: `1px solid ${
                      isActive ? "rgba(27,110,191,0.3)" : C.rule
                    }`,
                    background: isActive ? C.bluePale : C.offWhite,
                    padding: 8,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 7,
                  }}
                >
                  {hasPassed ? (
                    <CheckCircle2 size={13} color={C.green} style={{ marginTop: 1 }} />
                  ) : (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: isActive ? C.blue : C.faint,
                        marginTop: 4,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span style={{ fontSize: 11, lineHeight: 1.35, color: C.navySoft }}>
                    {phase}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>
              Company Website URL
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0 }}>
                <Globe2
                  size={14}
                  color={C.muted}
                  style={{ position: "absolute", left: 10, top: 9 }}
                />
                <input
                  type="url"
                  placeholder="https://..."
                  value={websiteUrl}
                  disabled={isPending}
                  onChange={(event) => onWebsiteUrlChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      generateBrain();
                    }
                  }}
                  style={{
                    width: "100%",
                    height: 32,
                    padding: "0 12px 0 32px",
                    borderRadius: 6,
                    border: surfaceBorder,
                    background: C.white,
                    fontSize: 13,
                    color: C.navy,
                    outline: "none",
                    boxShadow: surfaceShadow,
                    opacity: isPending ? 0.6 : 1,
                  }}
                />
              </div>
              <button
                type="button"
                disabled={!canGenerate}
                onClick={generateBrain}
                style={{
                  height: 32,
                  padding: "0 12px",
                  border: 0,
                  borderRadius: 6,
                  background: canGenerate ? C.navy : C.offWhite,
                  color: canGenerate ? C.white : C.faint,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: canGenerate ? "pointer" : "not-allowed",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                  boxShadow: canGenerate ? surfaceShadow : "none",
                }}
              >
                <WandSparkles size={13} />
                Generate Arcli Brain
              </button>
            </div>
          </div>

          {error ? (
            <div
              style={{
                borderRadius: 6,
                border: "1px solid rgba(239,68,68,0.25)",
                background: C.redPale,
                color: "#B91C1C",
                padding: "8px 10px",
                fontSize: 11,
                lineHeight: 1.45,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          ) : null}

          {profile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  borderRadius: 8,
                  border: `1px solid rgba(27, 110, 191, 0.2)`,
                  background: C.blueTint,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 10, color: C.blue, fontWeight: 800 }}>
                  GENERATED WORKSPACE POSITIONING
                </div>
                <input
                  aria-label="Generated company name"
                  value={profile.company_name}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  onChange={(event) =>
                    updateProfile({ ...profile, company_name: event.target.value })
                  }
                  style={{
                    border: 0,
                    outline: "none",
                    background: "transparent",
                    color: C.navy,
                    fontSize: 18,
                    fontWeight: 700,
                    padding: 0,
                  }}
                />
                <textarea
                  aria-label="Generated one-liner"
                  value={profile.one_liner}
                  onChange={(event) =>
                    updateProfile({ ...profile, one_liner: event.target.value })
                  }
                  style={{
                    width: "100%",
                    minHeight: 48,
                    border: 0,
                    outline: "none",
                    resize: "vertical",
                    background: "transparent",
                    color: C.navySoft,
                    fontSize: 12,
                    lineHeight: 1.5,
                    padding: 0,
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <TagListEditor
                  label="Target audience"
                  value={profile.target_audience}
                  color={C.blue}
                  background={C.bluePale}
                  borderColor="rgba(27,110,191,0.25)"
                  placeholder="Add audience"
                  onChange={(value) => updateArrayField("target_audience", value)}
                />
                <TagListEditor
                  label="Value propositions"
                  value={profile.key_value_propositions}
                  color={C.green}
                  background={C.greenPale}
                  borderColor="rgba(16,185,129,0.25)"
                  placeholder="Add value prop"
                  onChange={(value) =>
                    updateArrayField("key_value_propositions", value)
                  }
                />
                <TagListEditor
                  label="Customer pain points"
                  value={profile.ideal_customer_pain_points}
                  color="#B45309"
                  background={C.amberPale}
                  borderColor="rgba(245,158,11,0.28)"
                  placeholder="Add pain point"
                  onChange={(value) =>
                    updateArrayField("ideal_customer_pain_points", value)
                  }
                />
                <TagListEditor
                  label="Negative keywords"
                  value={profile.negative_keywords}
                  color="#B91C1C"
                  background={C.redPale}
                  borderColor="rgba(239,68,68,0.25)"
                  placeholder="Add exclusion"
                  onChange={(value) => updateArrayField("negative_keywords", value)}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>
                  Core problem solved
                </label>
                <textarea
                  value={profile.core_problem_solved}
                  onChange={(event) =>
                    updateProfile({
                      ...profile,
                      core_problem_solved: event.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    minHeight: 68,
                    borderRadius: 6,
                    border: surfaceBorder,
                    background: C.white,
                    color: C.navy,
                    resize: "vertical",
                    outline: "none",
                    padding: 10,
                    fontSize: 12,
                    lineHeight: 1.5,
                    boxShadow: surfaceShadow,
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  borderTop: `1px solid ${C.rule}`,
                  paddingTop: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    minWidth: 220,
                    flex: "1 1 220px",
                  }}
                >
                  Applying uses the generated company name in Workspace Identity.
                  Save activation persists the workspace settings you can store today.
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onApplyProfile(profile)}
                    style={{
                      height: 30,
                      padding: "0 12px",
                      borderRadius: 6,
                      border: surfaceBorder,
                      background: C.white,
                      color: C.navy,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: isPending ? "not-allowed" : "pointer",
                    }}
                  >
                    Apply to Workspace
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onSaveAndActivate(profile)}
                    style={{
                      height: 30,
                      padding: "0 12px",
                      borderRadius: 6,
                      border: 0,
                      background: isPending ? C.offWhite : C.navy,
                      color: isPending ? C.faint : C.white,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: isPending ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: isPending ? "none" : surfaceShadow,
                    }}
                  >
                    <CheckCircle2 size={13} />
                    Save & Activate Profile
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                borderRadius: 8,
                border: `1px dashed ${C.ruleDark}`,
                background: C.offWhite,
                padding: 14,
                color: C.muted,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {previewTitle} will be enriched from your workspace website, then
              reviewed here before it updates the saved workspace identity.
            </div>
          )}
        </>
      )}
    </section>
  );
}
