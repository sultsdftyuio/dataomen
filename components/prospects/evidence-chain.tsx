import type { ReactNode } from "react";
import { Check, X } from "lucide-react";

import { isScreenedMatch } from "@/app/(dashboard)/dashboard/lead-queue-filter";
import type { QualifiedLeadView } from "@/app/(dashboard)/dashboard/prospect-types";
import {
  SourcePlatformMark,
  exactDateTime,
  relativeTime,
  signalLabel,
  sourceDisplayName,
} from "@/components/prospects/lead-desk-presentation";
import { cn } from "@/lib/utils";

/**
 * What a step tells you: "pass" and "fail" are checks Arcli made, "info" is
 * a fact it read from the post, "unknown" is something the post doesn't say.
 */
type StepKind = "source" | "pass" | "fail" | "info" | "unknown";

type ChainStep = {
  key: string;
  kind: StepKind;
  label: string;
  body: ReactNode;
};

const NODE_STYLES: Record<Exclude<StepKind, "source">, string> = {
  pass: "bg-primary text-primary-foreground",
  fail: "bg-muted text-navy-soft ring-1 ring-inset ring-border",
  info: "bg-blue-pale text-primary",
  unknown: "border border-dashed border-warning bg-warning-pale text-warning",
};

const NODE_LABELS: Record<Exclude<StepKind, "source">, string> = {
  pass: "Found",
  fail: "Not found",
  info: "Noted",
  unknown: "Not stated",
};

function StepNode({ kind, source }: { kind: StepKind; source: string }) {
  if (kind === "source") return <SourcePlatformMark source={source} />;

  return (
    <span
      role="img"
      aria-label={NODE_LABELS[kind]}
      className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", NODE_STYLES[kind])}
    >
      {kind === "pass" ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" /> : null}
      {kind === "fail" ? <X className="size-3.5" strokeWidth={2.5} aria-hidden="true" /> : null}
      {kind === "info" ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {kind === "unknown" ? <span className="text-xs font-bold" aria-hidden="true">?</span> : null}
    </span>
  );
}

function listInWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/**
 * The checks behind a verdict, in reading order. Every step comes from a
 * field the verifier stored; nothing is inferred here. A screened-out post
 * stops at the failed problem check, because its other fields were never
 * judged.
 */
function chainSteps(lead: QualifiedLeadView): ChainStep[] {
  const post = lead.sourcePost;
  const postedAt = post.publishedAt ?? lead.matchedAt;
  const quote = lead.evidenceExcerpt?.trim() || null;
  const sourceText = post.text?.trim() || null;
  const where = [
    sourceDisplayName(post.source),
    post.community ? `in ${post.community}` : null,
    post.author ? `by ${post.author}` : null,
  ].filter(Boolean).join(" ");

  const steps: ChainStep[] = [
    {
      key: "heard",
      kind: "source",
      label: "Heard",
      body: (
        <div className="space-y-2">
          <p className="text-sm text-navy-soft">
            {where}, <time className="tabular-nums" title={exactDateTime(postedAt)}>{relativeTime(postedAt)}</time>
          </p>
          <figure>
            <figcaption className="sr-only">{quote ? "Verified quote" : "From the post"}</figcaption>
            <blockquote className="line-clamp-4 rounded-md bg-blue-tint px-3.5 py-2.5 text-sm leading-6 text-navy-soft">
              {quote ?? sourceText ?? "No text was kept for this post. Open the source to read it."}
            </blockquote>
          </figure>
        </div>
      ),
    },
  ];

  if (isScreenedMatch(lead)) {
    steps.push({
      key: "problem",
      kind: "fail",
      label: "Problem",
      body: (
        <p className="text-sm leading-6 text-navy-soft">
          <span className="font-semibold text-foreground">No close match. </span>
          {lead.matchReason}
        </p>
      ),
    });
    return steps;
  }

  steps.push({
    key: "problem",
    kind: "pass",
    label: "Problem",
    body: (
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground first-letter:uppercase">{signalLabel(lead)}</p>
        <p className="text-sm leading-6 text-navy-soft">{lead.matchReason}</p>
      </div>
    ),
  });

  const unstated: string[] = [];

  if (lead.urgencyReason) {
    steps.push({
      key: "timing",
      kind: "pass",
      label: "Timing",
      body: <p className="text-sm leading-6 text-navy-soft">&ldquo;{lead.urgencyReason}&rdquo;</p>,
    });
  } else {
    unstated.push("how urgent this is");
  }

  if (lead.purchaseStage) {
    steps.push({
      key: "stage",
      kind: "info",
      label: "Buying stage",
      body: <p className="text-sm text-navy-soft first-letter:uppercase">{lead.purchaseStage.replace(/_/g, " ")}</p>,
    });
  } else {
    unstated.push("where they are in buying");
  }

  if (lead.competitorMention) {
    steps.push({
      key: "mentioned",
      kind: "info",
      label: "Also mentioned",
      body: <p className="text-sm text-navy-soft">{lead.competitorMention}</p>,
    });
  }

  if (unstated.length > 0) {
    steps.push({
      key: "unknown",
      kind: "unknown",
      label: "Not stated",
      body: <p className="text-sm leading-6 text-navy-soft">The post doesn&apos;t say {listInWords(unstated)}.</p>,
    });
  }

  return steps;
}

/** Arcli's reasoning as a chain: where it heard this, then each check. */
export function EvidenceChain({ lead }: { lead: QualifiedLeadView }) {
  const steps = chainSteps(lead);

  return (
    <ol aria-label="What Arcli checked" className="flex flex-col">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.key} className="flex gap-3">
            <div className="flex w-7 shrink-0 flex-col items-center">
              <StepNode kind={step.kind} source={lead.sourcePost.source} />
              {isLast ? null : <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />}
            </div>
            <div className={cn("min-w-0 flex-1 pt-1", !isLast && "pb-5")}>
              <p className={cn("text-xs font-semibold", step.kind === "unknown" ? "text-warning" : "text-subtle")}>{step.label}</p>
              <div className="mt-1">{step.body}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
