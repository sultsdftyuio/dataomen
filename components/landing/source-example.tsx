import { ExternalLink, FileSearch, ShieldAlert } from "lucide-react";

import { C } from "@/lib/tokens";

const SOURCE_URL = "https://news.ycombinator.com/item?id=43755094";

/** A cited public example of relevance that stops short of claiming purchase intent. */
export function SourceExample() {
  return (
    <article className="mx-auto mt-9 max-w-[860px] overflow-hidden rounded-[18px] border bg-white shadow-sm" style={{ borderColor: C.rule }}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4 sm:px-6" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: C.blue }}>Public discussion example</p>
          <h3 className="mt-1 text-lg font-semibold" style={{ color: C.navy }}>How to find users to talk to</h3>
          <p className="mt-1 text-xs" style={{ color: C.muted }}>Hacker News · v1log · April 21, 2025 · historical example</p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: C.amberPale, color: C.amber }}>
          Research signal, not a qualified buyer
        </span>
      </div>

      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: C.navy }}>
            <FileSearch className="size-4" style={{ color: C.blue }} aria-hidden="true" /> Original evidence
          </p>
          <blockquote className="mt-3 border-l-2 pl-3 text-sm leading-6" style={{ borderColor: C.blueLight, color: C.navySoft }}>
            “My question is how do you find users and customers?”
          </blockquote>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-2" style={{ color: C.blue }}>
            Read the original discussion <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>

        <div>
          <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: C.navy }}>
            <ShieldAlert className="size-4" style={{ color: C.amber }} aria-hidden="true" /> Review before outreach
          </p>
          <p className="mt-3 text-sm leading-6" style={{ color: C.navySoft }}>
            The author describes a customer-discovery problem. The post does not show that they
            want to buy a monitoring tool, and it is too old to treat as a fresh opportunity.
          </p>
          <p className="mt-2 text-xs font-semibold" style={{ color: C.navy }}>Useful for research; not sales-ready.</p>
        </div>
      </div>

      <p className="border-t px-5 py-3 text-xs leading-5 sm:px-6" style={{ borderColor: C.rule, color: C.muted }}>
        Manually selected to illustrate evidence and uncertainty. This is not a result produced by Arcli or a claim about current lead volume.
      </p>
    </article>
  );
}
