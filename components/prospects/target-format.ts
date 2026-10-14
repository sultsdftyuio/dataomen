import { normalizeSeedUrl } from "@/lib/targeting-brief";

/** Only render links that pass the same public-URL check as seed sites. */
export function publicHttpUrl(value: string | null): string | null {
  return value?.trim() ? normalizeSeedUrl(value) || null : null;
}

export function displayDomain(value: string | null): string | null {
  const safeUrl = publicHttpUrl(value);
  if (!safeUrl) return null;

  try {
    return new URL(safeUrl).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

export function formatTargetDate(value: string | null): string | null {
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    // These client components also render on the server. A fixed zone avoids
    // a one-day hydration shift near midnight.
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

/**
 * Times are shown in UTC (and labelled so) for the same hydration reason; an
 * unlabelled UTC time reads as local time and can be hours off.
 */
export function formatTargetDateTime(value: string | null): string | null {
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  const formatted = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(timestamp));
  return `${formatted} UTC`;
}
