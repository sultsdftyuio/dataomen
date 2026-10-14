"use client";

import { useId, useState } from "react";
import { AlertCircle, Check, ChevronDown, CircleCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ProspectVerdict } from "./data";
import { bucketFor, passVerdicts, pursuingVerdicts, statusLabels, verdictLabels } from "./labels";
import type { SaveNotice } from "./use-verdict-saves";

// A chosen verdict: blue tile plus a check, so the state isn't colour alone.
const choiceClass =
  "aria-pressed:border-primary aria-pressed:bg-blue-pale aria-pressed:text-primary aria-disabled:cursor-progress aria-disabled:opacity-60";

type VerdictBarProps = {
  verdict: ProspectVerdict | null;
  /** This prospect's save is in flight: clicks are ignored, focus is kept. */
  saving: boolean;
  notice: SaveNotice | null;
  onSave: (verdict: ProspectVerdict) => void;
  /** Opens the bucket a just-saved prospect moved to. */
  onViewSaved: (notice: SaveNotice) => void;
};

/**
 * The decision for the open file, docked at the bottom of it so it is always
 * in reach. "Worth contacting" is the one primary choice; reasons for passing
 * sit behind "Pass", and the follow-up states only appear once a prospect is
 * being pursued. Buttons are never disabled mid-save, because disabling the
 * focused button would drop keyboard focus to the page.
 */
export function VerdictBar({ verdict, saving, notice, onSave, onViewSaved }: VerdictBarProps) {
  // null follows the verdict (open when passed); a click makes it explicit.
  // It is not reset per prospect, so the reasons stay open while triaging.
  const [passOpen, setPassOpen] = useState<boolean | null>(null);
  const labelId = useId();
  const reasonsId = useId();
  const bucket = verdict ? bucketFor(verdict) : null;
  const showReasons = passOpen ?? bucket === "passed";

  const choose = (next: ProspectVerdict) => {
    if (!saving && next !== verdict) onSave(next);
  };

  const choice = (option: ProspectVerdict, size: "default" | "sm") => (
    <Button
      key={option}
      type="button"
      variant="outline"
      size={size}
      aria-pressed={verdict === option}
      aria-disabled={saving || undefined}
      onClick={() => choose(option)}
      className={choiceClass}
    >
      {verdict === option ? <Check aria-hidden="true" /> : null}
      {verdictLabels[option]}
    </Button>
  );

  return (
    <div className="arc-today__decision rounded-b-lg border-t border-border bg-card px-3 py-3 lg:px-6">
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-2">
        <h3 id={labelId} className="sr-only text-sm leading-6 font-semibold text-foreground sm:not-sr-only sm:mr-1">
          Your verdict
        </h3>
        {bucket === "pursuing" ? (
          pursuingVerdicts.map((option) => choice(option, "default"))
        ) : (
          <Button
            type="button"
            variant={bucket === "passed" ? "outline" : "default"}
            aria-disabled={saving || undefined}
            onClick={() => choose("worth_contacting")}
            className="aria-disabled:cursor-progress aria-disabled:opacity-60"
          >
            Worth contacting
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          aria-expanded={showReasons}
          aria-controls={reasonsId}
          onClick={() => setPassOpen(!showReasons)}
          className={cn(bucket === "passed" && "border-primary bg-blue-pale text-primary")}
        >
          {bucket === "passed" ? <Check aria-hidden="true" /> : null}
          {bucket === "passed" ? "Passed" : "Pass"}
          <ChevronDown aria-hidden="true" className={cn("transition-transform motion-reduce:transition-none", showReasons && "rotate-180")} />
        </Button>
      </div>
      <div
        id={reasonsId}
        role="group"
        aria-label="Reason for passing"
        hidden={!showReasons}
        className="mt-2 flex flex-wrap gap-1.5"
      >
        {passVerdicts.map((option) => choice(option, "sm"))}
      </div>
      {/* Always mounted so screen readers announce each change. */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {notice ? (
          <SaveNoticeLine notice={notice} onView={onViewSaved} movedFromView={notice.showWith !== notice.prospectId} />
        ) : null}
      </div>
    </div>
  );
}

/** "Ledgerline saved as Worth contacting." with a way back to it if it moved. */
export function SaveNoticeLine({
  notice,
  onView,
  movedFromView = true,
}: {
  notice: SaveNotice;
  onView: (notice: SaveNotice) => void;
  /** False when the saved prospect is still the open file, so "View" would go nowhere. */
  movedFromView?: boolean;
}) {
  if (notice.kind === "failed") {
    return (
      <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-5 text-danger">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {notice.message}
      </p>
    );
  }
  if (notice.kind === "saving") {
    return <p className="mt-2 text-[13px] leading-5 text-muted-foreground">Saving your verdict on {notice.name}…</p>;
  }
  const bucket = bucketFor(notice.verdict);
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-foreground">
      <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
      <span>
        {notice.name} saved as {verdictLabels[notice.verdict]}.
      </span>
      {movedFromView ? (
        <Button type="button" variant="link" size="sm" className="h-auto px-0 py-0 text-[13px]" onClick={() => onView(notice)}>
          View in {statusLabels[bucket]}
        </Button>
      ) : null}
    </p>
  );
}
