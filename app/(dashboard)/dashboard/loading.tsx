import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex h-full w-full flex-col gap-3 animate-in fade-in duration-300">
      <header className="flex min-h-11 items-center justify-between gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </header>

      <section className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <Skeleton className="h-7 w-32 rounded-full" />
      </section>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(300px,0.72fr)_minmax(560px,1.65fr)]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-slate-50 px-4">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="border-b border-slate-200 p-3">
            <div className="flex gap-2">
              <Skeleton className="h-8 flex-1 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>
          <div>
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-2 border-b border-slate-100 px-4 py-3.5">
                <div className="flex justify-between gap-3">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-16 rounded" />
                </div>
                <Skeleton className="h-5 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            ))}
          </div>
        </section>

        <section className="hidden overflow-hidden rounded-xl border border-slate-200 bg-slate-50 xl:block">
          <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-blue-50 px-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="space-y-4 p-4">
            <Skeleton className="h-16 w-full rounded-lg" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </section>
      </div>
    </div>
  );
}
