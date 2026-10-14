"use client";

import {
  Building2,
  Check,
  CircleAlert,
  Link2,
  Plus,
  Rocket,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  useBriefSaveSection,
  type BriefSaveOutcome,
} from "@/app/(dashboard)/dashboard/brief/brief-save";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  TARGETING_BRIEF_LIMITS,
  TARGET_TYPES,
  normalizeSeedUrl,
  normalizeTargetingBriefInput,
  type TargetType,
  type TargetingBriefInput,
  type TargetingBriefView,
} from "@/lib/targeting-brief";
import { cn } from "@/lib/utils";
import { RemovableTag } from "./targeting-fields";

type ListFieldKey = Exclude<
  keyof TargetingBriefInput,
  "targetTypes" | "seedUrls"
>;

type TargetTypeOption = {
  value: TargetType;
  label: string;
  description: string;
  icon: LucideIcon;
};

const targetTypeOptions: readonly TargetTypeOption[] = [
  {
    value: "account",
    label: "Accounts",
    description: "Companies or teams with a public web presence.",
    icon: Building2,
  },
  {
    value: "builder",
    label: "Builders",
    description: "Indie hackers, founders, creators or consultants.",
    icon: UserRound,
  },
  {
    value: "project",
    label: "Projects",
    description: "Products, repositories, launches or public sites.",
    icon: Rocket,
  },
];

const BRIEF_KEYS: ReadonlyArray<keyof TargetingBriefInput> = [
  "targetTypes",
  "idealCustomerTraits",
  "changeTriggers",
  "strongEvidenceDefinitions",
  "exclusions",
  "seedUrls",
];

const TARGET_TYPE_ERROR_ID = "targeting-types-error";

