"use client";

import type { ReactNode } from "react";
import { AlertCircle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LoadErrorProps = {
  /** What failed to load, as people name it: "Prospects", "Buyer groups". */
  thing: string;
  /** What to do next. Defaults to a retry hint. */
  description?: ReactNode;
  /** Renders a "Try again" button. Omit when you pass `action`. */
  onRetry?: () => void;
  /** Disables the retry button and shows "Trying again…". */
  retrying?: boolean;
  /** Replaces the retry button, e.g. a link to reload the page. */
  action?: ReactNode;
  /** Heading level for the title. Use 3 inside a titled panel. */
  headingLevel?: 2 | 3;
  className?: string;
};

/**
 * "<Thing> couldn't be loaded" for a panel or region whose data failed.
 * Never show raw backend messages here; log them, and tell people what to do.
 * role="alert" announces it once when it replaces content after an action.
 */
export function LoadError({
  thing,
  description,
  onRetry,
  retrying = false,
  action,
  headingLevel = 2,
  className,
}: LoadErrorProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-danger/25 bg-card px-4 py-5 text-left md:px-5",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        <div className="space-y-1">
          <Heading className="text-base leading-6 font-semibold text-foreground">
            {thing} couldn&apos;t be loaded
          </Heading>
          <div className="max-w-[60ch] text-sm leading-6 text-muted-foreground">
            {description ??
              "This is usually a brief connection problem. Try again, and if it keeps happening, reload the page."}
          </div>
        </div>
      </div>
      {action || onRetry ? (
        <div className="pl-6.5">
          {action ?? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
              <RotateCw className={cn("size-3.5", retrying && "animate-spin")} aria-hidden="true" />
              {retrying ? "Trying again…" : "Try again"}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
