import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex h-full w-full flex-col gap-4 pb-3 animate-in fade-in duration-300">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="border-t border-slate-200" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="space-y-2 border-b border-slate-200 p-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="p-4">
            <div className="divide-y rounded-lg border border-slate-200">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="flex gap-3 p-4">
                  <Skeleton className="size-9 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-4 w-48 max-w-full" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-24 w-full" />
          </section>
        </aside>
      </div>
    </div>
  );
}
