"use client";

import { useState, useTransition } from "react";
import { Bell, LoaderCircle } from "lucide-react";

import { toast } from "@/components/ui/use-toast";
import { C } from "@/lib/tokens";

type CrawlNotificationPreferencesProps = {
  initialEnabled: boolean;
};

export default function CrawlNotificationPreferences({
  initialEnabled,
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
          title: payload.enabled ? "Refresh emails enabled" : "Refresh emails paused",
          description: payload.enabled
            ? "You will receive completed refresh summaries for this workspace."
            : "Arcli will no longer queue website refresh result emails for your account.",
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
              Website refresh emails
            </h2>
            <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
              Choose whether your account receives website refresh emails. Other workspace owners and admins choose separately. Pro emails include aggregate review-ready lead results; Free emails only confirm the refresh.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Enable website refresh emails"
          disabled={isPending}
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
