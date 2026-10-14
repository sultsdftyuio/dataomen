"use client";

import { ChevronRight, Loader2, Plus } from "lucide-react";
import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TARGET_TYPES, type TargetType } from "@/lib/targeting-brief";
import { ActionNotice } from "./target-action-notice";
import { ADD_TARGET_INPUT_ID } from "./target-presentation";
import "./manual-target-form.css";

type ManualTargetInput = { entityKind: TargetType; canonicalUrl: string; title?: string };
type ActionResult = { ok: boolean; message: string };

const TARGET_LABELS: Record<TargetType, string> = {
  account: "Account or team",
  builder: "Independent builder",
  project: "Project or product",
};

const SELECT_CLASS_NAME =
  "block h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

/**
 * A guess from the URL's shape, used only until the person picks a type
 * themselves: github.com/name is usually a builder, github.com/name/repo a
 * project. Anything else keeps the brief's first target type.
 */
function inferTargetType(url: string, allowed: readonly TargetType[]): TargetType | null {
  const path = url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const github = path.match(/^github\.com\/([^/?#]+)(?:\/([^/?#]+))?/i);
  const hackerNewsUser = /^news\.ycombinator\.com\/user\?id=/i.test(path);
  const guess: TargetType | null = github ? (github[2] ? "project" : "builder") : hackerNewsUser ? "builder" : null;
  return guess && allowed.includes(guess) ? guess : null;
}

/** The server validates and stores the public reference; no contact details are collected here. */
export function ManualTargetForm({
  allowedTargetTypes,
  onCreate,
}: {
  allowedTargetTypes: readonly TargetType[];
  onCreate: (input: ManualTargetInput) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const defaultType = allowedTargetTypes[0] ?? TARGET_TYPES[0];
  const [entityKind, setEntityKind] = useState<TargetType>(defaultType);
  const [typeChosen, setTypeChosen] = useState(false);
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const typeId = `${fieldId}-type`;
  const nameId = `${fieldId}-name`;
  const urlRejected = notice !== null && !notice.ok;

  const changeUrl = (value: string) => {
    setCanonicalUrl(value);
    if (urlRejected) setNotice(null);
    if (!typeChosen) setEntityKind(inferTargetType(value, allowedTargetTypes) ?? defaultType);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canonicalUrl.trim()) {
      setNotice({ ok: false, message: "Enter the target's website or public profile URL." });
      document.getElementById(ADD_TARGET_INPUT_ID)?.focus();
      return;
    }
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await onCreate({
          entityKind,
          canonicalUrl,
          title: entityKind === "builder" ? undefined : title,
        });
        setNotice(result);
        if (result.ok) {
          setCanonicalUrl("");
          setTitle("");
          setTypeChosen(false);
          setEntityKind(defaultType);
          router.refresh();
        }
      } catch {
        setNotice({ ok: false, message: "Couldn't add this target. Check your connection and try again." });
      }
    });
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:px-5" aria-labelledby="manual-target-heading">
      <h2 id="manual-target-heading" className="text-base font-semibold text-foreground">
        Add a target
      </h2>
      <form onSubmit={submit} noValidate className="mt-3">
        <div className="arc-target-entry__row">
          <div className="arc-target-entry__url min-w-0">
            <label htmlFor={ADD_TARGET_INPUT_ID} className="block text-sm font-medium text-foreground">
              Website or profile URL
            </label>
            <Input
              id={ADD_TARGET_INPUT_ID}
              type="text"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              value={canonicalUrl}
              disabled={isPending}
              aria-invalid={urlRejected || undefined}
              aria-describedby={urlRejected ? `${hintId} ${errorId}` : hintId}
              onChange={(event) => changeUrl(event.target.value)}
              className="mt-1.5 bg-card"
            />
          </div>
          <div className="arc-target-entry__type min-w-0">
            <label htmlFor={typeId} className="block text-sm font-medium text-foreground">
              Type
            </label>
            <select
              id={typeId}
              value={entityKind}
              disabled={isPending || allowedTargetTypes.length < 2}
              onChange={(event) => {
                setTypeChosen(true);
                setEntityKind(event.target.value as TargetType);
              }}
              className={`mt-1.5 ${SELECT_CLASS_NAME}`}
            >
              {allowedTargetTypes.map((kind) => (
                <option key={kind} value={kind}>
                  {TARGET_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="submit"
            className="arc-target-entry__submit"
            disabled={isPending || allowedTargetTypes.length === 0}
          >
            {isPending ? (
              <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            {isPending ? "Adding target…" : "Add target"}
          </Button>
        </div>
        <p id={hintId} className="mt-2 text-xs leading-5 text-subtle">
          For example, acme.com or github.com/name. Public pages only.
        </p>

        {entityKind === "builder" ? (
          <p className="mt-2 text-xs leading-5 text-subtle">
            Arcli uses the profile URL as the builder&apos;s name. Don&apos;t add personal contact details.
          </p>
        ) : (
          <details className="arc-target-entry__name mt-1">
            <summary className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-sm text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <ChevronRight className="arc-target-entry__chevron size-4" aria-hidden="true" />
              Add a display name
            </summary>
            <div className="max-w-sm pb-1">
              <label htmlFor={nameId} className="block text-sm font-medium text-foreground">
                Display name <span className="font-normal text-subtle">(optional)</span>
              </label>
              <Input
                id={nameId}
                value={title}
                maxLength={240}
                disabled={isPending}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1.5 bg-card"
              />
            </div>
          </details>
        )}

        <ActionNotice notice={notice} id={errorId} />
      </form>
    </section>
  );
}
