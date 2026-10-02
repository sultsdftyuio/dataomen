import { FileSearch, Route, ShieldAlert } from "lucide-react";

import { C } from "@/lib/tokens";

/** Illustrative prospect-file layout; it does not represent a delivered customer result. */
export function SourceExample() {
  return (
    <article className="mx-auto mt-9 max-w-[860px] overflow-hidden rounded-[18px] border bg-white shadow-sm" style={{ borderColor: C.rule }}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 sm:px-6" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: C.blue }}>Illustrative prospect file</p>
          <h3 className="mt-1 text-lg font-semibold" style={{ color: C.navy }}>Example software company</h3>
          <p className="mt-1 text-xs" style={{ color: C.muted }}>High-fit account · facts from an official company page</p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: C.greenPale, color: C.green }}>
          Fit-based prospect
        </span>
      </div>

      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: C.navy }}>
            <FileSearch className="size-4" style={{ color: C.blue }} aria-hidden="true" /> Why it fits
          </p>
          <p className="mt-3 text-sm leading-6" style={{ color: C.navySoft }}>
            A cited product fact matches the offer and account criteria in the approved targeting brief.
          </p>
          <p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>A real delivery includes the source link and the date it was checked.</p>
        </div>

        <div>
          <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: C.navy }}>
            <Route className="size-4" style={{ color: C.blue }} aria-hidden="true" /> How to act
          </p>
          <p className="mt-3 text-sm leading-6" style={{ color: C.navySoft }}>
            Use the documented workflow as a specific opening angle. A business contact or public reply route is checked before delivery.
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.amber }}>
            <ShieldAlert className="size-3.5" aria-hidden="true" /> No recent buying signal observed
          </p>
        </div>
      </div>

      <p className="border-t px-5 py-3 text-xs leading-5 sm:px-6" style={{ borderColor: C.rule, color: C.muted }}>
        This is an illustrative format, not a live prospect, customer result, or volume claim. A delivered card must cite real sources and state what remains unknown.
      </p>
    </article>
  );
}
