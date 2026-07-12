"use client";

import {
  type ClipboardEvent,
  memo,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Braces,
  CheckCircle2,
  CircleDotDashed,
  Loader2,
  Plus,
  Save,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  ProspectActionResult,
  ServiceProfileFields,
} from "@/app/(dashboard)/dashboard/prospect-types";
import { C } from "@/lib/tokens";
import { ResultText } from "./workspace-provisioning-states";

const MAX_ITEM_LENGTH = 100;
const MAX_TEXT_LENGTH = 1_000;
const SURFACE_BORDER = "1px solid rgba(15, 23, 42, 0.08)";
const SURFACE_SHADOW = "0 1px 3px rgba(15, 23, 42, 0.08)";

export type ProfilePersistIntent = "save" | "approve";
type Tone = "blue" | "green" | "amber" | "red";

type ListTone = {
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

const LIST_TONES: Record<Tone, ListTone> = {
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

function normalizeItem(item: string): string {
  return item.trim().replace(/\s+/g, " ");
}

function normalizeKey(item: string): string {
  return normalizeItem(item).toLocaleLowerCase();
}

function normalizeItems(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalizedItems: string[] = [];

  for (const item of items) {
    const normalized = normalizeItem(item);
    const key = normalizeKey(normalized);

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedItems.push(normalized);
  }

  return normalizedItems;
}

function areStringArraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function formatReviewJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2) ?? "null";
  } catch {
    return JSON.stringify(
      {
        error: "The structured profile could not be displayed.",
      },
      null,
      2,
    );
  }
}

type ListEditorProps = {
  label: string;
  description: string;
  value: string[];
  placeholder: string;
  tone: ListTone;
  onChange: (value: string[]) => void;
};

/**
 * Controlled list editor.
 *
 * The parent array remains the single source of truth. Only the temporary
 * add/edit draft is local, which avoids duplicate list state, reconciliation
 * effects, and side effects inside React state updater functions.
 */
