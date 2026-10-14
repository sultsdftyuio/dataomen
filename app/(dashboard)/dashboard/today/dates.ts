// Dates are formatted in UTC so the server render and the browser agree on
// the text. Relative words ("Today") can still differ across a UTC midnight,
// so callers render them in <time suppressHydrationWarning>.

const DAY_MS = 86_400_000;

function parse(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function utcDayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

/** "Oct 12, 2026": for titles and anywhere the exact day matters. */
export function fullDate(value: string | null): string {
  const date = parse(value);
  if (!date) return "Date unavailable";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

/** "Today", "Yesterday", "Oct 8", or "Oct 8, 2025" outside the current year. */
export function shortDate(value: string | null, now: Date = new Date()): string {
  const date = parse(value);
  if (!date) return "Date unavailable";
  const daysAgo = utcDayNumber(now) - utcDayNumber(date);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear();
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(date);
}
