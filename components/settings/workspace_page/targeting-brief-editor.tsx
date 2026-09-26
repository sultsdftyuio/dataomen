"use client";

import {
  Building2,
  Check,
  CircleAlert,
  Link2,
  Loader2,
  Plus,
  Rocket,
  Save,
  ShieldCheck,
  Target,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import {
  TARGETING_BRIEF_LIMITS,
  TARGET_TYPES,
  normalizeSeedUrl,
  normalizeTargetingBriefInput,
  type TargetType,
  type TargetingBriefInput,
  type TargetingBriefView,
} from "@/lib/targeting-brief";
import { C } from "@/lib/tokens";

type SaveResult = {
  ok: boolean;
  message: string;
};

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
    description: "Indie hackers, founders, creators, or consultants.",
    icon: UserRound,
  },
  {
    value: "project",
    label: "Projects",
    description: "Products, repositories, launches, or public sites.",
    icon: Rocket,
  },
];

function listDraftItems(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function briefFingerprint(value: TargetingBriefInput) {
  return JSON.stringify(normalizeTargetingBriefInput(value));
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
    <section
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: C.rule }}
      aria-labelledby={`${id}-label`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${id}-label`} className="text-sm font-semibold" style={{ color: C.navy }}>
            {label}
          </h3>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            {description}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
          {value.length}/{TARGETING_BRIEF_LIMITS.maxItemsPerField}
        </span>
      </div>

      {value.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {value.map((item) => (
            <span
              key={item.toLocaleLowerCase()}
              className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs"
              style={{ borderColor: C.rule, backgroundColor: C.offWhite, color: C.navySoft }}
            >
              <span className="truncate">{item}</span>
              <button
                type="button"
                aria-label={`Remove ${item}`}
                disabled={disabled}
                className="inline-flex size-4 shrink-0 items-center justify-center rounded hover:bg-black/5 disabled:opacity-50"
                onClick={() => removeItem(item)}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex min-w-0 gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          maxLength={TARGETING_BRIEF_LIMITS.maxTextLength * 4}
          placeholder={placeholder}
          disabled={disabled || isAtLimit}
          className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          style={{ borderColor: C.rule, color: C.navy }}
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
          size="sm"
          variant="outline"
          disabled={disabled || isAtLimit || listDraftItems(draft).length === 0}
          className="h-9 shrink-0"
          onClick={commitDraft}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add
        </Button>
      </div>
      {isAtLimit ? (
        <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>
          Keep the brief focused: remove an item before adding another.
        </p>
      ) : null}
    </section>
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
      setValidationMessage("Add a public website, project, repository, or launch URL.");
      return;
    }

    onChange([...value, ...urls]);
    setDraft("");
    setValidationMessage(
      urls.length === rawItems.length
        ? null
        : "Some entries were skipped because they were not public web URLs.",
    );
  };

  const removeItem = (item: string) => {
    onChange(value.filter((current) => current !== item));
  };

  return (
    <section
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: C.rule }}
      aria-labelledby="targeting-seeds-label"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="targeting-seeds-label" className="text-sm font-semibold" style={{ color: C.navy }}>
            Starting points <span className="font-normal" style={{ color: C.muted }}>(optional)</span>
          </h3>
          <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
            Add public sites, repositories, launch pages, or profiles that show the kinds of targets you want. These are discovery seeds, not contacts.
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
          {value.length}/{TARGETING_BRIEF_LIMITS.maxItemsPerField}
        </span>
      </div>

      {value.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {value.map((url) => (
            <li
              key={url}
              className="flex min-w-0 items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs"
              style={{ borderColor: C.rule, backgroundColor: C.offWhite, color: C.navySoft }}
            >
              <span className="truncate">{url}</span>
              <button
                type="button"
                aria-label={`Remove ${url}`}
                disabled={disabled}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-black/5 disabled:opacity-50"
                onClick={() => removeItem(url)}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex min-w-0 gap-2">
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: C.muted }} aria-hidden="true" />
          <input
            id="targeting-seed-urls"
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={draft}
            maxLength={TARGETING_BRIEF_LIMITS.maxSeedUrlLength * 2}
            placeholder="github.com/example/project"
            disabled={disabled || isAtLimit}
            className="h-9 w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            style={{ borderColor: C.rule, color: C.navy }}
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
          size="sm"
          variant="outline"
          disabled={disabled || isAtLimit || listDraftItems(draft).length === 0}
          className="h-9 shrink-0"
          onClick={commitDraft}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add
        </Button>
      </div>
      {validationMessage ? (
        <p className="mt-2 text-xs leading-5" style={{ color: C.amber }} role="status">
          {validationMessage}
        </p>
      ) : null}
    </section>
  );
}

function TargetTypePicker({
  value,
  disabled,
  onChange,
}: {
  value: readonly TargetType[];
  disabled: boolean;
  onChange: (value: TargetType[]) => void;
}) {
  const toggle = (targetType: TargetType) => {
    const next = value.includes(targetType)
      ? value.filter((current) => current !== targetType)
      : [...value, targetType];
    onChange(TARGET_TYPES.filter((option) => next.includes(option)));
  };

  return (
    <fieldset>
      <legend className="text-sm font-semibold" style={{ color: C.navy }}>
        Target types
      </legend>
      <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
        Choose what Arcli may consider first. A target does not need to be a registered company.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {targetTypeOptions.map((option) => {
          const selected = value.includes(option.value);
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={selected}
              disabled={disabled}
              className="relative flex min-h-28 flex-col rounded-lg border p-3 text-left transition-colors hover:bg-[#F8FBFD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: selected ? C.blue : C.rule,
                backgroundColor: selected ? C.bluePale : C.white,
              }}
              onClick={() => toggle(option.value)}
            >
              <span className="flex w-full items-start justify-between gap-2">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-md"
                  style={{ color: selected ? C.blue : C.muted, backgroundColor: selected ? C.white : C.offWhite }}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {selected ? (
                  <Check className="size-4" style={{ color: C.blue }} aria-hidden="true" />
                ) : null}
              </span>
              <span className="mt-3 text-sm font-semibold" style={{ color: C.navy }}>
                {option.label}
              </span>
              <span className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
                {option.description}
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
  onSave: (input: TargetingBriefInput) => Promise<SaveResult>;
}) {
  const initialInput = useMemo(
    () => normalizeTargetingBriefInput(initialBrief),
    [initialBrief],
  );
  const initialFingerprint = briefFingerprint(initialInput);
  const [draft, setDraft] = useState<TargetingBriefInput>(initialInput);
  const [savedDraft, setSavedDraft] = useState<TargetingBriefInput>(initialInput);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDraft(initialInput);
    setSavedDraft(initialInput);
    setResult(null);
  }, [initialFingerprint]);

  const hasChanges = briefFingerprint(draft) !== briefFingerprint(savedDraft);
  const needsTargetType = draft.targetTypes.length === 0;

  const updateList = (key: ListFieldKey, value: string[]) => {
    setDraft((current) => normalizeTargetingBriefInput({ ...current, [key]: value }));
  };

  const updateSeedUrls = (seedUrls: string[]) => {
    setDraft((current) => normalizeTargetingBriefInput({ ...current, seedUrls }));
  };

  const updateTargetTypes = (targetTypes: TargetType[]) => {
    setDraft((current) => normalizeTargetingBriefInput({ ...current, targetTypes }));
  };

  const save = () => {
    const input = normalizeTargetingBriefInput(draft);
    if (input.targetTypes.length === 0) {
      setResult({
        ok: false,
        message: "Choose at least one target type before saving this targeting brief.",
      });
      return;
    }

    startTransition(async () => {
      try {
        const saveResult = await onSave(input);
        setResult(saveResult);
        if (saveResult.ok) setSavedDraft(input);
      } catch {
        setResult({
          ok: false,
          message: "Could not save the targeting brief. Check your connection and try again.",
        });
      }
    });
  };

  return (
    <section
      className="overflow-hidden rounded-xl border bg-white shadow-sm"
      style={{ borderColor: C.rule }}
      aria-labelledby="targeting-brief-title"
    >
      <div className="border-b px-4 py-4 sm:px-5" style={{ borderColor: C.rule }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: C.bluePale, color: C.blue }}
            >
              <Target className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: C.blue }}>
                Account-first discovery
              </p>
              <h2 id="targeting-brief-title" className="mt-1 text-xl font-semibold" style={{ color: C.navy }}>
                Target universe
              </h2>
            </div>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              color: initialBrief.hasBrief ? C.green : C.muted,
              backgroundColor: initialBrief.hasBrief ? C.greenPale : C.offWhite,
            }}
          >
            {initialBrief.hasBrief ? "Saved brief" : "Not configured"}
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6" style={{ color: C.navySoft }}>
          Find high-fit accounts, independent builders, and projects before they make an explicit public request. Comments and threads are a second-stage evidence check, not the discovery gate.
        </p>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <TargetTypePicker
          value={draft.targetTypes}
          disabled={isPending}
          onChange={updateTargetTypes}
        />

        <div
          className="rounded-lg border px-3 py-3"
          style={{ borderColor: C.blueLight, backgroundColor: C.bluePale }}
        >
          <div className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
            <p className="text-xs leading-5" style={{ color: C.navySoft }}>
              <span className="font-semibold" style={{ color: C.navy }}>Evidence rule: </span>
              a high-fit target is not automatically a lead. Arcli should only call something a strong buyer signal when recent, cited public evidence supports that claim.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ListField
            id="targeting-ideal-traits"
            label="Ideal customer traits"
            description="Observable qualities of the account, builder, or project that make it a good fit."
            placeholder="Bootstrapped B2B SaaS selling to sales teams"
            value={draft.idealCustomerTraits}
            disabled={isPending}
            onChange={(value) => updateList("idealCustomerTraits", value)}
          />
          <ListField
            id="targeting-change-triggers"
            label="Relevant change triggers"
            description="Public events that justify deeper research, even without a stated need."
            placeholder="Launched a paid plan or hired the first sales lead"
            value={draft.changeTriggers}
            disabled={isPending}
            onChange={(value) => updateList("changeTriggers", value)}
          />
          <ListField
            id="targeting-strong-evidence"
            label="What counts as strong buyer evidence?"
            description="Define the proof needed to promote a target from high-fit to a strong buyer signal."
            placeholder="A founder compares prospecting tools or describes a failed workflow"
            value={draft.strongEvidenceDefinitions}
            disabled={isPending}
            onChange={(value) => updateList("strongEvidenceDefinitions", value)}
          />
          <ListField
            id="targeting-exclusions"
            label="Outside the target universe"
            description="Exclude poor-fit audiences, projects, or contexts before they consume research budget."
            placeholder="Student projects, agencies, direct competitors"
            value={draft.exclusions}
            disabled={isPending}
            onChange={(value) => updateList("exclusions", value)}
          />
        </div>

        <SeedUrlField
          value={draft.seedUrls}
          disabled={isPending}
          onChange={updateSeedUrls}
        />
      </div>

      <div
        className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
        style={{ borderColor: C.rule, backgroundColor: C.offWhite }}
      >
        <div className="min-w-0" aria-live="polite">
          {result ? (
            <p
              className="flex items-start gap-2 text-xs leading-5"
              style={{ color: result.ok ? C.green : C.red }}
            >
              {result.ok ? (
                <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              )}
              {result.message}
            </p>
          ) : needsTargetType ? (
            <p className="flex items-start gap-2 text-xs leading-5" style={{ color: C.amber }}>
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Choose whether Arcli should research accounts, builders, projects, or a combination.
            </p>
          ) : (
            <p className="text-xs leading-5" style={{ color: C.muted }}>
              Save this brief to guide target discovery. It does not create outreach or mark anyone as a lead.
            </p>
          )}
        </div>
        <Button
          type="button"
          disabled={isPending || needsTargetType || !hasChanges}
          className="h-9 shrink-0"
          style={{ backgroundColor: C.navy, color: C.white }}
          onClick={save}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          {isPending ? "Saving..." : "Save targeting brief"}
        </Button>
      </div>
    </section>
  );
}
