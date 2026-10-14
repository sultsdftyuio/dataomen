"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 30_000;

/**
 * While a scan is running, re-fetch the page every 30 seconds so statuses and
 * new matches appear without a manual reload. It pauses in background tabs
 * and stops as soon as no group is scanning.
 */
export function useScanRefresh(isScanning: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!isScanning) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isScanning, router]);
}
