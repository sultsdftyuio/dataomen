// app/(dashboard)/settings/loading.tsx
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full bg-slate-50/50 animate-in fade-in duration-300 font-sans">
      
      {/* 1. Left Navigation Sidebar Skeleton */}
      <aside className="w-full md:w-60 shrink-0 bg-white border-r border-slate-200/80 flex flex-col justify-between p-3">
        <div className="space-y-1.5 pt-1">
          <Skeleton className="h-8 w-full rounded-md bg-blue-50/80" />
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-8 w-full rounded-md" />
        </div>

        {/* Support Section Box Skeleton */}
        <div className="p-3 mt-8 rounded-lg bg-slate-50 border border-slate-200/70 space-y-2">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-6 w-full rounded" />
          <Skeleton className="h-7 w-full rounded" />
        </div>
      </aside>

      {/* 2. Main Settings Form Content Skeleton */}
      <main className="flex-1 p-6 md:p-8 lg:p-10 w-full max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 rounded-md" />
          <Skeleton className="h-4 w-80 sm:w-96 rounded-md" />
        </div>

        {/* Billing Status Card Skeleton */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
          <Skeleton className="h-4 w-3/4 rounded-md" />
        </div>

        {/* Form Fields Section Skeleton */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="space-y-1.5 border-b border-slate-100 pb-4">
            <Skeleton className="h-5 w-44 rounded-md" />
            <Skeleton className="h-3.5 w-64 rounded-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28 rounded-sm" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-32 rounded-sm" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>

          <div className="space-y-2">
            <Skeleton className="h-4 w-36 rounded-sm" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </div>

      </main>
    </div>
  );
}