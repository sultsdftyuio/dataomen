"use client";

import {
  type KeyboardEvent,
  useId,
  useMemo,
  useState,
} from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_SIGNAL_LENGTH = 100;
const MAX_TEXT_LENGTH = 1_000;

function normalizeSignal(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_SIGNAL_LENGTH);
}

export function normalizeSignals(values: readonly string[]) {
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

// Brief items are sentences, not keywords, so they read as one row each
// rather than a cloud of pills that wrap mid-thought.
const rowClassName =
  "flex min-w-0 items-start gap-2 rounded-lg bg-blue-tint px-3 py-2 text-sm leading-6 text-navy-soft";

/** Classes for a list of editable brief items. */
export const editableListClassName = "mt-2.5 flex min-w-0 flex-col gap-1.5";

/** Read-only list of brief items, shown when a section is not being edited. */
export function TagList({
  items,
  className,
}: {
  items: readonly string[];
  className?: string;
}) {
  return (
    <ul className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {items.map((item) => (
        <li key={item.toLowerCase()} className={rowClassName}>
          <span className="min-w-0 [overflow-wrap:anywhere] first-letter:uppercase">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One editable item. Remove stays visible on touch screens; with a mouse it
 * appears on hover or keyboard focus so a long list doesn't read as a column
 * of crosses.
 */
export function RemovableTag({
  label,
  disabled,
  onRemove,
}: {
  label: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <li className={cn(rowClassName, "group py-1 pr-1")}>
      <span className="min-w-0 flex-1 py-1 [overflow-wrap:anywhere] first-letter:uppercase">{label}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${label}`}
        disabled={disabled}
        className="shrink-0 text-muted-foreground hover:bg-blue-pale hover:text-foreground pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}

export function SignalField({
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
  const inputId = useId();
  const descriptionId = `${inputId}-description`;
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
      signals.filter((item) => item.toLowerCase() !== signal.toLowerCase()),
    );
  };

  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      <p id={descriptionId} className="mt-0.5 text-sm leading-5 text-muted-foreground">
        {description}
      </p>

      {signals.length > 0 ? (
        <ul className={editableListClassName} aria-label={label}>
          {signals.map((signal) => (
            <RemovableTag
              key={signal.toLowerCase()}
              label={signal}
              disabled={disabled}
              onRemove={() => removeSignal(signal)}
            />
          ))}
        </ul>
      ) : null}

      <div className="mt-2.5 flex min-w-0 gap-2">
        <Input
          id={inputId}
          value={draft}
          maxLength={MAX_SIGNAL_LENGTH * 4}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={descriptionId}
          className="flex-1 bg-card text-sm"
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
          disabled={disabled || !canAdd}
          onClick={commitDraft}
        >
          <Plus aria-hidden="true" />
          Add
        </Button>
      </div>
    </div>
  );
}

export function TextProfileField({
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
  const inputId = useId();
  const descriptionId = `${inputId}-description`;
  const countId = `${inputId}-count`;

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={inputId} className="text-sm font-semibold text-foreground">
          {label}
        </label>
        <span id={countId} className="shrink-0 text-xs tabular-nums text-subtle">
          {value.length}/{MAX_TEXT_LENGTH}
        </span>
      </div>
      <p id={descriptionId} className="mt-0.5 text-sm leading-5 text-muted-foreground">
        {description}
      </p>
      <Textarea
        id={inputId}
        maxLength={MAX_TEXT_LENGTH}
        rows={3}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby={`${descriptionId} ${countId}`}
        className="mt-2.5 min-h-24 resize-y bg-card text-sm leading-6"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
