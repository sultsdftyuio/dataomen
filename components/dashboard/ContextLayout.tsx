import type { ReactNode } from "react";

type ContextLayoutProps = {
  /** Accessible name for the panel, e.g. "Brief sections". */
  label: string;
  /** Page-specific context: status, sections, a list to pick from. */
  panel: ReactNode;
  children: ReactNode;
};

/**
 * A page with a context panel: the rail's navy-blue surface continues into a
 * panel that holds the page's own navigation and status, and the work sits
 * on white beside it. The panel sticks while the work scrolls; on phones it
 * stacks above the work (see .arc-context-* in dashboard-shell.css).
 */
export function ContextLayout({ label, panel, children }: ContextLayoutProps) {
  return (
    <div className="arc-context-layout">
      <aside aria-label={label} className="arc-context-panel">
        {panel}
      </aside>
      <div className="arc-context-layout__work">{children}</div>
    </div>
  );
}

/** A frosted card on the panel surface. */
export function ContextCard({ children }: { children: ReactNode }) {
  return <div className="arc-context-card">{children}</div>;
}

/**
 * A row in the panel's list. `current` marks the item the work area shows.
 * Rendered as a link so each one can be opened, bookmarked or focused.
 */
export function ContextLink({
  href,
  title,
  detail,
  trailing,
  current = false,
  attention = false,
}: {
  href: string;
  title: string;
  detail?: ReactNode;
  trailing?: ReactNode;
  current?: boolean;
  /** Something here needs doing: amber detail and dot. */
  attention?: boolean;
}) {
  return (
    <a
      href={href}
      aria-current={current ? "true" : undefined}
      className="arc-context-link"
      data-attention={attention || undefined}
    >
      <span className="arc-context-link__copy">
        <span className="arc-context-link__title">{title}</span>
        {detail ? <span className="arc-context-link__detail">{detail}</span> : null}
      </span>
      {attention ? <span className="arc-context-link__dot" aria-hidden="true" /> : null}
      {trailing !== undefined ? <span className="arc-context-link__trailing">{trailing}</span> : null}
    </a>
  );
}

/** A read-only figure in the panel: a label and its count. */
export function ContextStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="arc-context-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
