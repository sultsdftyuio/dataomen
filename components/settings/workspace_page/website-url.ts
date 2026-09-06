export function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Website URL is required.");

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (!parsed.hostname || !["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Enter a valid HTTP(S) website URL.");
  }

  parsed.hash = "";
  return parsed.toString();
}

export function websiteDomain(value: string) {
  try {
    return new URL(
      /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`,
    ).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}
