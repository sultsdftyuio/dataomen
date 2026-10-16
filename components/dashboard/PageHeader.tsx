import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  /** The page's navigation name, e.g. "Signals". No trailing full stop. */
  title: string;
  /** One line on what this page is for. Muted, capped at ~70 characters wide. */
  description?: ReactNode;
  /** Small supporting line, e.g. "Updated 4 minutes ago" or a count. */
  meta?: ReactNode;
  /** Page-level actions. Right-aligned from md up, wrapping below the title on mobile. */
  actions?: ReactNode;
  /** id for the h1, so sections can use aria-labelledby. */
  titleId?: string;
  className?: string;
};

/**
 * The single page heading for dashboard pages. It owns the page's only h1.
 * Geist 600 at 24px (28px from md): calm and specific, never a marketing
 * headline. PageSkeleton's header placeholder matches these dimensions.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  titleId = "page-title",
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h1
          id={titleId}
          className="font-sans text-2xl leading-8 font-semibold tracking-[-0.01em] text-foreground md:text-[28px] md:leading-9"
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-[70ch] text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
        {meta ? (
          <div className="mt-1 text-xs leading-5 text-subtle">{meta}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end md:pt-0.5">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
