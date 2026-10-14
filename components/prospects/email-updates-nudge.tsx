"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { updateResultEmailPreference } from "@/lib/result-email-client";
import { cn } from "@/lib/utils";

type NudgeState = "loading" | "hidden" | "offer" | "saving" | "enabled" | "error";

/**
 * Offers result emails at the moment they are most useful: when the inbox is
 * empty and the next prospects will arrive later. Reuses the existing opt-in
 * route, so consent evidence and owner/admin rules stay in one place.
 * Hidden when already enabled, when this member is not allowed to enable it,
 * or when the setting can't be read: it is an optional offer, not a status.
 */
export function EmailUpdatesNudge() {
  const [state, setState] = useState<NudgeState>("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/crawl-notifications", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { enabled?: boolean; eligible?: boolean } | null) => {
        if (cancelled) return;
        setState(payload?.eligible && !payload.enabled ? "offer" : "hidden");
      })
      .catch(() => {
        if (!cancelled) setState("hidden");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading" || state === "hidden") return null;

  const enable = async () => {
    setState("saving");
    try {
      await updateResultEmailPreference(true);
      trackProductEvent("email_updates_enabled", { surface: "caught_up" });
      setState("enabled");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="flex w-full max-w-md items-start gap-2.5 rounded-md bg-blue-tint p-3 ring-1 ring-inset ring-border">
      <BellRing className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0" aria-live="polite">
        <p className="text-sm font-semibold text-foreground">
          {state === "enabled" ? "Email updates are on" : "Get an email when new prospects arrive"}
        </p>
        <p className={cn("mt-0.5 text-sm leading-5", state === "error" ? "text-danger" : "text-navy-soft")}>
          {state === "enabled"
            ? "Turn them off any time in Settings."
            : state === "error"
              ? "Couldn't turn on email updates. Turn them on from Settings instead."
              : "Counts only, never post text. Turn them off any time in Settings."}
        </p>
        {state === "offer" || state === "saving" ? (
          <Button type="button" size="sm" variant="outline" className="mt-2" disabled={state === "saving"} onClick={enable}>
            {state === "saving" ? "Turning on…" : "Email me"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
