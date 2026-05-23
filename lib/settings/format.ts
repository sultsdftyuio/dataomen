import { formatDistanceToNow } from "date-fns";

export function formatKeyLastUpdated(value: string | null, fallback = "Never") {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return formatDistanceToNow(parsed, { addSuffix: true });
}
