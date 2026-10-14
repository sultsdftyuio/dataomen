"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The targeting brief is stored in two places (the website profile, saved
 * through the settings API, and the target universe, saved through a server
 * action). Each editor registers here so the page has one save bar and one
 * outcome. Saving one part used to refresh the page and silently replace the
 * other part's unsaved edits.
 */

export type BriefSaveOutcome = { ok: boolean; message: string };

type SectionSaver = () => Promise<BriefSaveOutcome>;
/** Returns a failure to block the whole save, or null when the section is valid. */
type SectionValidator = () => BriefSaveOutcome | null;
type SectionHandlers = { save: SectionSaver; validate: SectionValidator };

type SectionReport = { changeCount: number; saveLabel: string };

type BriefSaveRegistry = {
  report: (id: string, report: SectionReport, handlers: SectionHandlers) => void;
  remove: (id: string) => void;
  isSaving: boolean;
};

const BriefSaveContext = createContext<BriefSaveRegistry | null>(null);

const SUCCESS_VISIBLE_MS = 6_000;

export function useBriefSaveSection(
  id: string,
  {
    changeCount,
    saveLabel,
    save,
    validate,
  }: {
    changeCount: number;
    saveLabel: string;
    save: SectionSaver;
    validate: SectionValidator;
  },
) {
  const registry = useContext(BriefSaveContext);
  // The latest closures are read at save time, so registration does not need
  // to re-run on every render just because the function identities changed.
  const handlersRef = useRef({ save, validate });
  useEffect(() => {
    handlersRef.current = { save, validate };
  });

  const report = registry?.report;
  const remove = registry?.remove;
  useEffect(() => {
    report?.(id, { changeCount, saveLabel }, {
      save: () => handlersRef.current.save(),
      validate: () => handlersRef.current.validate(),
    });
  }, [report, id, changeCount, saveLabel]);

  useEffect(() => () => remove?.(id), [remove, id]);

  return { isSaving: registry?.isSaving ?? false };
}

function changesLabel(count: number) {
  return `${count} unsaved ${count === 1 ? "change" : "changes"}`;
}

export function BriefSaveProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [reports, setReports] = useState<Record<string, SectionReport>>({});
  const handlersRef = useRef(new Map<string, SectionHandlers>());
  const [outcome, setOutcome] = useState<BriefSaveOutcome | null>(null);
  const [isSaving, startSaving] = useTransition();

  const report = useCallback(
    (id: string, next: SectionReport, handlers: SectionHandlers) => {
      handlersRef.current.set(id, handlers);
      setReports((current) => {
        const previous = current[id];
        if (
          previous?.changeCount === next.changeCount &&
          previous.saveLabel === next.saveLabel
        ) {
          return current;
        }
        return { ...current, [id]: next };
      });
    },
    [],
  );

  const remove = useCallback((id: string) => {
    handlersRef.current.delete(id);
    setReports((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const registry = useMemo(
    () => ({ report, remove, isSaving }),
    [report, remove, isSaving],
  );

  const dirtySections = Object.entries(reports).filter(
    ([, section]) => section.changeCount > 0,
  );
  const totalChanges = dirtySections.reduce(
    (sum, [, section]) => sum + section.changeCount,
    0,
  );
  const saveLabel =
    dirtySections.length === 1 ? dirtySections[0][1].saveLabel : "Save all changes";

  useEffect(() => {
    if (!outcome?.ok) return;
    const timer = window.setTimeout(() => setOutcome(null), SUCCESS_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [outcome]);

  const saveAll = () => {
    const ids = dirtySections.map(([id]) => id);
    // Validate everything first: an invalid part blocks the whole save, so a
    // half-saved brief never needs explaining. Runs before inputs are disabled
    // so a section can move focus to its invalid field.
    const invalid = ids
      .map((id) => handlersRef.current.get(id)?.validate() ?? null)
      .filter((result): result is BriefSaveOutcome => result !== null);
    if (invalid.length > 0) {
      setOutcome({ ok: false, message: invalid.map((result) => result.message).join(" ") });
      return;
    }

    setOutcome(null);
    startSaving(async () => {
      const outcomes: BriefSaveOutcome[] = [];
      // Sequential on purpose: each save may refresh the page's server data,
      // and the editors keep unsaved edits across those refreshes.
      for (const id of ids) {
        const handlers = handlersRef.current.get(id);
        if (handlers) outcomes.push(await handlers.save());
      }

      const hasFailure = outcomes.some((result) => !result.ok);
      setOutcome(
        hasFailure
          ? // Name what did save as well as what didn't, so a partial save is clear.
            { ok: false, message: outcomes.map((result) => result.message).join(" ") }
          : {
              ok: true,
              message: outcomes.length === 1 ? outcomes[0].message : "Changes saved.",
            },
      );
      if (outcomes.length > 0) router.refresh();
    });
  };

  const showBar = totalChanges > 0 || isSaving || outcome !== null;

  return (
    <BriefSaveContext.Provider value={registry}>
      {children}
      {showBar ? (
        <div
          role="region"
          aria-label="Save targeting brief"
          className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-lg border border-border bg-card py-2.5 pl-4 pr-2.5 shadow-lg"
        >
          <div className="min-w-0 flex-1 text-sm leading-5" aria-live="polite">
            {outcome && !outcome.ok ? (
              <p className="flex items-start gap-2 text-danger">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {outcome.message}
              </p>
            ) : outcome?.ok && totalChanges === 0 ? (
              <p className="flex items-start gap-2 text-success">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {outcome.message}
              </p>
            ) : (
              <p className="text-foreground">
                {isSaving ? "Saving your changes…" : changesLabel(totalChanges)}
              </p>
            )}
          </div>
          {totalChanges > 0 || isSaving ? (
            <Button
              type="button"
              disabled={isSaving}
              onClick={saveAll}
            >
              {isSaving ? (
                <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />
              ) : null}
              {isSaving ? "Saving…" : saveLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </BriefSaveContext.Provider>
  );
}
