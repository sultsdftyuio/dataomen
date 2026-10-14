"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { AlertCircle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type OnboardingErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Error boundary for onboarding. These pages share the dashboard loaders,
 * which throw on query failures instead of returning empty values, so a
 * failed read lands here rather than on Next's unstyled default. The error
 * message is never shown because it may hold backend detail.
 */
export default function OnboardingError({ error, reset }: OnboardingErrorProps) {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  useEffect(() => {
    console.error("[Onboarding] page failed to render", error);
  }, [error]);

  // reset() alone re-renders with the same failed server payload; refreshing
  // first fetches the server components again.
  const retry = () => {
    startRetry(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <main className="flex min-h-dvh flex-col bg-off-white px-4 py-8 md:py-16">
      <section
        role="alert"
        aria-labelledby="onboarding-error-title"
        className="mx-auto w-full max-w-lg rounded-lg border border-border bg-card p-5 md:p-8"
      >
        <AlertCircle className="size-6 text-danger" aria-hidden="true" />
        <h1
          id="onboarding-error-title"
          className="mt-4 text-2xl leading-8 font-semibold text-foreground"
        >
          Setup couldn&apos;t load
        </h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Arcli couldn&apos;t read your workspace setup, so it stopped before
          showing anything incomplete. Nothing you entered was changed.
        </p>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Try again in a moment. If it keeps failing, email{" "}
          <a
            className="font-medium text-primary underline underline-offset-2"
            href="mailto:support@arcli.tech"
          >
            support@arcli.tech
          </a>
          {error.digest ? (
            <>
              {" "}and include reference{" "}
              <span className="font-mono text-foreground">{error.digest}</span>
            </>
          ) : null}
          .
        </p>
        <div className="mt-6">
          <Button type="button" size="lg" onClick={retry} disabled={isRetrying}>
            <RotateCw className={isRetrying ? "animate-spin" : undefined} aria-hidden="true" />
            {isRetrying ? "Trying again…" : "Try again"}
          </Button>
        </div>
      </section>
    </main>
  );
}
