/** Client-safe compatibility check for the current retained evidence executor.
 *
 * Monitoring is intentionally narrower than a generic public URL. It applies
 * only to an exact builder profile locator that the worker can map to already
 * retained public records without fetching the profile or enumerating history.
 */
const SUPPORTED_RETAINED_MONITOR_LOCATORS = [
  /^https:\/\/github[.]com\/[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?\/?$/,
  /^https:\/\/bsky[.]app\/profile\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\/?$/,
  /^https:\/\/news[.]ycombinator[.]com\/user[?]id=[a-z0-9_-]{1,64}$/,
] as const;

export function supportsRetainedPublicTargetMonitoring(
  entityKind: string,
  canonicalUrl: string | null | undefined,
): boolean {
  if (entityKind !== "builder" || !canonicalUrl?.trim()) return false;

  // Keep this byte-for-byte narrowness aligned with the database function.
  // URL parsing would normalize default ports and encoded query parameters,
  // which can make the browser offer an action the server must reject.
  const normalized = canonicalUrl.trim().toLowerCase();
  return SUPPORTED_RETAINED_MONITOR_LOCATORS.some((pattern) => pattern.test(normalized));
}
