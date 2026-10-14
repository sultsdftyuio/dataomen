import type { KeyboardEvent, RefObject } from "react";

import { StatusBadge } from "@/components/ui/status-badge";

import type { AssistedProspect } from "./data";
import { fullDate, shortDate } from "./dates";
import { nameFor, verdictLabels, verdictTone } from "./labels";
import { TierLabel } from "./tier-label";

type ProspectListProps = {
  prospects: AssistedProspect[];
  selectedId: string | null;
  /** Outside "To review", each row carries its saved verdict so nobody has to open every file. */
  showVerdicts: boolean;
  rowRefs: RefObject<Map<string, HTMLButtonElement>>;
  onSelect: (prospect: AssistedProspect) => void;
  onStep: (offset: number) => void;
};

export function ProspectList({ prospects, selectedId, showVerdicts, rowRefs, onSelect, onStep }: ProspectListProps) {
  // Arrow keys move through the rows, like J and K, and carry focus with them.
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      onStep(event.key === "ArrowDown" ? 1 : -1);
    }
  };

  return (
    <ul aria-label="Prospects" className="divide-y divide-border" onKeyDown={onKeyDown}>
      {prospects.map((prospect) => {
        const selected = prospect.id === selectedId;
        return (
          <li key={prospect.id}>
            <button
              ref={(node) => {
                if (node) rowRefs.current.set(prospect.id, node);
                else rowRefs.current.delete(prospect.id);
              }}
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(prospect)}
              className="arc-today__row flex w-full flex-col gap-1 px-4 py-3 text-left outline-none hover:bg-off-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-[current=true]:bg-accent"
            >
              <span className="flex w-full items-baseline justify-between gap-3">
                <span className="truncate text-sm leading-5 font-semibold text-foreground">{nameFor(prospect)}</span>
                <time
                  dateTime={prospect.delivered_at}
                  title={`Delivered ${fullDate(prospect.delivered_at)}`}
                  suppressHydrationWarning
                  className="shrink-0 text-xs tabular-nums text-subtle"
                >
                  {shortDate(prospect.delivered_at)}
                </time>
              </span>
              <span className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">
                {prospect.signal_summary || prospect.fit_summary}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <TierLabel tier={prospect.tier} />
                {showVerdicts && prospect.my_verdict ? (
                  <StatusBadge size="compact" tone={verdictTone(prospect.my_verdict)}>
                    {verdictLabels[prospect.my_verdict]}
                  </StatusBadge>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
