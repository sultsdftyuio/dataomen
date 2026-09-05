type AccessEndCandidate = string | null | undefined;

function futureTimestamp(value: AccessEndCandidate, now: number): number | null {
  if (typeof value !== "string") return null;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now ? timestamp : null;
}

/**
 * Returns the latest verified paid-through boundary available to the service.
 *
 * Billing webhooks can arrive out of order and may contain a stale period-end
 * value. Choosing a later valid recorded boundary prevents a delayed webhook
 * from removing access the customer has already paid for.
 */
export function resolvePaidAccessEnd(
  candidates: readonly AccessEndCandidate[],
  now = Date.now(),
): string | null {
  let selected: { value: string; timestamp: number } | null = null;

  for (const candidate of candidates) {
    const timestamp = futureTimestamp(candidate, now);
    if (timestamp === null || typeof candidate !== "string") continue;

    if (!selected || timestamp > selected.timestamp) {
      selected = { value: candidate, timestamp };
    }
  }

  return selected?.value ?? null;
}
