// app/(dashboard)/dashboard/queue/loading.tsx
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function QueueLoading() {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300 font-sans">
      
      {/* 1. Header & Refresh Button */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-52 rounded-md" />
            <Skeleton className="h-4 w-80 sm:w-96 rounded-md" />
          </div>
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>

        {/* 2. Search Bar Skeleton */}
        <Skeleton className="h-9 max-w-[440px] w-full rounded-md" />
      </div>

      {/* 3. Filter Tabs Row Skeleton */}
      <div className="flex gap-2 p-1 bg-slate-100/80 border border-slate-200/80 rounded-lg w-fit">
        <Skeleton className="h-7 w-32 rounded-md bg-white shadow-2xs" />
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-7 w-28 rounded-md" />
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-7 w-28 rounded-md" />
      </div>

      {/* 4. Data Table Skeleton */}
      <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs">
        {/* Table Header Row */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-3 w-20 rounded-sm" />
          <Skeleton className="h-3 w-28 rounded-sm" />
          <Skeleton className="h-3 w-20 rounded-sm" />
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-3 w-20 rounded-sm" />
          <Skeleton className="h-3 w-16 rounded-sm ml-auto" />
        </div>

        {/* Table Rows Skeleton */}
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="px-4 py-3.5 flex items-center justify-between gap-4">
              <div className="space-y-1.5 w-48">
                <Skeleton className="h-4 w-36 rounded-md" />
                <Skeleton className="h-3 w-28 rounded-sm" />
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-20 rounded-md" />
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-4 w-24 rounded-md" />
              <div className="flex gap-2 ml-auto">
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}