const ListEditor = memo(function ListEditor({
  label,
  description,
  value,
  placeholder,
  tone,
  onChange,
}: ListEditorProps) {
  const fieldId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [editingValue, setEditingValue] = useState<string | null>(null);

  const items = useMemo(() => normalizeItems(value), [value]);
  const isEditing = editingValue !== null;
  const normalizedDraft = normalizeItem(draft);
  const canCommit = normalizedDraft.length > 0;

  const resetDraft = useCallback(() => {
    setDraft("");
    setEditingValue(null);
  }, []);

  const focusDraftInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const beginEdit = useCallback(
    (item: string) => {
      setEditingValue(item);
      setDraft(item);
      focusDraftInput();
    },
    [focusDraftInput],
  );

  const commitDraft = useCallback(() => {
    const nextItem = normalizeItem(draft);

    if (!nextItem) {
      resetDraft();
      return;
    }

    let nextItems: string[];

    if (editingValue === null) {
      nextItems = normalizeItems([...items, nextItem]);
    } else {
      const editingIndex = items.findIndex(
        (item) => normalizeKey(item) === normalizeKey(editingValue),
      );

      if (editingIndex === -1) {
        nextItems = normalizeItems([...items, nextItem]);
      } else {
        nextItems = normalizeItems(
          items.map((item, index) =>
            index === editingIndex ? nextItem : item,
          ),
        );
      }
    }

    resetDraft();

    if (!areStringArraysEqual(items, nextItems)) {
      onChange(nextItems);
    }
  }, [draft, editingValue, items, onChange, resetDraft]);

  const removeItem = useCallback(
    (itemToRemove: string) => {
      const nextItems = items.filter(
        (item) => normalizeKey(item) !== normalizeKey(itemToRemove),
      );

      if (
        editingValue !== null &&
        normalizeKey(editingValue) === normalizeKey(itemToRemove)
      ) {
        resetDraft();
      }

      onChange(nextItems);
    },
    [editingValue, items, onChange, resetDraft],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      const pastedText = event.clipboardData.getData("text");

      if (!/[\n,;]/.test(pastedText)) {
        return;
      }

      event.preventDefault();

      const pastedItems = pastedText
        .split(/[\n,;]+/)
        .map(normalizeItem)
        .filter(Boolean);

      if (pastedItems.length === 0) {
        return;
      }

      const nextItems = normalizeItems([...items, ...pastedItems]);
      resetDraft();

      if (!areStringArraysEqual(items, nextItems)) {
        onChange(nextItems);
      }
    },
    [items, onChange, resetDraft],
  );

  return (
    <div
      role="group"
      aria-labelledby={`${fieldId}-label`}
      aria-describedby={`${fieldId}-description`}
      className="space-y-2.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label
            id={`${fieldId}-label`}
            htmlFor={`${fieldId}-input`}
            className="text-sm font-semibold"
            style={{ color: C.navy }}
          >
            {label}
          </Label>
          <p
            id={`${fieldId}-description`}
            className="mt-1 text-xs leading-5"
            style={{ color: C.muted }}
          >
            {description}
          </p>
        </div>

        <span
          className="shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold tracking-[0.08em]"
          style={{
            borderColor: C.rule,
            backgroundColor: C.offWhite,
            color: C.muted,
          }}
        >
          {items.length} {items.length === 1 ? "SIGNAL" : "SIGNALS"}
        </span>
      </div>

      <div
        className="rounded-lg border p-2.5 transition-shadow focus-within:ring-2 focus-within:ring-slate-300 focus-within:ring-offset-2"
        style={{
          minHeight: 116,
          borderColor: C.rule,
          backgroundColor: C.white,
          boxShadow: SURFACE_SHADOW,
        }}
      >
        <div className="flex flex-wrap gap-2">
          {items.map((item) => {
            const isActive =
              editingValue !== null &&
              normalizeKey(editingValue) === normalizeKey(item);

            return (
              <span
                key={normalizeKey(item)}
                className="inline-flex min-h-8 max-w-full items-center rounded-md border text-xs font-semibold"
                style={{
                  borderColor: isActive ? tone.color : tone.border,
                  backgroundColor: tone.background,
                  color: tone.color,
                  boxShadow: isActive
                    ? `0 0 0 2px ${tone.background}`
                    : "none",
                }}
              >
                <button
                  type="button"
                  aria-label={`Edit ${item}`}
                  aria-pressed={isActive}
                  className="min-w-0 max-w-full truncate px-2.5 py-1.5 text-left outline-none"
                  onClick={() => beginEdit(item)}
                >
                  {item}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-current"
                  onClick={() => removeItem(item)}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            );
          })}
        </div>

        <div
          className="mt-2.5 flex min-h-10 items-center gap-2 rounded-md border px-2.5"
          style={{
            borderColor: isEditing ? tone.border : C.rule,
            backgroundColor: C.offWhite,
          }}
        >
          {isEditing ? (
            <CircleDotDashed
              className="size-3.5 shrink-0"
              style={{ color: tone.color }}
              aria-hidden="true"
            />
          ) : (
            <Plus
              className="size-3.5 shrink-0"
              style={{ color: C.muted }}
              aria-hidden="true"
            />
          )}

          <input
            ref={inputRef}
            id={`${fieldId}-input`}
            value={draft}
            maxLength={MAX_ITEM_LENGTH}
            placeholder={
              isEditing ? `Update “${editingValue}”` : placeholder
            }
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            style={{ color: C.navy }}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commitDraft();
                return;
              }

              if (event.key === "Escape") {
                event.preventDefault();
                resetDraft();
                event.currentTarget.blur();
              }
            }}
          />

          {isEditing && (
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-md px-2 text-xs font-semibold outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-slate-400"
              style={{ color: C.muted }}
              onClick={resetDraft}
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            disabled={!canCommit}
            className="inline-flex h-7 items-center rounded-md px-2 text-xs font-semibold text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: tone.color }}
            onClick={commitDraft}
          >
            {isEditing ? "Update" : "Add"}
          </button>
        </div>

        <p className="mt-2 text-[11px]" style={{ color: C.faint }}>
          Select a signal to edit it. Press Enter or paste a comma-separated
          list to add multiple signals.
        </p>
      </div>
    </div>
  );
});

