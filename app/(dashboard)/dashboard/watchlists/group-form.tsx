"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { WatchlistCreateInput } from "../prospect-types";
import type { ActionOutcome } from "./action-outcome";
import { FormField } from "./form-field";
import {
  DEFAULT_SOURCES,
  focusFirstError,
  splitLines,
  validateGroupFields,
  type GroupField,
  type GroupFieldErrors,
} from "./group-fields";
import { OutcomeNotice } from "./outcome-notice";
import { SourcePicker } from "./source-picker";
import type { CreateGroup } from "./use-create-group";

const FORM_ID = "new-buyer-group";
const fieldId = (field: GroupField) =>
  field === "sources" ? `${FORM_ID}-sources` : `${FORM_ID}-${field}`;

/** The full create form, used in the sheet once a workspace has groups. */
function BuyerGroupForm({ onCreate }: { onCreate: CreateGroup }) {
  const [name, setName] = useState("");
  const [targetBuyer, setTargetBuyer] = useState("");
  const [problemToSolve, setProblemToSolve] = useState("");
  const [includeTerms, setIncludeTerms] = useState("");
  const [excludeTerms, setExcludeTerms] = useState("");
  const [suggestedPlaces, setSuggestedPlaces] = useState("");
  const [sources, setSources] = useState<string[]>(DEFAULT_SOURCES);
  const [showDetail, setShowDetail] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<GroupFieldErrors>({});
  const [failure, setFailure] = useState<ActionOutcome | null>(null);

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
      includeTerms: splitLines(includeTerms),
      excludeTerms: splitLines(excludeTerms),
      sourcePreferences: sources,
      suggestedPlaces: splitLines(suggestedPlaces),
    };
    const nextErrors = validateGroupFields(input, [
      "name",
      "targetBuyer",
      "problemToSolve",
      "includeTerms",
      "excludeTerms",
      "suggestedPlaces",
      "sources",
    ]);
    setErrors(nextErrors);
    setFailure(null);
    if (Object.keys(nextErrors).length > 0) {
      // Hidden sections must open before their field can take focus.
      if (nextErrors.includeTerms || nextErrors.excludeTerms || nextErrors.suggestedPlaces) setShowDetail(true);
      if (nextErrors.sources) setShowSources(true);
      requestAnimationFrame(() => focusFirstError(nextErrors, fieldId));
      return;
    }

    setIsSaving(true);
    const { ok, outcome } = await onCreate(input);
    setIsSaving(false);
    if (!ok) setFailure(outcome);
  };

  return (
    <form onSubmit={submit} noValidate className="divide-y divide-border">
      <div className="space-y-4 pb-5">
        <FormField id={fieldId("name")} label="Group name" hint="For example, early-stage SaaS founders" error={errors.name}>
          {(control) => <Input {...control} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="off" />}
        </FormField>
        <FormField id={fieldId("targetBuyer")} label="Who do you want to find?" hint="For example, SaaS founders with small sales teams" error={errors.targetBuyer}>
          {(control) => <Input {...control} value={targetBuyer} onChange={(event) => setTargetBuyer(event.target.value)} maxLength={500} autoComplete="off" />}
        </FormField>
        <FormField
          id={fieldId("problemToSolve")}
          label="Their problem or the outcome they want"
          hint="Describe it the way they would when asking for help."
          error={errors.problemToSolve}
        >
          {(control) => (
            <Textarea {...control} value={problemToSolve} onChange={(event) => setProblemToSolve(event.target.value)} maxLength={700} className="min-h-24" />
          )}
        </FormField>
      </div>

      <div className="py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm leading-5 font-semibold text-foreground">Search detail</h3>
            <p className="text-xs leading-5 text-subtle">Optional. Add words and places only when they sharpen the scan.</p>
          </div>
          <Button type="button" size="sm" variant="outline" aria-expanded={showDetail} aria-controls={`${FORM_ID}-detail`} onClick={() => setShowDetail((current) => !current)}>
            {showDetail ? "Hide detail" : "Add detail"}
            <ChevronDown className={showDetail ? "size-3.5 rotate-180" : "size-3.5"} aria-hidden="true" />
          </Button>
        </div>
        {showDetail ? (
          <div id={`${FORM_ID}-detail`} className="mt-4 space-y-4">
            <FormField id={fieldId("includeTerms")} label="Words people might use" hint="One per line. For example, trial signups dropped" error={errors.includeTerms} optional>
              {(control) => <Textarea {...control} value={includeTerms} onChange={(event) => setIncludeTerms(event.target.value)} className="min-h-20" />}
            </FormField>
            <FormField id={fieldId("excludeTerms")} label="Leave out conversations about" hint="One per line. For example, job hunting" error={errors.excludeTerms} optional>
              {(control) => <Textarea {...control} value={excludeTerms} onChange={(event) => setExcludeTerms(event.target.value)} className="min-h-20" />}
            </FormField>
            <FormField
              id={fieldId("suggestedPlaces")}
              label="Communities to prioritise"
              hint="One per line. Prefix a source, such as github:owner/repo or lemmy:saas, to search only there. Plain notes guide the scan without hiding other posts."
              error={errors.suggestedPlaces}
              optional
            >
              {(control) => <Textarea {...control} value={suggestedPlaces} onChange={(event) => setSuggestedPlaces(event.target.value)} className="min-h-20" />}
            </FormField>
          </div>
        ) : null}
      </div>

      <div className="py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm leading-5 font-semibold text-foreground">Sources</h3>
            <p className="text-xs leading-5 text-subtle">
              {sources.length} of {DEFAULT_SOURCES.length} public sources selected
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" aria-expanded={showSources} aria-controls={`${FORM_ID}-source-list`} onClick={() => setShowSources((current) => !current)}>
            {showSources ? "Hide sources" : "Change sources"}
            <ChevronDown className={showSources ? "size-3.5 rotate-180" : "size-3.5"} aria-hidden="true" />
          </Button>
        </div>
        {showSources ? (
          <div id={`${FORM_ID}-source-list`} className="mt-4">
            <SourcePicker idPrefix={FORM_ID} sources={sources} onToggle={toggleSource} error={errors.sources} />
          </div>
        ) : null}
      </div>

      <div className="space-y-3 pt-5">
        {failure ? <OutcomeNotice outcome={failure} /> : null}
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save and start scan"}
        </Button>
      </div>
    </form>
  );
}

export function NewBuyerGroupSheet({ onCreate }: { onCreate: CreateGroup }) {
  const [open, setOpen] = useState(false);

  const create: CreateGroup = async (input) => {
    const result = await onCreate(input);
    if (result.ok) setOpen(false);
    return result;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button">
          <Plus className="size-4" aria-hidden="true" />
          Create buyer group
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-0 overflow-y-auto bg-card p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-lg leading-7 font-semibold text-foreground">Create buyer group</SheetTitle>
          <SheetDescription className="text-sm leading-6 text-muted-foreground">
            One audience and one real problem. Arcli starts scanning public sources when you save.
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 py-5">
          <BuyerGroupForm onCreate={create} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
