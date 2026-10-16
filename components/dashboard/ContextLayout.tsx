import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ContextLayoutProps = {
  /** Accessible name for the panel, e.g. "Brief sections". */
  label: string;
  /** The page's PageHeader. It comes first so the page opens on its name. */
  header: ReactNode;
  /** Page-specific context: status, sections, a list to pick from. */
  panel: ReactNode;
  /**
   * The work fills the viewport and scrolls inside itself, for list-detail
   * desks whose list and detail scroll separately. Otherwise the page grows
   * with its content and the panel sticks.
   */
  fill?: boolean;
  /** Leave the panel out on phones, where the page already shows the same controls. */
  hidePanelOnPhone?: boolean;
  children: ReactNode;
};

/**
 * A page with a context panel: the rail's navy-blue surface continues into a
 * panel that holds the page's own navigation and status, and the work sits
 * on white beside it. The panel sticks while the work scrolls.
 *
 * The header is its own slot (not the first child of the work) so phones can
 * show it above the panel: header, panel, work. See .arc-context-* in
 * dashboard-shell.css.
 */
export function ContextLayout({ label, header, panel, fill = false, hidePanelOnPhone = false, children }: ContextLayoutProps) {
  return (
    <div className={cn("arc-context-layout", fill && "arc-context-layout--fill")}>
      <div className="arc-context-layout__header">{header}</div>
      <aside aria-label={label} className={cn("arc-context-panel", hidePanelOnPhone && "arc-context-panel--phone-hidden")}>
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

/**
 * A row that switches what the work area shows without leaving the page,
 * such as a queue view. Styled like ContextLink; `pressed` marks the view
 * that is showing.
 */
export function ContextButton({
  title,
  detail,
  trailing,
  pressed,
  attention = false,
  onClick,
}: {
  title: string;
  detail?: ReactNode;
  trailing?: ReactNode;
  pressed: boolean;
  attention?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className="arc-context-link"
      data-attention={attention || undefined}
      onClick={onClick}
    >
      <span className="arc-context-link__copy">
        <span className="arc-context-link__title">{title}</span>
        {detail ? <span className="arc-context-link__detail">{detail}</span> : null}
      </span>
      {attention ? <span className="arc-context-link__dot" aria-hidden="true" /> : null}
      {trailing !== undefined ? <span className="arc-context-link__trailing">{trailing}</span> : null}
    </button>
  );
}

/** A read-only figure in the panel: a label and its count. */
export function ContextStat({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: ReactNode;
  /** The figure needs a look, e.g. a source that didn't finish: amber value. */
  attention?: boolean;
}) {
  return (
    <div className="arc-context-stat" data-attention={attention || undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
