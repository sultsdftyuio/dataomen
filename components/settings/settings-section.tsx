import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SettingsSectionProps = {
  /** Anchor target for the in-page settings nav. */
  id: string;
  title: string;
  description?: ReactNode;
  /** Optional status shown beside the title, e.g. a StatusBadge. */
  status?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * One titled panel on the Settings page. Every section shares this frame so
 * headings, spacing and borders read as one system; content inside is
 * divided by rules, never by nested cards.
 */
export function SettingsSection({ id, title, description, status, children, className }: SettingsSectionProps) {
  const headingId = `${id}-title`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-4 rounded-lg border border-border bg-card", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-4 md:px-5">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base leading-6 font-semibold text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 max-w-[60ch] text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {status}
      </div>
      <div className="divide-y divide-border border-t border-border">{children}</div>
    </section>
  );
}

type SettingsRowProps = {
  label: string;
  /** One short muted line under the label. */
  hint?: ReactNode;
  /** The current value, read-only. */
  children?: ReactNode;
  /** A control that changes this row, aligned right from md up. */
  action?: ReactNode;
  className?: string;
};

/**
 * A label and its value. Stacks on phones; from md up the label takes a fixed
 * column so values line up down the page.
 */
export function SettingsRow({ label, hint, children, action, className }: SettingsRowProps) {
  return (
    <div
      className={cn(
        "grid gap-x-6 gap-y-1.5 px-4 py-3.5 md:grid-cols-[13rem_minmax(0,1fr)_auto] md:items-center md:px-5",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm leading-6 font-medium text-foreground">{label}</p>
        {hint ? <p className="text-xs leading-5 text-subtle">{hint}</p> : null}
      </div>
      <div className="min-w-0 text-sm leading-6 break-words text-navy-soft">{children}</div>
      {action ? <div className="flex flex-wrap items-center gap-2 md:justify-end">{action}</div> : null}
    </div>
  );
}