type ProfileTextAreaProps = {
  id: string;
  label: string;
  description: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

const ProfileTextArea = memo(function ProfileTextArea({
  id,
  label,
  description,
  value,
  placeholder,
  onChange,
}: ProfileTextAreaProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label
            htmlFor={id}
            className="text-sm font-semibold"
            style={{ color: C.navy }}
          >
            {label}
          </Label>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            {description}
          </p>
        </div>
        <span className="shrink-0 text-[11px]" style={{ color: C.faint }}>
          {value.length}/{MAX_TEXT_LENGTH}
        </span>
      </div>

      <Textarea
        id={id}
        maxLength={MAX_TEXT_LENGTH}
        value={value}
        placeholder={placeholder}
        aria-describedby={`${id}-description`}
        className="min-h-32 resize-y rounded-lg text-sm leading-6 shadow-sm focus-visible:ring-slate-300"
        style={{
          borderColor: C.rule,
          backgroundColor: C.white,
          color: C.navy,
          boxShadow: SURFACE_SHADOW,
        }}
        onChange={(event) => onChange(event.target.value)}
      />
      <span id={`${id}-description`} className="sr-only">
        Maximum {MAX_TEXT_LENGTH} characters.
      </span>
    </div>
  );
});

type UpdateField = <Key extends keyof ServiceProfileFields>(
  key: Key,
  value: ServiceProfileFields[Key],
) => void;

export type ProfileReviewStateProps = {
  effectiveWebsiteUrl: string;
  isProfilePending: boolean;
  /**
   * Optional, but recommended when the parent already tracks which operation
   * is running. It lets the correct button show progress independently.
   */
  pendingIntent?: ProfilePersistIntent | null;
  profileFields: ServiceProfileFields;
  profileResult: ProspectActionResult | null;
  /** Pass only tenant-safe, user-displayable structured data. */
  reviewJson: unknown;
  persistProfile: (
    intent: ProfilePersistIntent,
  ) => void | Promise<void>;
  updateField: UpdateField;
  embedded?: boolean;
  showApproveAction?: boolean;
  eyebrow?: string;
  title?: string;
  description?: string;
  statusLabel?: string;
  saveLabel?: string;
  savingLabel?: string;
  saveHelpText?: string;
};

