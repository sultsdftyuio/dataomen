"use client";

import { useEffect, useState } from "react";
import { Check, CircleHelp, Copy, ExternalLink, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trackProductEvent } from "@/lib/analytics/product-events";
import {
  isPotentialBuyer,
  isVerifiedLead,
  leadCategoryLabel,
} from "@/app/(dashboard)/dashboard/lead-queue-filter";
import { sourceDisplayName } from "@/components/prospects/lead-desk-presentation";
import type { QualifiedLeadView } from "@/app/(dashboard)/dashboard/prospect-types";

type CopyState = "idle" | "copied" | "empty" | "error";

const COPY_MESSAGES: Record<CopyState, string | null> = {
  idle: null,
  copied: "Reply copied.",
  empty: "Write a reply before copying it.",
  error: "Couldn't copy the reply. Select the text and copy it yourself.",
};

/**
 * Source link and qualification for one prospect. Only a verifier-confirmed
 * lead can be qualified (which can also export it to a CRM). The server and
 * RLS policy enforce the same boundary; keeping it explicit here prevents a
 * misleading action on a Maybe or a screened-out record.
 */
export function LeadOutreachActions({
  lead,
  reviewOnly,
  sourceIsPrimary,
  qualificationPending,
  onQualify,
}: {
  lead: QualifiedLeadView;
  reviewOnly: boolean;
  /** Filled when there is no reply to copy, so the view keeps one primary action. */
  sourceIsPrimary: boolean;
  qualificationPending: boolean;
  onQualify: (leadId: string) => void;
}) {
  const isReviewOnly = reviewOnly || lead.matchStatus === "discovery_candidate" || !isVerifiedLead(lead);
  const isQualified = lead.matchStatus === "qualified";

  const sourceAction = lead.sourcePost.url ? (
    <Button asChild variant={sourceIsPrimary ? "default" : "outline"}>
      <a href={lead.sourcePost.url} target="_blank" rel="noopener noreferrer">
        <ExternalLink aria-hidden="true" />
        Open {sourceDisplayName(lead.sourcePost.source)}
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </Button>
  ) : null;

  const qualificationAction = !isReviewOnly ? (
    isQualified ? null : (
      <Button type="button" variant="outline" onClick={() => onQualify(lead.id)} disabled={qualificationPending}>
        <Check aria-hidden="true" />
        {qualificationPending ? "Qualifying…" : "Mark qualified"}
      </Button>
    )
  ) : null;

  return (
    <>
      {sourceAction}
      {qualificationAction}
    </>
  );
}

/** Review-only guidance shown in place of qualification for a Maybe. */
export function ReviewOnlyNotice({ lead }: { lead: QualifiedLeadView }) {
  if (!isPotentialBuyer(lead)) return null;

  return (
    <p className="flex items-start gap-2 rounded-md bg-warning-pale px-3 py-2 text-sm leading-5 text-warning">
      <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {"Not verified, so it can't be qualified or exported yet. Read the original post before you reply."}
    </p>
  );
}

// Editable reply draft for one prospect. Drafts are kept per prospect in
// localStorage so switching prospects never loses edits.
export function LeadOutreach({ lead }: { lead: QualifiedLeadView }) {
  const [draft, setDraft] = useState(lead.suggestedReply);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [restoredLocalDraft, setRestoredLocalDraft] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const draftStorageKey = `arcli:reply-draft:${lead.id}`;
  const draftId = `suggested-reply-${lead.id}`;
  const isEdited = draft !== lead.suggestedReply;

  useEffect(() => {
    setIsDraftReady(false);
    setRestoredLocalDraft(false);

    try {
      const savedDraft = window.localStorage.getItem(draftStorageKey);
      const shouldRestore = Boolean(savedDraft && savedDraft !== lead.suggestedReply);
      setDraft(savedDraft ?? lead.suggestedReply);
      setRestoredLocalDraft(shouldRestore);
    } catch {
      setDraft(lead.suggestedReply);
    } finally {
      setIsDraftReady(true);
    }
  }, [draftStorageKey, lead.suggestedReply]);

  useEffect(() => {
    if (!isDraftReady) return;

    try {
      if (draft.trim() && draft !== lead.suggestedReply) {
        window.localStorage.setItem(draftStorageKey, draft);
      } else {
        window.localStorage.removeItem(draftStorageKey);
      }
    } catch {
      // Draft persistence is a quality-of-life enhancement, so a restrictive
      // browser privacy setting should never block outreach work.
    }
  }, [draft, draftStorageKey, isDraftReady, lead.suggestedReply]);

  useEffect(() => {
    if (copyState !== "copied") return;

    const timeoutId = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  const copyDraft = async () => {
    if (!draft.trim()) {
      setCopyState("empty");
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setCopyState("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(draft);
      setCopyState("copied");
      trackProductEvent("reply_copied", {
        bucket: leadCategoryLabel(lead),
        source: lead.sourcePost.source,
        edited: draft !== lead.suggestedReply,
      });
    } catch {
      setCopyState("error");
    }
  };

  const resetDraft = () => {
    setDraft(lead.suggestedReply);
    setRestoredLocalDraft(false);
  };

  const draftNote = restoredLocalDraft
    ? "Restored your saved draft"
    : isDraftReady && isEdited
      ? "Saved in this browser"
      : null;
  const copyMessage = COPY_MESSAGES[copyState];

  return (
    <section aria-labelledby={`${draftId}-label`} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={draftId} id={`${draftId}-label`} className="text-sm font-medium text-foreground">
          Suggested reply
        </label>
        {/* Only speak up once the draft differs from the generated one. */}
        <p className="text-xs text-subtle" aria-live="polite">{draftNote}</p>
      </div>

      <Textarea
        id={draftId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Write a reply to post on the original conversation."
        className="min-h-28 resize-y bg-card leading-6 text-foreground"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={copyDraft}>
          {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copyState === "copied" ? "Copied" : "Copy reply"}
        </Button>
        {isEdited ? (
          <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={resetDraft}>
            <RotateCcw aria-hidden="true" />
            Reset to suggestion
          </Button>
        ) : null}
        <p
          className={cn("text-xs", copyState === "copied" ? "sr-only" : "text-danger")}
          aria-live="polite"
        >
          {copyMessage}
        </p>
      </div>
    </section>
  );
}
