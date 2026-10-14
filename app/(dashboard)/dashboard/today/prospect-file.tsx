import type { ReactNode, Ref } from "react";
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronUp, CircleHelp, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { AssistedProspect } from "./data";
import { fullDate } from "./dates";
import { entityKindLabels, hostLabel, nameFor, routeActionLabels, tierDescriptions } from "./labels";
import { TierLabel } from "./tier-label";

export const FILE_TITLE_ID = "prospect-file-title";

const linkClass =
  "inline-flex items-center gap-0.5 rounded-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

type FileHeadProps = {
  prospect: AssistedProspect;
  index: number;
  total: number;
  headingRef: Ref<HTMLHeadingElement>;
  onStep: (offset: number) => void;
  onBack: () => void;
};

/**
 * The open file's name and controls. Step buttons use aria-disabled rather
 * than disabled so focus stays put when you reach either end of the list.
 */
export function ProspectFileHead({ prospect, index, total, headingRef, onStep, onBack }: FileHeadProps) {
  const atStart = index <= 0;
  const atEnd = index >= total - 1;
  return (
    <div className="arc-today__file-head flex items-start gap-2 rounded-t-lg border-b border-border bg-card px-3 py-3 lg:px-6 lg:py-4">
      <Button type="button" variant="ghost" size="icon-sm" className="mt-0.5 lg:hidden" onClick={onBack} aria-label="Back to the list">
        <ArrowLeft aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1">
        <h2
          ref={headingRef}
          id={FILE_TITLE_ID}
          tabIndex={-1}
          className="text-lg leading-7 font-semibold text-balance text-foreground outline-none lg:text-xl"
        >
          {nameFor(prospect)}
        </h2>
        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs leading-5 text-subtle">
          <span>
            {entityKindLabels[prospect.entity_kind]}, delivered{" "}
            <time dateTime={prospect.delivered_at}>{fullDate(prospect.delivered_at)}</time>
          </span>
          <ExternalLink href={prospect.entity_url}>{hostLabel(prospect.entity_url)}</ExternalLink>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="mr-1 hidden text-xs tabular-nums text-subtle sm:inline">
          {index + 1} of {total}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Previous prospect"
          title="Previous (K)"
          aria-disabled={atStart}
          onClick={() => !atStart && onStep(-1)}
          className="aria-disabled:cursor-default aria-disabled:opacity-40"
        >
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Next prospect"
          title="Next (J)"
          aria-disabled={atEnd}
          onClick={() => !atEnd && onStep(1)}
          className="aria-disabled:cursor-default aria-disabled:opacity-40"
        >
          <ChevronDown aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function FactList({ children }: { children: ReactNode }) {
  return <dl className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px] leading-5">{children}</dl>;
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-subtle">{term}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </>
  );
}

/**
 * The evidence behind a delivery. Each claim sits with its own source: the
 * fit with the page that shows it, the signal with where it was seen. These
 * are Arcli's summaries, so they are set as plain text, not as quotations.
 */
export function ProspectEvidence({ prospect }: { prospect: AssistedProspect }) {
  return (
    <div className="mx-auto flex max-w-[72ch] flex-col gap-6 px-4 py-5 lg:px-6 lg:py-6">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <TierLabel tier={prospect.tier} className="text-[13px]" />
        <span className="text-[13px] leading-5 text-muted-foreground">{tierDescriptions[prospect.tier]}</span>
      </p>

      <section aria-labelledby="file-fit">
        <h3 id="file-fit" className="text-sm leading-6 font-semibold text-foreground">Why it fits</h3>
        <p className="mt-1 text-sm leading-6 text-foreground">{prospect.fit_summary}</p>
        <FactList>
          <Fact term="Likely buyer">{prospect.buyer_role}</Fact>
          <Fact term="Source">
            <ExternalLink href={prospect.fit_source_url}>{hostLabel(prospect.fit_source_url)}</ExternalLink>
          </Fact>
          <Fact term="Checked">{fullDate(prospect.source_checked_at)}</Fact>
        </FactList>
      </section>

      <section aria-labelledby="file-signal" className="border-t border-border pt-5">
        <h3 id="file-signal" className="text-sm leading-6 font-semibold text-foreground">Buying signal</h3>
        {prospect.signal_summary ? (
          <>
            <p className="mt-1 text-sm leading-6 text-foreground">{prospect.signal_summary}</p>
            <FactList>
              <Fact term="Source">
                {prospect.signal_source_url ? (
                  <ExternalLink href={prospect.signal_source_url}>{hostLabel(prospect.signal_source_url)}</ExternalLink>
                ) : (
                  <span className="text-subtle">Not linked</span>
                )}
              </Fact>
              {prospect.signal_date ? <Fact term="Seen">{fullDate(prospect.signal_date)}</Fact> : null}
            </FactList>
          </>
        ) : (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            No recent buying signal. This prospect was picked for fit, not because they are looking to buy now.
          </p>
        )}
      </section>

      <section aria-labelledby="file-route" className="border-t border-border pt-5">
        <h3 id="file-route" className="text-sm leading-6 font-semibold text-foreground">How to reach them</h3>
        <p className="mt-1 text-sm leading-6 text-foreground">{prospect.angle}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button asChild variant="outline" size="sm">
            <a href={prospect.contact_route_url} target="_blank" rel="noopener noreferrer">
              <MessageSquareText aria-hidden="true" />
              {routeActionLabels[prospect.contact_route_type]}
              <ArrowUpRight aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
          <span className="text-xs text-subtle">Route checked {fullDate(prospect.route_checked_at)}</span>
        </div>
      </section>

      {/* The one tinted block: open questions are a caution before reaching out. */}
      <section aria-labelledby="file-unknown" className="rounded-md bg-warning-pale px-4 py-3">
        <h3 id="file-unknown" className="flex items-center gap-2 text-sm leading-6 font-semibold text-foreground">
          <CircleHelp className="size-4 text-warning" aria-hidden="true" />
          Still unknown
        </h3>
        <p className="mt-1 text-sm leading-6 text-foreground">{prospect.uncertainty_summary}</p>
      </section>
    </div>
  );
}
