"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bell, LoaderCircle, Mail } from "lucide-react";

import { toast } from "@/components/ui/use-toast";
import { updateResultEmailPreference } from "@/lib/result-email-client";
import { C } from "@/lib/tokens";

type CrawlNotificationPreferencesProps = {
  initialEnabled: boolean;
  eligible: boolean;
  accountEmail: string | null;
};

export default function CrawlNotificationPreferences({
  initialEnabled,
  eligible,
  accountEmail,
}: CrawlNotificationPreferencesProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  const updateEnabled = () => {
    const nextEnabled = !enabled;
    startTransition(async () => {
      try {
        await updateResultEmailPreference(nextEnabled);
        setEnabled(nextEnabled);
        toast({
          title: nextEnabled ? "Result email preference saved" : "Result emails turned off",
          description: nextEnabled
            ? "We'll send occasional updates to your account email when delivery is active."
            : "No new result emails will be queued for your account.",
        });
      } catch (error) {
        toast({
          title: "Result email setting not updated",
          description:
            error instanceof Error
              ? error.message
              : "Could not update result email settings.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <section
      id="result-emails"
      className="scroll-mt-6 overflow-hidden rounded-xl border bg-white"
      style={{ borderColor: C.rule, boxShadow: "0 1px 3px rgba(10, 22, 40, 0.04)" }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: C.bluePale, color: C.blue }}
          >
            <Bell className="size-4" aria-hidden="true" />
          </div>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: enabled ? C.greenPale : C.offWhite, color: enabled ? C.green : C.navySoft }}>
            {enabled ? "On for you" : "Off"}
          </span>
        </div>
        <h2 className="mt-3 text-sm font-semibold" style={{ color: C.navy }}>Result emails</h2>
        <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
          Choose whether Arcli emails you about your website brief, Pro scan checkpoints, and website read failures.
        </p>

        <div className="mt-4 flex items-start gap-2.5 rounded-lg border px-3 py-2.5" style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}>
          <Mail className="mt-0.5 size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold" style={{ color: C.navy }}>Your account email</p>
            <p className="mt-0.5 break-all text-xs" style={{ color: C.navySoft }}>{accountEmail ?? "No email available"}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: C.rule }}>
          <div>
            <p id="result-emails-choice" className="text-xs font-semibold" style={{ color: C.navy }}>Email me result updates</p>
            <p className="mt-0.5 text-xs" style={{ color: C.muted }}>Optional. Change this anytime.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="result-emails-choice"
            aria-describedby="result-emails-detail"
            disabled={isPending || !eligible || !accountEmail}
            onClick={updateEnabled}
            className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: enabled ? C.blue : C.rule }}
          >
            <span className="inline-block size-5 rounded-full bg-white shadow-sm transition-transform" style={{ transform: enabled ? "translateX(21px)" : "translateX(2px)" }} />
            {isPending ? <LoaderCircle className="absolute left-[14px] size-3 animate-spin" style={{ color: enabled ? C.white : C.navySoft }} aria-hidden="true" /> : null}
          </button>
        </div>
        <p id="result-emails-detail" className="mt-3 text-xs leading-5" style={{ color: C.muted }}>
          {!eligible
            ? "Only workspace owners and admins can receive these emails."
            : enabled
              ? "Your choice is saved. Email delivery may be paused, and we do not send one for every scan."
              : "No result emails will be queued for you until you turn this on."}
          {" "}Messages contain aggregate results, not public post text, contact details, or promotions. This choice affects only your account.
        </p>
        <Link href="/privacy" className="mt-3 inline-block text-xs font-semibold underline underline-offset-2" style={{ color: C.blue }}>
          How Arcli uses your email
        </Link>
      </div>
    </section>
  );
}
