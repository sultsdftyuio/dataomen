import { cn } from "@/lib/utils";

import "./settings-client.css";

// Same static blocks as PageSkeleton (no shimmer), arranged like the Settings
// page: header, section links, then the Profile and Plan and billing panels.
// PageSkeleton's "form" variant is a single card, which would jump here.
function Block({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-blue-pale", className)} />;
}

function SectionPlaceholder({ rows, titleWidth }: { rows: number; titleWidth: string }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="space-y-2 px-4 py-4 md:px-5">
        <Block className={cn("h-5", titleWidth)} />
        <Block className="h-3.5 w-64 max-w-full" />
      </div>
      <div className="divide-y divide-border border-t border-border">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="grid gap-2 px-4 py-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6 md:px-5">
            <Block className="h-3.5 w-24" />
            <Block className="h-3.5 w-40 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div role="status" aria-live="polite" className="arc-workspace-page settings-page">
      <span className="sr-only">Loading settings</span>
      <div aria-hidden="true" className="contents">
        <div>
          <div className="flex h-8 items-center md:h-9">
            <Block className="h-6 w-32 md:h-7" />
          </div>
          <div className="mt-1 flex h-6 items-center">
            <Block className="h-3.5 w-full max-w-[26rem]" />
          </div>
        </div>

        <div className="settings-page__layout">
          <div className="flex flex-wrap gap-1 md:flex-col md:gap-0.5">
            {["w-14", "w-24", "w-28", "w-24", "w-16"].map((width, index) => (
              <div key={index} className="flex h-10 items-center px-3 md:h-9">
                <Block className={cn("h-3.5", width)} />
              </div>
            ))}
          </div>
          <div className="settings-page__sections">
            <SectionPlaceholder rows={4} titleWidth="w-20" />
            <SectionPlaceholder rows={1} titleWidth="w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
