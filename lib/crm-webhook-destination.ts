import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * A deliberately narrow policy for a customer-configured CRM webhook. The
 * caller must still pin the returned addresses for the actual connection; a
 * DNS preflight by itself is not sufficient protection against DNS rebinding.
 */
export type WebhookAddress = {
  address: string;
  family: 4 | 6;
};

export type WebhookDnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<ReadonlyArray<WebhookAddress>>;

export type WebhookDestinationPolicy = {
  /** Set this from NODE_ENV rather than trusting a client-provided value. */
  production: boolean;
  /**
   * Allows HTTP loopback endpoints only for local integration tests. It never
   * permits private LAN addresses and is ignored in production.
   */
  allowLocalhost: boolean;
  lookup?: WebhookDnsLookup;
  /** Internal override for deterministic tests; production uses the default. */
  dnsTimeoutMs?: number;
};

export type ValidatedWebhookDestination = {
  url: URL;
  addresses: readonly WebhookAddress[];
};

const LOOPBACK_HOSTNAMES = new Set(["localhost", "localhost."]);
export const CRM_WEBHOOK_DNS_TIMEOUT_MS = 2_000;

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return null;
  }

  const octets = parts.map(Number);
  return octets.some((octet) => octet > 255) ? null : octets;
}

function isBlockedIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return true;

  const [first, second, third] = octets;

  // IANA special-purpose IPv4 blocks: unspecified/current-network, private,
  // shared address space, loopback, link-local, documentation/benchmarking,
  // multicast and future-reserved space.
  return (
    first === 0 ||
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 88 && third === 99) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isLoopbackIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  return Boolean(octets && octets[0] === 127);
}

function parseIpv6(address: string): number[] | null {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized || normalized.includes("%")) return null;

  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (
    left.some((part) => !/^[0-9a-f]{1,4}$/.test(part)) ||
    right.some((part) => !/^[0-9a-f]{1,4}$/.test(part))
  ) {
    return null;
  }

  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;

  return [...left, ...Array(missing).fill("0"), ...right].map((part) =>
    Number.parseInt(part, 16),
  );
}

function hasPrefix(words: readonly number[], prefix: readonly number[]): boolean {
  return prefix.every((word, index) => words[index] === word);
}

function isIpv6InPrefix(
  words: readonly number[],
  prefix: readonly number[],
  bits: number,
): boolean {
  const fullWords = Math.floor(bits / 16);
  const remainder = bits % 16;
  if (!hasPrefix(words, prefix.slice(0, fullWords))) return false;
  if (!remainder) return true;

  const mask = (0xffff << (16 - remainder)) & 0xffff;
  return (words[fullWords] & mask) === (prefix[fullWords] & mask);
}

function ipv4FromWords(words: readonly number[]): string {
  return [
    words[6] >> 8,
    words[6] & 0xff,
    words[7] >> 8,
    words[7] & 0xff,
  ].join(".");
}

function isBlockedIpv6(address: string): boolean {
  const words = parseIpv6(address);
  if (!words) return true;

  const allZero = words.every((word) => word === 0);
  const isLoopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  if (allZero || isLoopback) return true;

  // IPv4-compatible and IPv4-mapped IPv6 literals must inherit the IPv4
  // policy rather than becoming a bypass for loopback/private destinations.
  const ipv4Compatible = words.slice(0, 6).every((word) => word === 0);
  const ipv4Mapped =
    words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (ipv4Compatible || ipv4Mapped) {
    return isBlockedIpv4(ipv4FromWords(words));
  }

  // IANA special-purpose IPv6 ranges, including local, link-local,
  // documentation, benchmarking and multicast ranges.
  return (
    isIpv6InPrefix(words, [0x0064, 0xff9b, 0, 0, 0, 0, 0, 0], 96) ||
    isIpv6InPrefix(words, [0x0064, 0xff9b, 0x0001, 0, 0, 0, 0, 0], 48) ||
    isIpv6InPrefix(words, [0x0100, 0, 0, 0, 0, 0, 0, 0], 64) ||
    isIpv6InPrefix(words, [0x2001, 0, 0, 0, 0, 0, 0, 0], 23) ||
    isIpv6InPrefix(words, [0x2001, 0x0002, 0, 0, 0, 0, 0, 0], 48) ||
    isIpv6InPrefix(words, [0x2001, 0x0010, 0, 0, 0, 0, 0, 0], 28) ||
    isIpv6InPrefix(words, [0x2001, 0x0020, 0, 0, 0, 0, 0, 0], 28) ||
    isIpv6InPrefix(words, [0x2001, 0x0db8, 0, 0, 0, 0, 0, 0], 32) ||
    isIpv6InPrefix(words, [0x2002, 0, 0, 0, 0, 0, 0, 0], 16) ||
    isIpv6InPrefix(words, [0x3fff, 0, 0, 0, 0, 0, 0, 0], 20) ||
    isIpv6InPrefix(words, [0x5f00, 0, 0, 0, 0, 0, 0, 0], 16) ||
    isIpv6InPrefix(words, [0xfc00, 0, 0, 0, 0, 0, 0, 0], 7) ||
    isIpv6InPrefix(words, [0xfe80, 0, 0, 0, 0, 0, 0, 0], 10) ||
    isIpv6InPrefix(words, [0xff00, 0, 0, 0, 0, 0, 0, 0], 8)
  );
}

