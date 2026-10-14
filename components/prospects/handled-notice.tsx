"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";

import type { HandledNotice } from "@/app/(dashboard)/dashboard/prospect-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function shortTitle(title: string) {
  return title.length > 70 ? `${title.slice(0, 67).trimEnd()}…` : title;
}

function noticeText({ title, handled, status }: HandledNotice) {
  const name = `“${shortTitle(title)}”`;
  if (status === "failed") {
    return handled
      ? `Couldn't mark ${name} done. It's back in your inbox.`
      : `Couldn't move ${name} back to your inbox. It's still in Done.`;
  }
  return handled ? `${name} marked done.` : `${name} moved back to your inbox.`;
}

/**
 * Desk-level result of Done / Move to inbox. It can't sit next to the
 * prospect's own button, because the prospect has already left the list, so
 * it names the prospect and offers Undo or Try again in place.
 */
export function HandledNoticeBar({
  notice,
  onSetHandled,
  onDismiss,
}: {
  notice: HandledNotice;
  onSetHandled: (leadId: string, handled: boolean) => void;
  onDismiss: () => void;
}) {
  const failed = notice.status === "failed";
  const Icon = failed ? AlertCircle : CheckCircle2;

  return (
    <div
      role={failed ? "alert" : "status"}
      className={cn(
        "flex items-center gap-2 border-b px-4 py-2 text-sm md:px-5",
        failed ? "border-danger/25 bg-danger-pale text-danger" : "border-border bg-off-white text-navy-soft",
      )}
    >
      <Icon className={cn("size-4 shrink-0", !failed && "text-success")} aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-5">{noticeText(notice)}</p>
      <Button
        type="button"
        variant={failed ? "outline" : "ghost"}
        size="sm"
        className={cn(!failed && "text-primary")}
        // Retry repeats the same change; Undo reverses a saved one.
        onClick={() => onSetHandled(notice.leadId, failed ? notice.handled : !notice.handled)}
      >
        {failed ? "Try again" : "Undo"}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss message" onClick={onDismiss}>
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