function listDraftItems(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function briefFingerprint(value: TargetingBriefInput) {
  return JSON.stringify(normalizeTargetingBriefInput(value));
}

function FieldHeading({
  htmlFor,
  label,
  optional,
  count,
}: {
  htmlFor: string;
  label: string;
  optional?: boolean;
  count: number;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
      </label>
      <span className="shrink-0 text-xs tabular-nums text-subtle">
        {count}/{TARGETING_BRIEF_LIMITS.maxItemsPerField}
      </span>
    </div>
  );
}

function ListField({
  id,
  label,
  description,
  placeholder,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  placeholder: string;
  value: readonly string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const isAtLimit = value.length >= TARGETING_BRIEF_LIMITS.maxItemsPerField;
  const descriptionId = `${id}-description`;

  const commitDraft = () => {
    const items = listDraftItems(draft);
    if (items.length === 0 || isAtLimit) return;

    onChange([...value, ...items]);
    setDraft("");
  };

  const removeItem = (item: string) => {
    onChange(
      value.filter((current) => current.toLocaleLowerCase() !== item.toLocaleLowerCase()),
    );
  };

  return (
    <div className="min-w-0">
      <FieldHeading htmlFor={id} label={label} count={value.length} />
      <p id={descriptionId} className="mt-0.5 text-sm leading-5 text-muted-foreground">
        {description}
      </p>

      {value.length > 0 ? (
        <ul className="mt-2.5 flex min-w-0 flex-wrap gap-1.5" aria-label={label}>
          {value.map((item) => (
            <RemovableTag
              key={item.toLocaleLowerCase()}
              label={item}
              disabled={disabled}
              onRemove={() => removeItem(item)}
            />
          ))}
        </ul>
      ) : null}

      <div className="mt-2.5 flex min-w-0 gap-2">
        <Input
          id={id}
          type="text"
          value={draft}
          maxLength={TARGETING_BRIEF_LIMITS.maxTextLength * 4}
          placeholder={placeholder}
          disabled={disabled || isAtLimit}
          aria-describedby={descriptionId}
          className="flex-1 bg-card text-sm"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitDraft();
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (!/[\n,;]/.test(text)) return;

            event.preventDefault();
            onChange([...value, ...listDraftItems(text)]);
            setDraft("");
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || isAtLimit || listDraftItems(draft).length === 0}
          onClick={commitDraft}
        >
          <Plus aria-hidden="true" />
          Add
        </Button>
      </div>
      {isAtLimit ? (
        <p className="mt-2 text-sm leading-5 text-muted-foreground">
          This list is full. Remove an item to add another.
        </p>
      ) : null}
    </div>
  );
}

function SeedUrlField({
  value,
  disabled,
  onChange,
}: {
  value: readonly string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const isAtLimit = value.length >= TARGETING_BRIEF_LIMITS.maxItemsPerField;

  const commitDraft = () => {
    const rawItems = listDraftItems(draft);
    if (rawItems.length === 0 || isAtLimit) return;

    const urls = rawItems.map(normalizeSeedUrl).filter(Boolean);
    if (urls.length === 0) {
      setValidationMessage("Enter a public web address, like github.com/example/project.");
      return;
    }

    onChange([...value, ...urls]);
    setDraft("");
    setValidationMessage(
      urls.length === rawItems.length
        ? null
        : "Some entries weren't added because they aren't public web addresses.",
    );
  };

  const removeItem = (item: string) => {
    onChange(value.filter((current) => current !== item));
  };

  return (
    <div className="min-w-0">
      <FieldHeading htmlFor="targeting-seed-urls" label="Starting points" optional count={value.length} />
      <p id="targeting-seeds-description" className="mt-0.5 text-sm leading-5 text-muted-foreground">
        Public sites, repositories, launch pages or profiles that show the kind of target you want. Arcli uses them as examples, not contacts.
      </p>

      {value.length > 0 ? (
        <ul className="mt-2.5 flex min-w-0 flex-wrap gap-1.5" aria-label="Starting points">
          {value.map((url) => (
            <RemovableTag
              key={url}
              label={url}
              disabled={disabled}
              onRemove={() => removeItem(url)}
            />
          ))}
        </ul>
      ) : null}

      <div className="mt-2.5 flex min-w-0 gap-2">
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="targeting-seed-urls"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={draft}
            maxLength={TARGETING_BRIEF_LIMITS.maxSeedUrlLength * 2}
            placeholder="github.com/example/project"
            disabled={disabled || isAtLimit}
            aria-invalid={validationMessage ? true : undefined}
            aria-describedby={
              validationMessage
                ? "targeting-seeds-description targeting-seeds-error"
                : "targeting-seeds-description"
            }
            className="bg-card pl-9 text-sm"
            onChange={(event) => {
              setDraft(event.target.value);
              setValidationMessage(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              commitDraft();
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || isAtLimit || listDraftItems(draft).length === 0}
          onClick={commitDraft}
        >
          <Plus aria-hidden="true" />
          Add
        </Button>
      </div>
      {validationMessage ? (
        <p id="targeting-seeds-error" className="mt-2 text-sm leading-5 text-danger" role="status">
          {validationMessage}
        </p>
      ) : null}
    </div>
  );
}

function TargetTypePicker({
  value,
  disabled,
  showError,
  onChange,
}: {
  value: readonly TargetType[];
  disabled: boolean;
  showError: boolean;
  onChange: (value: TargetType[]) => void;
}) {
  const toggle = (targetType: TargetType) => {
    const next = value.includes(targetType)
      ? value.filter((current) => current !== targetType)
      : [...value, targetType];
    onChange(TARGET_TYPES.filter((option) => next.includes(option)));
  };

  return (
    <fieldset aria-describedby={showError ? TARGET_TYPE_ERROR_ID : "targeting-types-description"}>
      <legend className="text-sm font-semibold text-foreground">Target types</legend>
      <p id="targeting-types-description" className="mt-0.5 text-sm leading-5 text-muted-foreground">
        {"What Arcli may research first. A target doesn't need to be a registered company."}
      </p>
      {showError ? (
        <p id={TARGET_TYPE_ERROR_ID} className="mt-1.5 flex items-start gap-2 text-sm leading-5 text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Choose at least one target type.
        </p>
      ) : null}
      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-3">
        {targetTypeOptions.map((option) => {
          const selected = value.includes(option.value);
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-invalid={showError || undefined}
              disabled={disabled}
              data-target-type={option.value}
              className={cn(
                "flex min-w-0 items-start gap-3 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                selected
                  ? "border-primary bg-blue-tint"
                  : showError
                    ? "border-danger/50 bg-card hover:bg-off-white"
                    : "border-input bg-card hover:bg-off-white",
              )}
              onClick={() => toggle(option.value)}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-rule-dark bg-card",
                )}
                aria-hidden="true"
              >
                {selected ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {option.label}
                </span>
                <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function TargetingBriefEditor({
  initialBrief,
  onSave,
}: {
  initialBrief: TargetingBriefView;
  onSave: (input: TargetingBriefInput) => Promise<BriefSaveOutcome>;
}) {
  const initialInput = useMemo(
    () => normalizeTargetingBriefInput(initialBrief),
    [initialBrief],
  );
  const initialFingerprint = briefFingerprint(initialInput);
  const [draft, setDraft] = useState<TargetingBriefInput>(initialInput);
  const [syncedFingerprint, setSyncedFingerprint] = useState(initialFingerprint);
  const [lastSentFingerprint, setLastSentFingerprint] = useState<string | null>(null);
  const [showTypeError, setShowTypeError] = useState(false);

  // Saving any part of the page refreshes these props. Keep unsaved edits;
  // adopt the server copy only when the draft is clean or was just sent.
  if (syncedFingerprint !== initialFingerprint) {
    setSyncedFingerprint(initialFingerprint);
    const draftFingerprint = briefFingerprint(draft);
    if (draftFingerprint === syncedFingerprint || draftFingerprint === lastSentFingerprint) {
      setDraft(initialInput);
    }
  }

  const normalizedDraft = normalizeTargetingBriefInput(draft);
  const changeCount = BRIEF_KEYS.filter(
    (key) => JSON.stringify(normalizedDraft[key]) !== JSON.stringify(initialInput[key]),
  ).length;

  const validate = (): BriefSaveOutcome | null => {
    if (normalizeTargetingBriefInput(draft).targetTypes.length > 0) return null;
    setShowTypeError(true);
    document
      .querySelector<HTMLElement>(`[data-target-type="${TARGET_TYPES[0]}"]`)
      ?.focus();
    return { ok: false, message: "Nothing was saved: choose at least one target type." };
  };

  const save = async (): Promise<BriefSaveOutcome> => {
    const input = normalizeTargetingBriefInput(draft);
    try {
      const result = await onSave(input);
      if (result.ok) setLastSentFingerprint(briefFingerprint(input));
      return result;
    } catch {
      return {
        ok: false,
        message: "Couldn't reach Arcli to save the target universe. Check your connection and try again.",
      };
    }
  };

  const { isSaving } = useBriefSaveSection("universe", {
    changeCount,
    saveLabel: "Save target universe",
    save,
    validate,
  });

  const updateDraft = (patch: Partial<TargetingBriefInput>) => {
    setDraft((current) => normalizeTargetingBriefInput({ ...current, ...patch }));
  };

  const updateList = (key: ListFieldKey, value: string[]) => updateDraft({ [key]: value });

  return (
    <section
      id="target-universe"
      className="scroll-mt-4 rounded-lg border border-border bg-card"
      aria-labelledby="targeting-brief-title"
    >
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 id="targeting-brief-title" className="text-lg font-semibold text-foreground">
            Target universe
          </h2>
          {initialBrief.hasBrief ? (
            <StatusBadge tone="success" size="compact">Saved</StatusBadge>
          ) : (
            <StatusBadge tone="neutral" size="compact">Not set up</StatusBadge>
          )}
        </div>
        <p className="mt-0.5 max-w-[70ch] text-sm leading-5 text-muted-foreground">
          Accounts, builders and projects worth researching before they post about the problem.
        </p>
        <p className="mt-3 flex max-w-[75ch] gap-2 text-sm leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Fit and evidence are separate: a high-fit target is not automatically a lead. Arcli only calls something a strong buyer signal when recent, cited public evidence supports it.
          </span>
        </p>
      </div>

      <div className="space-y-6 px-4 py-5 sm:px-5">
        <TargetTypePicker
          value={draft.targetTypes}
          disabled={isSaving}
          showError={showTypeError && draft.targetTypes.length === 0}
          onChange={(targetTypes) => {
            setShowTypeError(false);
            updateDraft({ targetTypes });
          }}
        />

        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-6 border-t border-border pt-5 lg:grid-cols-2">
          <ListField
            id="targeting-ideal-traits"
            label="Ideal customer traits"
            description="Visible qualities of an account, builder or project that make it a good fit."
            placeholder="Bootstrapped B2B SaaS selling to sales teams"
            value={draft.idealCustomerTraits}
            disabled={isSaving}
            onChange={(value) => updateList("idealCustomerTraits", value)}
          />
          <ListField
            id="targeting-change-triggers"
            label="Relevant change triggers"
            description="Public events worth a closer look, even before anyone asks for help."
            placeholder="Launched a paid plan or hired the first sales lead"
            value={draft.changeTriggers}
            disabled={isSaving}
            onChange={(value) => updateList("changeTriggers", value)}
          />
          <ListField
            id="targeting-strong-evidence"
            label="What counts as strong buyer evidence?"
            description="The proof needed to move a target from good fit to strong buyer signal."
            placeholder="A founder compares prospecting tools or describes a failed workflow"
            value={draft.strongEvidenceDefinitions}
            disabled={isSaving}
            onChange={(value) => updateList("strongEvidenceDefinitions", value)}
          />
          <ListField
            id="targeting-exclusions"
            label="Outside the target universe"
            description="Audiences, projects or contexts Arcli shouldn't spend research on."
            placeholder="Student projects, agencies, direct competitors"
            value={draft.exclusions}
            disabled={isSaving}
            onChange={(value) => updateList("exclusions", value)}
          />
        </div>

        <div className="border-t border-border pt-5">
          <SeedUrlField
            value={draft.seedUrls}
            disabled={isSaving}
            onChange={(seedUrls) => updateDraft({ seedUrls })}
          />
        </div>
      </div>
    </section>
  );
}
