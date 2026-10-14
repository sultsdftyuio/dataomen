"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";

import { submitAssistedProspectVerdict, type VerdictSubmissionState } from "./actions";
import type { AssistedProspect, ProspectVerdict } from "./data";
import { nameFor } from "./labels";

export type SaveNotice = {
  kind: "saving" | "saved" | "failed";
  prospectId: string;
  name: string;
  verdict: ProspectVerdict;
  /** Only shown while this prospect is the open file (null: show it with the empty list). */
  showWith: string | null;
  message?: string;
};

type SaveOptions = {
  showWith: string | null;
  /** Called after a failed save has been rolled back, e.g. to reopen the prospect. */
  onFailure: () => void;
};

const idleState: VerdictSubmissionState = { ok: false, message: "" };
const unreachableMessage = "Your verdict wasn't saved. Check your connection and try again.";

/**
 * Saves verdicts optimistically. The new verdict shows at once, so the row
 * can move to its new bucket and the queue can advance without waiting for
 * the server. A failed save restores the previous verdict and reports why.
 * The notice lives here, outside the per-prospect UI, so a confirmation
 * survives the selection moving on to the next prospect.
 */
export function useVerdictSaves(delivered: AssistedProspect[]) {
  const [overrides, setOverrides] = useState<Record<string, ProspectVerdict | null>>({});
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [, startTransition] = useTransition();
  // Mirrors savingIds for the click guard, so a double click can't race a render.
  const inFlight = useRef(new Set<string>());

  const prospects = useMemo(
    () =>
      delivered.map((prospect) => {
        if (!(prospect.id in overrides)) return prospect;
        const verdict = overrides[prospect.id];
        return verdict === prospect.my_verdict ? prospect : { ...prospect, my_verdict: verdict };
      }),
    [delivered, overrides],
  );

  const save = useCallback(
    (prospect: AssistedProspect, verdict: ProspectVerdict, { showWith, onFailure }: SaveOptions) => {
      if (inFlight.current.has(prospect.id) || prospect.my_verdict === verdict) return;
      const setSaving = (id: string, saving: boolean) => {
        if (saving) inFlight.current.add(id);
        else inFlight.current.delete(id);
        setSavingIds(new Set(inFlight.current));
      };
      const previous = prospect.my_verdict;
      const name = nameFor(prospect);

      setSaving(prospect.id, true);
      setOverrides((current) => ({ ...current, [prospect.id]: verdict }));
      setNotice({ kind: "saving", prospectId: prospect.id, name, verdict, showWith });

      startTransition(async () => {
        let result: VerdictSubmissionState;
        try {
          const formData = new FormData();
          formData.set("deliveryId", prospect.id);
          formData.set("verdict", verdict);
          result = await submitAssistedProspectVerdict(idleState, formData);
        } catch (error) {
          console.error("[AssistedProspects] Verdict request failed", error);
          result = { ok: false, message: unreachableMessage };
        }

        setSaving(prospect.id, false);
        if (result.ok) {
          // Leave a newer save's notice alone.
          setNotice((current) =>
            current?.prospectId === prospect.id && current.verdict === verdict
              ? { ...current, kind: "saved" }
              : current,
          );
          return;
        }
        setOverrides((current) => ({ ...current, [prospect.id]: previous }));
        setNotice({
          kind: "failed",
          prospectId: prospect.id,
          name,
          verdict,
          showWith: prospect.id,
          message: result.message || unreachableMessage,
        });
        onFailure();
      });
    },
    [],
  );

  return { prospects, save, savingIds, notice };
}
