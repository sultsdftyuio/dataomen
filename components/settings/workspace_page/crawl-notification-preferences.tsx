"use client";

import { useState, useTransition } from "react";
import { Bell, LoaderCircle } from "lucide-react";

import { toast } from "@/components/ui/use-toast";
import { C } from "@/lib/tokens";

type CrawlNotificationPreferencesProps = {
  initialEnabled: boolean;
  eligible: boolean;
};

export default function CrawlNotificationPreferences({
  initialEnabled,
  eligible,
}: CrawlNotificationPreferencesProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  const updateEnabled = () => {
    const nextEnabled = !enabled;
    startTransition(async () => {
      try {
        const response = await fetch("/api/settings/crawl-notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ enabled: nextEnabled }),
        });
        const payload = (await response.json().catch(() => null)) as {
          enabled?: unknown;
          error?: unknown;
        } | null;
        if (!response.ok || typeof payload?.enabled !== "boolean") {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : "Could not update refresh email settings.",
          );
        }
        setEnabled(payload.enabled);
        toast({
          title: payload.enabled ? "Email preference enabled" : "Email preference disabled",
          description: payload.enabled
            ? "When result email delivery is active, your account can receive website and discovery updates."
            : "Arcli will not queue website or discovery result emails for your account.",
        });
      } catch (error) {
        toast({
          title: "Refresh email setting not updated",
          description:
            error instanceof Error
              ? error.message
              : "Could not update refresh email settings.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <section
      id="result-emails"
      className="rounded-xl border bg-white p-4"
      style={{ borderColor: C.rule, boxShadow: "0 1px 3px rgba(10, 22, 40, 0.04)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: C.bluePale, color: C.blue }}
          >
            <Bell className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: C.navy }}>
              Result emails
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
              Optional updates about your website brief, scan results, and website read failures. Owners and admins can turn this on for their own account, or off to stop future emails. Delivery also depends on the service being enabled. Emails contain only aggregate updates, never public post text or a buyer contact. {!eligible ? "This option is available to workspace owners and admins." : null}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Receive optional result emails"
          disabled={isPending || !eligible}
          onClick={updateEnabled}
          className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: enabled ? C.blue : C.rule }}
        >
          <span
            className="inline-block size-5 rounded-full bg-white shadow-sm transition-transform"
            style={{ transform: enabled ? "translateX(21px)" : "translateX(2px)" }}
          />
          {isPending ? (
            <LoaderCircle
              className="absolute left-[14px] size-3 animate-spin"
              style={{ color: enabled ? C.white : C.navySoft }}
              aria-hidden="true"
            />
          ) : null}
        </button>
      </div>
    </section>
  );
}
