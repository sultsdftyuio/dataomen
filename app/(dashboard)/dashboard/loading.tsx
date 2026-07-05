// app/(dashboard)/dashboard/loading.tsx
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="w-full mx-auto h-full flex flex-col space-y-8 animate-in fade-in duration-300 font-sans">
      
      {/* 1. ROI Header Skeleton */}
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 rounded-md" />
          <Skeleton className="h-4 w-96 rounded-md" />
        </div>
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>

      {/* 2. Workspace Plan Card Skeleton */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-4 w-36 rounded-md" />
          </div>
          <Skeleton className="h-4 w-80 rounded-md" />
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <Skeleton className="h-3 w-40 rounded-sm" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-24 rounded-md" />
            <Skeleton className="h-6 w-28 rounded-md" />
            <Skeleton className="h-6 w-28 rounded-md" />
          </div>
        </div>
      </div>

      {/* 3. Hero Metrics Grid Skeleton (3 Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
          <div className="flex justify-between items-start">
            <Skeleton className="h-3 w-32 rounded-sm" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          <Skeleton className="h-10 w-28 rounded-md" />
          <Skeleton className="h-3 w-40 rounded-sm" />
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
          <div className="flex justify-between items-start">
            <Skeleton className="h-3 w-28 rounded-sm" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          <Skeleton className="h-10 w-28 rounded-md" />
          <Skeleton className="h-3 w-48 rounded-sm" />
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
          <div className="flex justify-between items-start">
            <Skeleton className="h-3 w-28 rounded-sm" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          <Skeleton className="h-10 w-20 rounded-md" />
          <Skeleton className="h-3 w-44 rounded-sm" />
        </div>
      </div>

      {/* 4. Actionable Queue Preview Skeleton */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <Skeleton className="h-4 w-40 rounded-md" />
          <Skeleton className="h-3 w-24 rounded-sm" />
        </div>
        <div className="p-5 space-y-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-48 rounded-md" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="h-4 w-16 rounded" />
                </div>
              </div>
              <div className="space-y-1.5 text-right flex flex-col items-end">
                <Skeleton className="h-4 w-20 rounded-md" />
                <Skeleton className="h-3 w-24 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}