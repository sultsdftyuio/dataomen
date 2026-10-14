import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type EmptyStateVariant = "never-used" | "empty-for-now" | "no-results";

export type EmptyStateProps = {
  /**
   * never-used: first visit. Say what this place is for and give one action.
   * empty-for-now: works, nothing new yet ("No new prospects since Monday").
   * no-results: filters or search matched nothing. Pass `clearFilters`.
   */
  variant?: EmptyStateVariant;
  title: string;
  description?: ReactNode;
  /** Optional, subtle. Skip it in tight panels. */
  icon?: LucideIcon;
  /** The one primary action, usually a `<Button>`. */
  action?: ReactNode;
  /** Optional quieter link, e.g. "How matching works". */
  secondaryAction?: ReactNode;
  /** no-results only: a control that resets filters, e.g. `<Button variant="outline">Clear filters</Button>`. */
  clearFilters?: ReactNode;
  /** Heading level for the title. Use 3 when the empty state sits inside a titled panel. */
  headingLevel?: 2 | 3;
  className?: string;
};

/**
 * What a list or panel shows when it has nothing to show. Never use it for a
 * failed load: that is `LoadError`, so people can tell "nothing yet" from
 * "couldn't check".
 */
export function EmptyState({
  variant = "empty-for-now",
  title,
  description,
  icon: Icon,
  action,
  secondaryAction,
  clearFilters,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const isFirstRun = variant === "never-used";
  const footer = variant === "no-results" ? clearFilters ?? action : action;

  return (
    <div
      data-variant={variant}
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg text-left",
        isFirstRun
          ? "border border-dashed border-rule-dark bg-card px-5 py-8 md:px-8 md:py-10"
          : "px-4 py-6",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "grid place-items-center rounded-md text-subtle",
            isFirstRun ? "size-10 bg-blue-pale text-primary" : "size-8 bg-off-white",
          )}
          aria-hidden="true"
        >
          <Icon className={isFirstRun ? "size-5" : "size-4"} />
        </span>
      ) : null}
      <div className="max-w-[60ch] space-y-1">
        <Heading
          className={cn(
            "font-semibold text-foreground",
            isFirstRun ? "text-lg leading-7" : "text-base leading-6",
          )}
        >
          {title}
        </Heading>
        {description ? (
          <div className="text-sm leading-6 text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {footer || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          {footer}
          {secondaryAction ? (
            <span className="text-sm text-muted-foreground">{secondaryAction}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
