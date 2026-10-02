"use client";

import { useActionState } from "react";

import { submitAssistedProspectVerdict } from "./actions";
import type { ProspectVerdict } from "./data";

const labels: Record<ProspectVerdict, string> = {
  worth_contacting: "Worth contacting",
  wrong_fit: "Wrong fit",
  already_known: "Already known",
  no_route: "No usable route",
  bad_evidence: "Bad evidence",
  not_now: "Not now",
  contacted: "Contacted",
  meeting: "Meeting booked",
};

export function VerdictForm({
  deliveryId,
  currentVerdict,
}: {
  deliveryId: string;
  currentVerdict: ProspectVerdict | null;
}) {
  const [state, action, pending] = useActionState(
    submitAssistedProspectVerdict,
    { ok: false, message: "" },
  );
  return (
    <form action={action} className="mt-4 flex flex-wrap items-center gap-2">
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <span className="mr-1 text-xs font-medium text-slate-600">Your assessment:</span>
      {(Object.keys(labels) as ProspectVerdict[]).map((verdict) => (
        <button
          key={verdict}
          type="submit"
          name="verdict"
          value={verdict}
          disabled={pending}
          aria-pressed={currentVerdict === verdict}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${currentVerdict === verdict ? "border-blue-700 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:border-blue-500"}`}
        >
          {labels[verdict]}
        </button>
      ))}
      {state.message ? (
        <p role="status" className={`w-full text-xs ${state.ok ? "text-green-700" : "text-red-700"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
