"use client";

import { useRouter } from "next/navigation";

import { LoadError } from "@/components/dashboard/LoadError";

/** A LoadError whose retry re-runs the page's server loaders. */
export function RefreshLoadError({ thing, description }: { thing: string; description?: string }) {
  const router = useRouter();
  return <LoadError thing={thing} description={description} onRetry={() => router.refresh()} />;
}
