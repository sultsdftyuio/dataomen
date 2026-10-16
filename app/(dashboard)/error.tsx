"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { AlertCircle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Error boundary for every dashboard page. It renders inside the shell, so
 * navigation stays usable. Loaders throw on query failures (see
 * app/(dashboard)/dashboard/data.ts) so a failed read lands here instead of
 * posing as an empty list. The error message is never shown: server errors
 * are redacted in production and may hold backend detail.
 */
export default function DashboardError({ error, reset }: DashboardErrorProps) {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  useEffect(() => {
    console.error("[Dashboard] page failed to render", error);
  }, [error]);

  // reset() alone re-renders the client tree with the same failed server
  // payload; refreshing first fetches the server components again.
  const retry = () => {
    startRetry(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <div className="arc-workspace-page">
      <section
        role="alert"
        aria-labelledby="dashboard-error-title"
        className="max-w-xl rounded-lg border border-border bg-card p-5 md:p-6"
      >
        <AlertCircle className="size-5 text-danger" aria-hidden="true" />
        <h1
          id="dashboard-error-title"
          className="mt-3 text-xl leading-7 font-semibold text-foreground md:text-2xl md:leading-8"
        >
          This page couldn&apos;t load
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Arcli couldn&apos;t read the data this page needs, so it stopped rather
          than show you an incomplete list. Nothing in your workspace was changed.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Try again in a moment. If it keeps failing, email{" "}
          <a className="font-medium text-primary underline underline-offset-2" href="mailto:support@arcli.tech">
            support@arcli.tech
          </a>
          {error.digest ? <> and include reference <span className="font-mono text-foreground">{error.digest}</span></> : null}.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={retry} disabled={isRetrying}>
            <RotateCw className={isRetrying ? "animate-spin" : undefined} aria-hidden="true" />
            {isRetrying ? "Trying again…" : "Try again"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to Signals</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
