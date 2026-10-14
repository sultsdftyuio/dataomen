import { CircleDashed, Pause, type LucideIcon } from "lucide-react";

import type { StatusTone } from "@/components/ui/status-badge";
import type { WatchlistView } from "../prospect-types";

export type ScanState = {
  tone: StatusTone;
  label: string;
  icon?: LucideIcon;
  /** A scan is preparing or searching sources right now. */
  isScanning: boolean;
};

/**
 * The matching worker sets scan_status to "running" while it prepares the
 * brief and "queued" once source searches are handed off, but nothing writes
 * "completed" when those searches finish. A queued or running status older
 * than this window is therefore treated as a finished scan; otherwise every
 * scanned group would say "Scanning" forever.
 */
export const SCAN_ACTIVE_WINDOW_MS = 30 * 60 * 1000;

export function scanState(
  watchlist: Pick<WatchlistView, "isActive" | "scanStatus" | "lastScanAt">,
  now: number,
): ScanState {
  if (!watchlist.isActive) {
    return { tone: "neutral", label: "Paused", icon: Pause, isScanning: false };
  }

  const status = watchlist.scanStatus?.toLowerCase() ?? null;
  switch (status) {
    case "failed":
      return { tone: "danger", label: "Scan failed", isScanning: false };
    case "partial":
      return { tone: "warning", label: "Partial coverage", isScanning: false };
    case "completed":
      return { tone: "success", label: "Scanned", isScanning: false };
    case "queued":
    case "running": {
      const startedAt = watchlist.lastScanAt ? Date.parse(watchlist.lastScanAt) : Number.NaN;
      const isRecent = Number.isNaN(startedAt) || now - startedAt < SCAN_ACTIVE_WINDOW_MS;
      if (!isRecent) return { tone: "success", label: "Scanned", isScanning: false };
      return {
        tone: "progress",
        label: status === "running" ? "Preparing scan" : "Scanning",
        isScanning: true,
      };
    }
    default:
      return { tone: "neutral", label: "Not scanned", icon: CircleDashed, isScanning: false };
  }
}

export function formatShortDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

/** "3 days ago" style age for a post, falling back to a short date after a month. */
export function formatAge(value: string | null, now: number) {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "Just now" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return days === 1 ? "Yesterday" : `${days} days ago`;
  return formatShortDate(value);
}
