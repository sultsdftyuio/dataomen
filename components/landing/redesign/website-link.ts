export function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function freeBriefHref(website?: string): string {
  if (!website) return "/register?tier=free";
  const next = `/onboarding/workspace?website=${encodeURIComponent(website)}`;
  return `/register?tier=free&next=${encodeURIComponent(next)}`;
}

export function pilotHref(website?: string): string {
  return website ? `/pilot?website=${encodeURIComponent(website)}` : "/pilot";
}
