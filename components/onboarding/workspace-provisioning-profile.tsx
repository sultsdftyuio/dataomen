"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { C } from "@/lib/tokens";
import type {
  ProspectActionResult,
  ServiceProfileFields,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { ResultText } from "./workspace-provisioning-states";

export type ListTone = {
  color: string;
  background: string;
  border: string;
};

export const EMPTY_FIELDS: ServiceProfileFields = {
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

type UpdateField = <Key extends keyof ServiceProfileFields>(
  key: Key,
  value: ServiceProfileFields[Key],
) => void;

type ProfileReviewStateProps = {
  effectiveWebsiteUrl: string;
  isProfilePending: boolean;
  profileFields: ServiceProfileFields;
  profileResult: ProspectActionResult | null;
  reviewJson: unknown;
  persistProfile: (intent: "save" | "approve") => void;
  updateField: UpdateField;
};

export function ProfileReviewState({
  effectiveWebsiteUrl,
  isProfilePending,
  profileFields,
  profileResult,
  reviewJson,
  persistProfile,
  updateField,
}: ProfileReviewStateProps) {
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