export function ProfileReviewState({
  effectiveWebsiteUrl,
  isProfilePending,
  pendingIntent,
  profileFields,
  profileResult,
  reviewJson,
  persistProfile,
  updateField,
  embedded = false,
  showApproveAction = true,
  eyebrow = "SERVICE PROFILE INTELLIGENCE",
  title = "Teach Arcli exactly who your product helps.",
  description = "Refine the language before activation. These signals become the source of truth for matching qualified conversations and filtering noisy prospects.",
  statusLabel = "Awaiting approval",
  saveLabel = "Save refinements",
  savingLabel = "Saving...",
  saveHelpText = "Save keeps this profile in review. Approval activates discovery using the rules above.",
}: ProfileReviewStateProps) {
  const [requestedIntent, setRequestedIntent] =
    useState<ProfilePersistIntent | null>(null);

  const updateTargetAudience = useCallback(
    (nextValue: string[]) => updateField("target_audience", nextValue),
    [updateField],
  );
  const updateUseCases = useCallback(
    (nextValue: string[]) => updateField("use_cases", nextValue),
    [updateField],
  );
  const updatePainPoints = useCallback(
    (nextValue: string[]) => updateField("pain_points", nextValue),
    [updateField],
  );
  const updateBuyingTriggers = useCallback(
    (nextValue: string[]) => updateField("buying_triggers", nextValue),
    [updateField],
  );
  const updateNegativeKeywords = useCallback(
    (nextValue: string[]) => updateField("negative_keywords", nextValue),
    [updateField],
  );
  const updateExcludedAudiences = useCallback(
    (nextValue: string[]) => updateField("excluded_audiences", nextValue),
    [updateField],
  );
  const updateCoreProblem = useCallback(
    (nextValue: string) => updateField("core_problem", nextValue),
    [updateField],
  );
  const updateUniqueValueProp = useCallback(
    (nextValue: string) => updateField("unique_value_prop", nextValue),
    [updateField],
  );

  const formattedJson = useMemo(
    () => formatReviewJson(reviewJson),
    [reviewJson],
  );

  const activePendingIntent = pendingIntent ?? requestedIntent;
  const isSaving = isProfilePending && activePendingIntent === "save";
  const isApproving = isProfilePending && activePendingIntent === "approve";

  const handlePersist = useCallback(
    (intent: ProfilePersistIntent) => {
      setRequestedIntent(intent);

      try {
        const result = persistProfile(intent);

        if (result && typeof result.then === "function") {
          void result
            .finally(() => {
              setRequestedIntent(null);
            })
            .catch(() => undefined);
        }
      } catch (error) {
        setRequestedIntent(null);
        throw error;
      }
    },
    [persistProfile],
  );

  return (
    <main
      className={
        embedded
          ? "w-full px-0 py-0"
          : "min-h-screen px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
      }
      style={{
        backgroundColor: embedded ? "transparent" : "#FAFAFA",
        color: C.text,
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
    >
      <div
        className={
          embedded
            ? "flex w-full flex-col gap-6"
            : "mx-auto flex w-full max-w-7xl flex-col gap-6"
        }
      >
        <header
          className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between"
          style={{ borderColor: C.rule }}
        >
          <div className="max-w-3xl">
            <div
              className="mb-3 inline-flex items-center gap-2 text-xs font-bold tracking-[0.08em]"
              style={{ color: C.blue }}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              {eyebrow}
            </div>

            <h1
              className="text-3xl font-semibold leading-tight tracking-[-0.025em] sm:text-4xl"
              style={{ color: C.navy }}
            >
              {title}
            </h1>

            <p
              className="mt-3 max-w-2xl text-sm leading-6 sm:text-base"
              style={{ color: C.navySoft }}
            >
              {description}
            </p>

            <p
              className="mt-3 break-all text-xs font-medium"
              style={{ color: C.muted }}
            >
              Source: {effectiveWebsiteUrl}
            </p>
          </div>

          <Badge
            variant="outline"
            className="w-fit rounded-md px-3 py-1.5 text-xs font-semibold"
            style={{
              borderColor: C.blueLight,
              backgroundColor: C.bluePale,
              color: C.blue,
            }}
          >
            <CircleDotDashed className="mr-1.5 size-3.5" aria-hidden="true" />
            {statusLabel}
          </Badge>
        </header>

        <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(340px,5fr)]">
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute -bottom-2 -right-2 left-3 top-3 rounded-lg"
              style={{
                backgroundColor: "rgba(59, 154, 232, 0.10)",
                border: SURFACE_BORDER,
              }}
            />

            <Card
              className="relative z-10 rounded-lg bg-white"
              style={{ border: SURFACE_BORDER, boxShadow: SURFACE_SHADOW }}
            >
              <CardHeader className="gap-3 border-b" style={{ borderColor: C.rule }}>
                <div className="flex items-start gap-3">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border"
                    style={{
                      borderColor: C.blueLight,
                      backgroundColor: C.bluePale,
                      color: C.blue,
                    }}
                  >
                    <Target className="size-4" aria-hidden="true" />
                  </div>

                  <div>
                    <CardTitle
                      className="text-lg font-semibold"
                      style={{ color: C.navy }}
                    >
                      Your matching brief
                    </CardTitle>
                    <CardDescription
                      className="mt-1 max-w-2xl leading-6"
                      style={{ color: C.muted }}
                    >
                      Keep every field specific, observable, and close to the
                      words your buyers actually use.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-7 p-5 sm:p-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <ListEditor
                    label="Target audience"
                    description="The roles, teams, or company types most likely to buy."
                    value={profileFields.target_audience}
                    placeholder="Add an audience"
                    tone={LIST_TONES.blue}
                    onChange={updateTargetAudience}
                  />
                  <ListEditor
                    label="Primary use cases"
                    description="The outcomes buyers are actively trying to achieve."
                    value={profileFields.use_cases}
                    placeholder="Add a use case"
                    tone={LIST_TONES.green}
                    onChange={updateUseCases}
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <ProfileTextArea
                    id="core_problem"
                    label="Core problem"
                    description="Describe the painful situation that creates urgency."
                    value={profileFields.core_problem}
                    placeholder="Example: SaaS teams cannot see which customers are quietly disengaging until they cancel."
                    onChange={updateCoreProblem}
                  />
                  <ProfileTextArea
                    id="unique_value_prop"
                    label="Unique value proposition"
                    description="Explain why your approach is meaningfully different."
                    value={profileFields.unique_value_prop}
                    placeholder="Example: Arcli connects product activity, billing signals, and automated recovery in one explainable workflow."
                    onChange={updateUniqueValueProp}
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <ListEditor
                    label="Pain points"
                    description="Specific frustrations prospects mention before searching."
                    value={profileFields.pain_points}
                    placeholder="Add a pain point"
                    tone={LIST_TONES.amber}
                    onChange={updatePainPoints}
                  />
                  <ListEditor
                    label="Buying triggers"
                    description="Events that make the problem urgent enough to act on."
                    value={profileFields.buying_triggers}
                    placeholder="Add a buying trigger"
                    tone={LIST_TONES.green}
                    onChange={updateBuyingTriggers}
                  />
                  <ListEditor
                    label="Negative keywords"
                    description="Terms that usually indicate weak or irrelevant intent."
                    value={profileFields.negative_keywords}
                    placeholder="Add a negative keyword"
                    tone={LIST_TONES.red}
                    onChange={updateNegativeKeywords}
                  />
                  <ListEditor
                    label="Excluded audiences"
                    description="People or companies the discovery engine should ignore."
                    value={profileFields.excluded_audiences}
                    placeholder="Add an excluded audience"
                    tone={LIST_TONES.red}
                    onChange={updateExcludedAudiences}
                  />
                </div>

                <div
                  className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"
                  style={{ borderColor: C.rule }}
                  aria-busy={isProfilePending}
                >
                  <div className="min-w-0" aria-live="polite">
                    <ResultText result={profileResult} />
                    <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                      {saveHelpText}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isProfilePending}
                      onClick={() => handlePersist("save")}
                      className="rounded-lg"
                      style={{
                        borderColor: C.ruleDark,
                        backgroundColor: C.white,
                        color: C.navy,
                        boxShadow: SURFACE_SHADOW,
                      }}
                    >
                      {isSaving ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Save className="size-4" aria-hidden="true" />
                      )}
                      {isSaving ? savingLabel : saveLabel}
                    </Button>

                    {showApproveAction ? (
                      <Button
                        type="button"
                        disabled={isProfilePending}
                        onClick={() => handlePersist("approve")}
                        className="rounded-lg"
                        style={{
                          backgroundColor: C.green,
                          color: C.white,
                          boxShadow: SURFACE_SHADOW,
                        }}
                      >
                        {isApproving ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                        )}
                        {isApproving ? "Activating…" : "Approve & activate"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="relative lg:sticky lg:top-6">
            <div
              aria-hidden="true"
              className="absolute -left-2 -top-2 bottom-3 right-3 rounded-lg"
              style={{
                backgroundColor: "rgba(59, 154, 232, 0.16)",
                border: SURFACE_BORDER,
              }}
            />

            <Card
              className="relative z-10 overflow-hidden rounded-lg"
              style={{
                border: "1px solid rgba(255, 255, 255, 0.12)",
                backgroundColor: C.navy,
                color: C.white,
                boxShadow: SURFACE_SHADOW,
              }}
            >
              <CardHeader
                className="gap-3 border-b"
                style={{ borderColor: "rgba(255, 255, 255, 0.10)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg border"
                      style={{
                        borderColor: "rgba(96, 165, 250, 0.28)",
                        backgroundColor: "rgba(59, 154, 232, 0.18)",
                        color: C.blueLight,
                      }}
                    >
                      <Braces className="size-4" aria-hidden="true" />
                    </div>

                    <div>
                      <CardTitle className="text-lg font-semibold text-white">
                        Structured profile
                      </CardTitle>
                      <CardDescription className="mt-1 leading-6 text-slate-400">
                        Read-only preview of the payload prepared for the
                        matching engine.
                      </CardDescription>
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold tracking-[0.08em]"
                    style={{
                      borderColor: "rgba(255, 255, 255, 0.14)",
                      backgroundColor: "rgba(255, 255, 255, 0.06)",
                      color: C.blueLight,
                    }}
                  >
                    READ ONLY
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4">
                <pre
                  tabIndex={0}
                  aria-label="Structured service profile JSON"
                  className="max-h-[690px] overflow-auto rounded-lg border p-4 text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                  style={{
                    borderColor: "rgba(255, 255, 255, 0.10)",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    color: "#E2E8F0",
                  }}
                >
                  <code>{formattedJson}</code>
                </pre>

                <div
                  className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-5"
                  style={{
                    borderColor: "rgba(16, 185, 129, 0.24)",
                    backgroundColor: "rgba(16, 185, 129, 0.08)",
                    color: "#94A3B8",
                  }}
                >
                  <ShieldCheck
                    className="mt-0.5 size-3.5 shrink-0"
                    style={{ color: "#34D399" }}
                    aria-hidden="true"
                  />
                  <span>
                    Show only tenant-safe profile fields here. Do not pass raw
                    crawler metadata, secrets, or internal worker diagnostics.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
