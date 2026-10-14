"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WatchlistCreateInput } from "../prospect-types";
import type { ActionOutcome } from "./action-outcome";
import { FormField } from "./form-field";
import {
  DEFAULT_SOURCES,
  focusFirstError,
  validateGroupFields,
  type GroupField,
  type GroupFieldErrors,
} from "./group-fields";
import { OutcomeNotice } from "./outcome-notice";
import { SourcePicker } from "./source-picker";
import type { CreateGroup } from "./use-create-group";

const STEPS = ["Audience", "Problem", "Sources"] as const;
const STEP_FIELDS: GroupField[][] = [["name", "targetBuyer"], ["problemToSolve"], ["sources"]];
const FORM_ID = "first-buyer-group";
const fieldId = (field: GroupField) =>
  field === "sources" ? `${FORM_ID}-sources` : `${FORM_ID}-${field}`;

/**
 * Three short steps for a workspace's first buyer group. Every step submits
 * the same form; only the last step creates the group. (A Continue button
 * that swapped to type="submit" mid-click used to create it on step 2.)
 */
export function FirstBuyerGroupSetup({
  onCreate,
  onCancel,
}: {
  onCreate: CreateGroup;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [targetBuyer, setTargetBuyer] = useState("");
  const [problemToSolve, setProblemToSolve] = useState("");
  const [sources, setSources] = useState<string[]>(DEFAULT_SOURCES);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<GroupFieldErrors>({});
  const [failure, setFailure] = useState<ActionOutcome | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // People reach each step by pressing Start or Continue, so moving focus to
  // the step's heading is expected and tells screen readers where they are.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const toggleSource = (source: string) => {
    setSources((current) =>
      current.includes(source) ? current.filter((value) => value !== source) : [...current, source],
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input: WatchlistCreateInput = {
      name,
      targetBuyer,
      problemToSolve,
      includeTerms: [],
      excludeTerms: [],
      sourcePreferences: sources,
      suggestedPlaces: [],
    };
    const nextErrors = validateGroupFields(input, STEP_FIELDS[step - 1]);
    setErrors(nextErrors);
    setFailure(null);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors, fieldId);
      return;
    }
    if (step < STEPS.length) {
      setStep(step + 1);
      return;
    }

    setIsSaving(true);
    const { ok, outcome } = await onCreate(input);
    setIsSaving(false);
    if (!ok) setFailure(outcome);
  };

  const back = () => {
    setErrors({});
    setFailure(null);
    setStep(step - 1);
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${FORM_ID}-title`}
      className="rounded-lg border border-border bg-card px-4 py-5 md:px-6 md:py-6"
    >
      <div className="max-w-2xl">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id={`${FORM_ID}-title`} className="text-base leading-6 font-semibold text-foreground">
            Create your first buyer group
          </h2>
          <p className="text-sm text-subtle tabular-nums">
            Step {step} of {STEPS.length}
          </p>
        </div>
        <ol className="mt-3 grid grid-cols-3 gap-2" aria-label="Setup progress">
          {STEPS.map((label, index) => {
            const position = index + 1;
            const isCurrent = position === step;
            const isComplete = position < step;
            return (
              <li
                key={label}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-1.5 border-t-2 pt-2 text-xs leading-5",
                  isCurrent || isComplete ? "border-primary" : "border-border",
                  isCurrent ? "font-medium text-foreground" : "text-subtle",
                )}
              >
                {isComplete ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" /> : null}
                <span className="truncate">{label}</span>
                {isComplete ? <span className="sr-only">(done)</span> : null}
              </li>
            );
          })}
        </ol>

        <div className="mt-6">
          {step === 1 ? (
            <section aria-labelledby={`${FORM_ID}-step`} className="space-y-4">
              <h3 id={`${FORM_ID}-step`} ref={headingRef} tabIndex={-1} className="text-lg leading-7 font-semibold text-foreground outline-none">
                Who do you want to find?
              </h3>
              <FormField id={fieldId("name")} label="Group name" hint="A short name you will recognise, such as early-stage SaaS founders." error={errors.name}>
                {(control) => <Input {...control} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="off" />}
              </FormField>
              <FormField id={fieldId("targetBuyer")} label="Audience" hint="Be specific, for example founders with small sales teams." error={errors.targetBuyer}>
                {(control) => <Input {...control} value={targetBuyer} onChange={(event) => setTargetBuyer(event.target.value)} maxLength={500} autoComplete="off" />}
              </FormField>
            </section>
          ) : null}

          {step === 2 ? (
            <section aria-labelledby={`${FORM_ID}-step`} className="space-y-4">
              <h3 id={`${FORM_ID}-step`} ref={headingRef} tabIndex={-1} className="text-lg leading-7 font-semibold text-foreground outline-none">
                What problem should Arcli listen for?
              </h3>
              <FormField
                id={fieldId("problemToSolve")}
                label="Their problem or the outcome they want"
                hint="Write it the way they would when asking for help, for example: we need more trial users without doing every outreach task by hand."
                error={errors.problemToSolve}
              >
                {(control) => (
                  <Textarea {...control} value={problemToSolve} onChange={(event) => setProblemToSolve(event.target.value)} maxLength={700} className="min-h-28" />
                )}
              </FormField>
            </section>
          ) : null}

          {step === 3 ? (
            <section aria-labelledby={`${FORM_ID}-step`} className="space-y-3">
              <h3 id={`${FORM_ID}-step`} ref={headingRef} tabIndex={-1} className="text-lg leading-7 font-semibold text-foreground outline-none">
                Where should Arcli look?
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                All public sources are selected. Keep the ones where this audience asks for help.
              </p>
              <SourcePicker idPrefix={FORM_ID} sources={sources} onToggle={toggleSource} error={errors.sources} />
            </section>
          ) : null}
        </div>

        {failure ? <OutcomeNotice outcome={failure} className="mt-5" /> : null}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button key={step < STEPS.length ? "continue" : "create"} type="submit" disabled={isSaving}>
            {step < STEPS.length ? (
              <>
                Continue
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            ) : isSaving ? (
              "Creating group…"
            ) : (
              "Create group and start scan"
            )}
          </Button>
          {step > 1 ? (
            <Button type="button" variant="ghost" onClick={back} disabled={isSaving}>
              Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
