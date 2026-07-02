// app/(dashboard)/dashboard/campaigns/loading.tsx
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function CampaignsLoading() {
  return (
    <div className="flex flex-col min-h-screen w-full bg-[#FAFAFA] p-6 lg:p-8 font-sans">
      <div className="flex flex-col h-full w-full max-w-[1240px] mx-auto space-y-6 pb-12">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>

        {/* 2-Column Layout Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column: Templates Skeleton */}
          <div className="lg:col-span-1 space-y-3">
            <Skeleton className="h-4 w-32 rounded-sm" />
            <div className="space-y-2">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>

          {/* Right Column: Table Skeleton */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-32 rounded-sm" />
              <Skeleton className="h-5 w-24 rounded-md" />
            </div>
            <Skeleton className="h-[400px] w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}