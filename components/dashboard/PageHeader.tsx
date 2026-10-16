import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  /** The page's navigation name, e.g. "Prospects". No trailing full stop. */
  title: string;
  /**
   * One line on what this page is for. Read by screen readers; shown on
   * screen only with `showDescription`, for pages where it is an
   * instruction (a first run, a preview) rather than a reminder.
   */
  description?: ReactNode;
  /** Show the description on screen. Off by default: see `description`. */
  showDescription?: boolean;
  /** Small supporting line, e.g. "Updated 4 minutes ago" or a count. */
  meta?: ReactNode;
  /** Page-level actions, right-aligned; they wrap under the title on mobile. */
  actions?: ReactNode;
  /** id for the h1, so sections can use aria-labelledby. */
  titleId?: string;
  className?: string;
};

/**
 * The single page heading for dashboard pages. It owns the page's only h1.
 *
 * A compact bar rather than a large title: the rail already shows where you
 * are, so the page name stays small and the page's own content (a verdict,
 * a status, the work) leads. PageSkeleton's header placeholder matches it.
 */
export function PageHeader({
  title,
  description,
  showDescription = false,
  meta,
  actions,
  titleId = "page-title",
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 id={titleId} className="font-sans text-base leading-6 font-semibold text-foreground">
            {title}
          </h1>
          {meta ? <div className="text-xs leading-5 text-subtle">{meta}</div> : null}
        </div>
        {description ? (
          <p className={showDescription ? "mt-1 max-w-[70ch] text-sm leading-6 text-muted-foreground" : "sr-only"}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
