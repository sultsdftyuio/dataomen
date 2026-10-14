"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";

import { SettingsSection } from "@/components/settings/settings-section";
import { toast } from "@/components/ui/use-toast";
import { updateResultEmailPreference } from "@/lib/result-email-client";
import { cn } from "@/lib/utils";

type CrawlNotificationPreferencesProps = {
  initialEnabled: boolean;
  /** Owner or admin of the workspace. */
  eligible: boolean;
  accountEmail: string | null;
  /** The membership lookup failed, so eligibility isn't known. */
  roleUnknown?: boolean;
  /** The stored choice failed to load, so the switch can't show the truth. */
  preferenceUnavailable?: boolean;
};

const SAVE_FAILED = "Couldn't save your choice, so nothing changed. Check your connection and try again.";

export default function CrawlNotificationPreferences({
  initialEnabled,
  eligible,
  accountEmail,
  roleUnknown = false,
  preferenceUnavailable = false,
}: CrawlNotificationPreferencesProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const blockedReason = roleUnknown
    ? "Your workspace role couldn't be checked, so this can't be changed right now. Reload the page to try again."
    : preferenceUnavailable
      ? "Your email choice couldn't be loaded, so it can't be changed right now. Reload the page to try again."
      : !eligible
        ? "Only workspace owners and admins can receive these emails."
        : !accountEmail
          ? "Your account has no email address, so these emails can't be sent."
          : null;
  const canToggle = blockedReason === null;

  const updateEnabled = () => {
    const nextEnabled = !enabled;
    setSaveError(null);
    startTransition(async () => {
      try {
        await updateResultEmailPreference(nextEnabled);
        setEnabled(nextEnabled);
      } catch (error) {
        console.error("[Settings] Result email preference save failed", error);
        setSaveError(SAVE_FAILED);
        toast({ variant: "destructive", title: "Couldn't save your email choice", description: "Check your connection and try again." });
      }
    });
  };

  const stateText = enabled
    ? "On. Arcli doesn't email you for every scan, and delivery can be paused."
    : "Off. No result emails will be sent to you.";

  return (
    <SettingsSection
      id="result-emails"
      title="Result emails"
      description="Emails about your targeting brief, Pro scan checkpoints and problems reading your website."
    >
      <div className="px-4 py-3.5 md:px-5">
        <label
          htmlFor="result-emails-switch"
          className={cn("flex items-center justify-between gap-4", canToggle && !isPending ? "cursor-pointer" : "cursor-not-allowed")}
        >
          <span className="min-w-0">
            <span id="result-emails-choice" className="block text-sm leading-6 font-medium text-foreground">
              Email me result updates
            </span>
            <span className="block text-xs leading-5 break-all text-subtle">
              {accountEmail ? `Sent to ${accountEmail}` : "No account email"}
            </span>
          </span>
          {preferenceUnavailable ? null : (
            <button
              id="result-emails-switch"
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-labelledby="result-emails-choice"
              aria-describedby="result-emails-detail"
              disabled={isPending || !canToggle}
              onClick={updateEnabled}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-50",
                enabled ? "bg-primary" : "bg-subtle",
              )}
            >
              <span
                className={cn(
                  "inline-block size-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
                  enabled ? "translate-x-[22px]" : "translate-x-0.5",
                )}
              />
              {isPending ? (
                <LoaderCircle
                  className={cn("absolute left-[14px] size-3 motion-safe:animate-spin", enabled ? "text-white" : "text-navy-soft")}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          )}
        </label>

        <div id="result-emails-detail" className="mt-2 space-y-1 text-sm leading-6">
          {blockedReason ? (
            <p className="text-muted-foreground">{blockedReason}</p>
          ) : (
            <p className="text-muted-foreground">{stateText}</p>
          )}
          {saveError ? <p role="alert" className="font-medium text-danger">{saveError}</p> : null}
        </div>
      </div>
      <div className="px-4 py-3.5 text-sm leading-6 text-muted-foreground md:px-5">
        <p>
          These emails contain totals only: no public post text, contact details or promotions. Your choice affects only
          your account.
        </p>
        <Link
          href="/privacy"
          className="mt-1 inline-block rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          How Arcli uses your email
        </Link>
      </div>
    </SettingsSection>
  );
}
