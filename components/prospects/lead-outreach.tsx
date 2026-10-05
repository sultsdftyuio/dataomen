"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  MessageSquareText,
  Radar,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sourceDisplayName } from "@/components/prospects/lead-desk-presentation";
import { C } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { trackProductEvent } from "@/lib/analytics/product-events";
import {
  isScreenedMatch,
  isVerifiedLead,
  leadCategoryLabel,
} from "@/app/(dashboard)/dashboard/lead-queue-filter";
import type { QualifiedLeadView } from "@/app/(dashboard)/dashboard/prospect-types";

// Editable reply draft plus source/qualify actions for one lead. Drafts are
// kept per lead in localStorage so switching leads never loses edits.
export function LeadOutreach({
  lead,
  disabled,
  qualificationMessage,
  onQualify,
  reviewOnly,
  compact = false,
  showQualification = true,
  showSourceAction = true,
}: {
  lead: QualifiedLeadView;
  disabled: boolean;
  qualificationMessage: string | null;
  onQualify: (leadId: string) => void;
  reviewOnly: boolean;
  compact?: boolean;
  showQualification?: boolean;
  /** Off when the surrounding panel already renders its own source link. */
  showSourceAction?: boolean;
}) {
  const [draft, setDraft] = useState(lead.suggestedReply);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [restoredLocalDraft, setRestoredLocalDraft] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "empty" | "error">(
    "idle",
  );
  const isQualified = lead.matchStatus === "qualified";
  const draftStorageKey = `arcli:reply-draft:${lead.id}`;
  const sourceName = sourceDisplayName(lead.sourcePost.source);
  // Relevant and screened opportunities are useful evidence to inspect, but only a
  // verifier-confirmed lead can be promoted. The server and RLS policy enforce
  // the same boundary; keeping it explicit prevents a misleading CRM action.
  const isReviewOnly = reviewOnly || lead.matchStatus === "discovery_candidate" || !isVerifiedLead(lead);
  const hasSuggestedReply = Boolean(lead.suggestedReply.trim());
  const draftId = `suggested-reply-${lead.id}`;

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

  const copyMessage =
    copyState === "copied"
      ? "Draft copied."
      : copyState === "empty"
        ? "Add a draft before copying."
        : copyState === "error"
          ? "Could not copy the draft."
          : null;

  const resetDraft = () => {
    setDraft(lead.suggestedReply);
    setRestoredLocalDraft(false);
  };

  const sourceAction = !showSourceAction ? null : lead.sourcePost.url ? (
    <Button asChild size="sm" style={{ backgroundColor: C.blue, color: C.white }}>
      <a href={lead.sourcePost.url} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="size-4" />
        <span className="hidden sm:inline">Open on {sourceName}</span>
        <span className="sm:hidden">Open source</span>
      </a>
    </Button>
  ) : (
    <Button type="button" size="sm" disabled>
      <ExternalLink className="size-4" />
      Source unavailable
    </Button>
  );

  const qualificationAction = !isReviewOnly ? (
    showQualification ? (
      <Button
        type="button"
        size="sm"
        disabled={disabled || isQualified}
        onClick={() => onQualify(lead.id)}
        style={{ backgroundColor: C.green, color: C.white }}
      >
        {disabled ? (
          <Radar className="size-4 animate-spin" />
        ) : isQualified ? (
          <Check className="size-4" />
        ) : (
          <ShieldCheck className="size-4" />
        )}
        {disabled ? "Qualifying..." : isQualified ? "Qualified" : "Mark qualified"}
      </Button>
    ) : null
  ) : null;

  const reviewOnlyNotice = isReviewOnly ? (
    <p className="text-xs font-medium" style={{ color: isScreenedMatch(lead) ? C.red : C.amber }}>
      {isScreenedMatch(lead)
        ? "Screened out — for inspection only, not outreach."
        : "Maybe — check the evidence first. It can't be qualified or exported yet."}
    </p>
  ) : null;

  if (!hasSuggestedReply) {
    return (
      <section
        aria-label="Lead actions"
        className={cn("rounded-md border", compact ? "p-3" : "p-4")}
        style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {sourceAction}
          {qualificationAction}
          {isQualified ? (
            <Badge
              variant="outline"
              className="rounded-md"
              style={{
                borderColor: C.green,
                backgroundColor: C.greenPale,
                color: C.green,
              }}
            >
              <Check className="size-3" />
              Qualified
            </Badge>
          ) : null}
        </div>
        {reviewOnlyNotice ? <div className="mt-2">{reviewOnlyNotice}</div> : null}
        {qualificationMessage ? (
          <p className="mt-2 text-xs font-medium" aria-live="polite" style={{ color: C.navySoft }}>
            {qualificationMessage}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-labelledby={`${draftId}-label`}
      className={cn("rounded-md border", compact ? "p-3" : "p-4")}
      style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <label
            htmlFor={draftId}
            id={`${draftId}-label`}
            className="flex items-center gap-2 text-xs font-bold uppercase"
            style={{ color: C.blue }}
          >
            <MessageSquareText className="size-3.5" />
            Suggested reply
          </label>
        </div>
        {isQualified ? (
          <Badge
            variant="outline"
            className="rounded-md"
            style={{
              borderColor: C.green,
              backgroundColor: C.greenPale,
              color: C.green,
            }}
          >
            <Check className="size-3" />
            Qualified
          </Badge>
        ) : null}
      </div>

      <Textarea
        id={draftId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="A suggested public reply will appear here after verification."
        className={cn(
          compact ? "min-h-20" : "min-h-28",
          "resize-y bg-white text-sm leading-6",
        )}
        style={{ borderColor: C.blueLight, color: C.navy }}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px]" style={{ color: C.muted }} aria-live="polite">
          {/* Only speak up once the draft differs from the generated one. */}
          {restoredLocalDraft
            ? "Restored your saved draft."
            : isDraftReady && draft !== lead.suggestedReply
              ? "Saved in this browser."
              : null}
        </p>
        {draft !== lead.suggestedReply ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={resetDraft}
            style={{ color: C.navySoft }}
          >
            <RotateCcw className="size-3" />
            Reset
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={copyDraft}
          style={{
            borderColor: C.blueLight,
            backgroundColor: C.white,
            color: C.blue,
          }}
        >
          {copyState === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copyState === "copied" ? "Copied" : "Copy draft"}
        </Button>
        {sourceAction}
        {qualificationAction}
      </div>

      {reviewOnlyNotice ? <div className="mt-2">{reviewOnlyNotice}</div> : null}

      {copyMessage || qualificationMessage ? (
        <p className="mt-2 text-xs font-medium" aria-live="polite" style={{ color: C.navySoft }}>
          {[copyMessage, qualificationMessage].filter(Boolean).join(" ")}
        </p>
      ) : null}
    </section>
  );
}
