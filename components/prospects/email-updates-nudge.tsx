"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trackProductEvent } from "@/lib/analytics/product-events";
import { updateResultEmailPreference } from "@/lib/result-email-client";
import { C } from "@/lib/tokens";

type NudgeState = "loading" | "hidden" | "offer" | "saving" | "enabled" | "error";

/**
 * Offers result emails at the moment they are most useful: when the inbox is
 * empty and the next leads will arrive later. Reuses the existing opt-in
 * route, so consent evidence and owner/admin rules stay in one place.
 * Hidden when already enabled or when this member is not allowed to enable it.
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
    <div className="mt-5 w-full max-w-sm rounded-lg border p-3 text-left" style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}>
      <div className="flex items-start gap-2.5">
        <BellRing className="mt-0.5 size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: C.navy }}>
            {state === "enabled" ? "Email updates are on" : "Get an email when new leads arrive"}
          </p>
          <p className="mt-0.5 text-xs leading-5" style={{ color: C.navySoft }}>
            {state === "enabled"
              ? "Turn them off any time in Settings."
              : state === "error"
                ? "Could not turn on emails. Try again from Settings."
                : "Counts only, never post text. Turn off any time in Settings."}
          </p>
          {state === "offer" || state === "saving" ? (
            <Button type="button" size="sm" className="mt-2" disabled={state === "saving"} onClick={enable}>
              {state === "saving" ? "Turning on..." : "Email me"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
