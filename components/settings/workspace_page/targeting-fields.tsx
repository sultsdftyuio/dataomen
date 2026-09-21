"use client";

import {
  type KeyboardEvent,
  useMemo,
  useState,
} from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { C } from "@/lib/tokens";

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
    <div className="rounded-lg border bg-background p-3" style={{ borderColor: C.rule }}>
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
              style={{ color: C.navy, borderColor: C.rule }}
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
          style={{ borderColor: C.rule, color: C.navy }}
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
  return (
    <div className="rounded-lg border bg-background p-3" style={{ borderColor: C.rule }}>
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
