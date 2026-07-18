"use client";

import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { CircleDotDashed, Loader2, Plus, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_FIELDS,
  type ProfilePersistIntent,
} from "@/components/onboarding/workspace-provisioning-profile";
import { ResultText } from "@/components/onboarding/workspace-provisioning-states";
import type {
  ProspectActionResult,
  ServiceProfileFields,
  ServiceProfileView,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { C } from "@/lib/tokens";

const MAX_SIGNAL_LENGTH = 100;
const MAX_TEXT_LENGTH = 1_000;

type SignalFieldKey =
  | "target_audience"
  | "use_cases"
  | "pain_points"
  | "buying_triggers"
  | "negative_keywords"
  | "excluded_audiences";

type TextFieldKey = "core_problem" | "unique_value_prop";

type ServiceProfileSettingsProps = {
  serviceProfile: ServiceProfileView;
  websiteUrl: string;
  onFieldsChange?: (fields: ServiceProfileFields) => void;
};

type SettingsProfileResponse = {
  error?: string;
  message?: string;
};

type UpdateField = <Key extends keyof ServiceProfileFields>(
  key: Key,
  value: ServiceProfileFields[Key],
) => void;

const SIGNAL_FIELDS: Array<{
  key: SignalFieldKey;
  label: string;
  description: string;
  placeholder: string;
}> = [
  {
    key: "target_audience",
    label: "Target audience",
    description: "Roles, teams, and company types most likely to buy.",
    placeholder: "RevOps leaders, B2B SaaS founders",
  },
  {
    key: "use_cases",
    label: "Primary use cases",
    description: "Outcomes buyers are actively trying to achieve.",
    placeholder: "Find qualified prospects",
  },
  {
    key: "pain_points",
    label: "Pain points",
    description: "Specific frustrations prospects mention before searching.",
    placeholder: "Manual lead research takes too long",
  },
  {
    key: "buying_triggers",
    label: "Buying triggers",
    description: "Events that make the problem urgent enough to act on.",
    placeholder: "New growth target, tool evaluation",
  },
  {
    key: "negative_keywords",
    label: "Negative keywords",
    description: "Terms that usually indicate weak or irrelevant intent.",
    placeholder: "student, free template",
  },
  {
    key: "excluded_audiences",
    label: "Excluded audiences",
    description: "People or companies the discovery engine should ignore.",
    placeholder: "Agencies, job seekers",
  },
];

const TEXT_FIELDS: Array<{
  key: TextFieldKey;
  label: string;
  description: string;
  placeholder: string;
}> = [
  {
    key: "core_problem",
    label: "Core problem",
    description: "The painful situation that creates urgency.",
    placeholder:
      "Example: Teams spend hours scanning noisy sources before they can tell which prospects are worth reviewing.",
  },
  {
    key: "unique_value_prop",
    label: "Unique value proposition",
    description: "Why your approach is meaningfully different.",
    placeholder:
      "Example: Arcli turns public buying signals into verified prospect matches with explainable fit reasons.",
  },
];

function normalizeSignal(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_SIGNAL_LENGTH);
}

function normalizeSignals(values: readonly string[]) {
  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  for (const value of values) {
    const normalized = normalizeSignal(value);
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) continue;

    seen.add(key);
    normalizedValues.push(normalized);
  }

  return normalizedValues;
}

function signalDraftItems(value: string) {
  return value
    .split(/[\n,;]+/)
    .map(normalizeSignal)
    .filter(Boolean);
}

async function readSettingsProfileResult(
  response: Response,
): Promise<ProspectActionResult> {
  const payload = (await response
    .json()
    .catch(() => ({}))) as SettingsProfileResponse;

  if (!response.ok) {
    return {
      ok: false,
      message:
        payload.error ??
        "Could not update the service profile. Check the fields and try again.",
    };
  }

  return {
    ok: true,
    message:
      payload.message ?? "Service profile saved. Matching embeddings are regenerating.",
  };
}