export function isLoopbackAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isLoopbackIpv4(address);
  if (family !== 6) return false;

  const words = parseIpv6(address);
  return Boolean(
    words && words.slice(0, 7).every((word) => word === 0) && words[7] === 1,
  );
}

export function isPublicRoutableAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !isBlockedIpv4(address);
  if (family === 6) return !isBlockedIpv6(address);
  return false;
}

function containsUserInfo(rawUrl: string): boolean {
  const schemeEnd = rawUrl.indexOf("://");
  if (schemeEnd === -1) return false;

  const authorityStart = schemeEnd + 3;
  const authorityEnd = rawUrl.slice(authorityStart).search(/[/?#]/);
  const authority =
    authorityEnd === -1
      ? rawUrl.slice(authorityStart)
      : rawUrl.slice(authorityStart, authorityStart + authorityEnd);
  return authority.includes("@");
}

function isExplicitLocalhost(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase()) || isLoopbackAddress(hostname);
}

function isPermittedAddress(
  address: string,
  policy: Pick<WebhookDestinationPolicy, "allowLocalhost" | "production">,
): boolean {
  if (isPublicRoutableAddress(address)) return true;
  return !policy.production && policy.allowLocalhost && isLoopbackAddress(address);
}

/**
 * Returns a URL plus the vetted DNS answers for a webhook destination. It
 * never returns a target that resolves to a private, link-local, loopback, or
 * other reserved address. The one exception is an explicitly enabled
 * localhost-only test endpoint outside production.
 */
export async function validateWebhookDestination(
  rawUrl: string | null | undefined,
  policy: WebhookDestinationPolicy,
): Promise<ValidatedWebhookDestination | null> {
  const trimmed = rawUrl?.trim();
  if (!trimmed || containsUserInfo(trimmed)) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  // WHATWG URL keeps IPv6 brackets in `hostname` on some supported Node
  // versions; the DNS/IP helpers consistently expect the bare literal.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const localTestingAllowed = !policy.production && policy.allowLocalhost;
  const isHttps = url.protocol === "https:";
  const isExplicitLocalTarget = isExplicitLocalhost(hostname);
  if (
    (!isHttps && !(localTestingAllowed && isExplicitLocalTarget && url.protocol === "http:")) ||
    !hostname ||
    url.username ||
    url.password
  ) {
    return null;
  }

  const literalFamily = isIP(hostname);
  if (literalFamily) {
    return isPermittedAddress(hostname, policy)
      ? { url, addresses: [{ address: hostname, family: literalFamily as 4 | 6 }] }
      : null;
  }

  let addresses: ReadonlyArray<WebhookAddress>;
  try {
    const lookup: WebhookDnsLookup =
      policy.lookup ??
      (async (lookupHostname, lookupOptions) =>
        (await dnsLookup(lookupHostname, lookupOptions)) as ReadonlyArray<WebhookAddress>);
    const dnsTimeoutMs = policy.dnsTimeoutMs ?? CRM_WEBHOOK_DNS_TIMEOUT_MS;
    if (dnsTimeoutMs <= 0) return null;
    addresses = await new Promise<ReadonlyArray<WebhookAddress>>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("CRM webhook DNS lookup timed out.")),
        dnsTimeoutMs,
      );
      try {
        lookup(hostname, { all: true, verbatim: true }).then(
          (records) => {
            clearTimeout(timeout);
            resolve(records);
          },
          (error: unknown) => {
            clearTimeout(timeout);
            reject(error);
          },
        );
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  } catch {
    return null;
  }

  if (
    addresses.length === 0 ||
    addresses.some(
      (record) =>
        (record.family !== 4 && record.family !== 6) ||
        !isPermittedAddress(record.address, policy),
    )
  ) {
    return null;
  }

  // A local exception should remain exactly local: prevent a deceptive
  // hostname such as "localhost.example" from becoming eligible just because
  // it happens to resolve to a loopback address in a development machine.
  if (
    addresses.some((record) => isLoopbackAddress(record.address)) &&
    !isExplicitLocalTarget
  ) {
    return null;
  }

  return { url, addresses };
}

/**
 * Local HTTP callbacks are useful for an integration test server but must be
 * deliberately enabled. This flag is ignored in production.
 */
export function localWebhookTestingEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    environment.NODE_ENV !== "production" &&
    environment.ARCLI_ALLOW_LOCAL_CRM_WEBHOOKS === "true"
  );
}
