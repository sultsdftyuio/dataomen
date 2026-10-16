import { cn } from "@/lib/utils";

import { ContextLayout } from "./ContextLayout";

export type PageSkeletonVariant = "list-detail" | "form" | "list";

export type PageSkeletonProps = {
  /** list-detail: Prospects, Targets, Buyer groups. form: Brief, Settings. list: simple lists. */
  variant: PageSkeletonVariant;
  /** Announced to screen readers as "Loading <page>", e.g. "prospects". */
  page: string;
  /** Show an actions placeholder at the right of the header. */
  withActions?: boolean;
  /** The page opens with a context panel (see ContextLayout): hold its place. */
  withPanel?: boolean;
  className?: string;
};

// A static block: no shimmer. Loading pages are short waits and an ambient
// sweep adds motion nobody asked for. bg-blue-pale on the shell's off-white
// keeps the blocks visible without looking like content.
function Block({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-blue-pale", className)} />;
}

function HeaderPlaceholder({ withActions }: { withActions: boolean }) {
  // Matches PageHeader: one compact 36px bar with the page name.
  return (
    <div className="flex min-h-9 shrink-0 items-center justify-between gap-6">
      <Block className="h-4 w-32" />
      {withActions ? <Block className="h-9 w-32 shrink-0" /> : null}
    </div>
  );
}

function ListRows({ count }: { count: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-2 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <Block className="h-3.5 w-2/5" />
            <Block className="h-5 w-16 rounded-full" />
          </div>
          <Block className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * Route-level loading state for dashboard pages (use it from loading.tsx).
 * It is shaped like the page, so the layout does not jump when data arrives.
 */
export function PageSkeleton({ variant, page, withActions = false, withPanel = false, className }: PageSkeletonProps) {
  const content = (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex w-full min-w-0 flex-1 flex-col gap-5", className)}
    >
      <span className="sr-only">Loading {page}</span>
      <div aria-hidden="true" className="contents">
        <HeaderPlaceholder withActions={withActions} />

        {variant === "list-detail" ? (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)]">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border p-3">
                <Block className="h-9 w-full" />
              </div>
              <ListRows count={6} />
            </div>
            <div className="hidden space-y-4 rounded-lg border border-border bg-card p-5 lg:block">
              <Block className="h-5 w-1/2" />
              <Block className="h-3.5 w-3/4" />
              <Block className="h-24 w-full" />
              <Block className="h-3.5 w-2/3" />
              <Block className="h-3.5 w-1/2" />
            </div>
          </div>
        ) : null}

        {variant === "form" ? (
          <div className="max-w-3xl space-y-6 rounded-lg border border-border bg-card p-5 md:p-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Block className="h-3.5 w-32" />
                <Block className={index === 2 ? "h-24 w-full" : "h-9 w-full"} />
              </div>
            ))}
            <Block className="h-9 w-32" />
          </div>
        ) : null}

        {variant === "list" ? (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <ListRows count={8} />
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!withPanel) return content;

  return (
    <ContextLayout label={`Loading ${page}`} panel={<PanelPlaceholder />}>
      {content}
    </ContextLayout>
  );
}

/** Static blocks on the panel surface, in the shape of a status card and a short list. */
function PanelPlaceholder() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="arc-context-placeholder h-28" />
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="arc-context-placeholder h-11 opacity-70" />
      ))}
    </div>
  );
}