function SignalField({
  label,
  description,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: string[];
  placeholder: string;
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const signals = useMemo(() => normalizeSignals(value), [value]);
  const canAdd = normalizeSignal(draft).length > 0;

  const commitDraft = () => {
    const draftItems = signalDraftItems(draft);
    if (draftItems.length === 0) return;

    onChange(normalizeSignals([...signals, ...draftItems]));
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    commitDraft();
  };

  const removeSignal = (signal: string) => {
    onChange(
      signals.filter(
        (item) => item.toLowerCase() !== signal.toLowerCase(),
      ),
    );
  };

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label className="text-sm font-semibold" style={{ color: C.navy }}>
            {label}
          </label>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            {description}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
          {signals.length}
        </span>
      </div>

      {signals.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {signals.map((signal) => (
            <span
              key={signal.toLowerCase()}
              className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs font-medium"
              style={{ color: C.navy }}
            >
              <span className="truncate">{signal}</span>
              <button
                type="button"
                aria-label={`Remove ${signal}`}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-black/5"
                disabled={disabled}
                onClick={() => removeSignal(signal)}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex min-w-0 gap-2">
        <input
          value={draft}
          maxLength={MAX_SIGNAL_LENGTH * 4}
          placeholder={placeholder}
          disabled={disabled}
          className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (!/[\n,;]/.test(text)) return;

            event.preventDefault();
            const pastedItems = signalDraftItems(text);
            if (pastedItems.length === 0) return;

            onChange(normalizeSignals([...signals, ...pastedItems]));
            setDraft("");
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !canAdd}
          className="h-9 shrink-0 rounded-md"
          onClick={commitDraft}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add
        </Button>
      </div>
    </div>
  );
}

function TextProfileField({
  label,
  description,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label className="text-sm font-semibold" style={{ color: C.navy }}>
            {label}
          </label>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            {description}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {value.length}/{MAX_TEXT_LENGTH}
        </span>
      </div>
      <Textarea
        maxLength={MAX_TEXT_LENGTH}
        rows={3}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-3 min-h-24 resize-y rounded-md text-sm leading-6 disabled:opacity-60"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function ServiceProfileSettings({
  serviceProfile,
  websiteUrl,
  onFieldsChange,
}: ServiceProfileSettingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [profileFields, setProfileFields] = useState<ServiceProfileFields>(
    serviceProfile.fields ?? EMPTY_FIELDS,
  );
  const [profileResult, setProfileResult] =
    useState<ProspectActionResult | null>(null);

  useEffect(() => {
    setProfileFields(serviceProfile.fields ?? EMPTY_FIELDS);
  }, [serviceProfile.id, serviceProfile.updatedAt, serviceProfile.fields]);

  useEffect(() => {
    onFieldsChange?.(profileFields);
  }, [onFieldsChange, profileFields]);

  const hasProfileContent = useMemo(
    () =>
      Object.values(profileFields).some((value) =>
        Array.isArray(value)
          ? value.length > 0
          : value.trim().length > 0,
      ),
    [profileFields],
  );

  const updateField: UpdateField = (key, value) => {
    setProfileFields((current) => ({ ...current, [key]: value }));
  };

  const persistProfile = (_intent: ProfilePersistIntent) => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/workspace", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceProfileId: serviceProfile.id,
            serviceProfile: profileFields,
          }),
        });

        const result = await readSettingsProfileResult(response);
        setProfileResult(result);

        if (result.ok) {
          router.refresh();
        }
      } catch {
        setProfileResult({
          ok: false,
          message: "Could not reach the workspace settings API.",
        });
      }
    });
  };

  if (!serviceProfile.hasProfile) {
    return (
      <section
        className="rounded-lg border bg-white p-5 shadow-sm"
        style={{ borderColor: C.rule }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: C.bluePale, color: C.blue }}
          >
            <CircleDotDashed className="size-4 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: C.navy }}>
              Service profile extraction is in progress
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
              The editable matching brief will appear here after the crawl
              extracts the first profile for this workspace.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const statusLabel =
    serviceProfile.embeddingStatus === "completed" ? "Active" : "Regenerating";

  return (
    <div className="space-y-5">
      <div
        className="flex flex-col gap-3 rounded-lg border px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: C.rule, backgroundColor: C.offWhite }}
      >
        <div className="min-w-0">
          <span className="font-semibold" style={{ color: C.navy }}>
            Source:
          </span>{" "}
          <span className="break-all" style={{ color: C.muted }}>
            {serviceProfile.websiteUrl ?? websiteUrl}
          </span>
        </div>
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 font-semibold"
          style={{
            borderColor: C.blueLight,
            backgroundColor: C.bluePale,
            color: C.blue,
          }}
        >
          <CircleDotDashed className="size-3.5" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      {!hasProfileContent ? (
        <div
          className="rounded-lg border px-4 py-3 text-sm leading-6"
          style={{
            borderColor: C.blueLight,
            backgroundColor: C.bluePale,
            color: C.navySoft,
          }}
        >
          No matching signals have been extracted yet. You can add the brief
          manually here, or wait for regeneration to finish and refresh the
          workspace.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {SIGNAL_FIELDS.slice(0, 2).map((field) => (
          <SignalField
            key={field.key}
            label={field.label}
            description={field.description}
            value={profileFields[field.key]}
            placeholder={field.placeholder}
            disabled={isPending}
            onChange={(value) => updateField(field.key, value)}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {TEXT_FIELDS.map((field) => (
          <TextProfileField
            key={field.key}
            label={field.label}
            description={field.description}
            value={profileFields[field.key]}
            placeholder={field.placeholder}
            disabled={isPending}
            onChange={(value) => updateField(field.key, value)}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SIGNAL_FIELDS.slice(2).map((field) => (
          <SignalField
            key={field.key}
            label={field.label}
            description={field.description}
            value={profileFields[field.key]}
            placeholder={field.placeholder}
            disabled={isPending}
            onChange={(value) => updateField(field.key, value)}
          />
        ))}
      </div>

      <div
        className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: C.rule }}
      >
        <div className="min-w-0" aria-live="polite">
          <ResultText result={profileResult} />
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            Saving updates the workspace profile and regenerates matching
            embeddings in the background.
          </p>
        </div>

        <Button
          type="button"
          disabled={isPending}
          className="h-9 shrink-0 rounded-md"
          onClick={() => persistProfile("save")}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {isPending ? "Saving..." : "Save & regenerate"}
        </Button>
      </div>
    </div>
  );
}
