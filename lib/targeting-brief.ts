/**
 * A targeting brief describes the kinds of public targets Arcli may research.
 * It is intentionally separate from the matching brief: fit and a strong
 * buyer signal are different claims, and the latter always needs evidence.
 */

export const TARGET_TYPES = ["account", "builder", "project"] as const;

export type TargetType = (typeof TARGET_TYPES)[number];

export type TargetingBriefInput = {
  targetTypes: TargetType[];
  idealCustomerTraits: string[];
  changeTriggers: string[];
  strongEvidenceDefinitions: string[];
  exclusions: string[];
  seedUrls: string[];
};

export type TargetingBriefView = TargetingBriefInput & {
  id: string | null;
  hasBrief: boolean;
  updatedAt: string | null;
};

export const EMPTY_TARGETING_BRIEF_INPUT: TargetingBriefInput = {
  targetTypes: [],
  idealCustomerTraits: [],
  changeTriggers: [],
  strongEvidenceDefinitions: [],
  exclusions: [],
  seedUrls: [],
};

export const TARGETING_BRIEF_LIMITS = {
  maxItemsPerField: 20,
  maxTextLength: 240,
  maxSeedUrlLength: 2_000,
} as const;

function isTargetType(value: unknown): value is TargetType {
  return typeof value === "string" && (TARGET_TYPES as readonly string[]).includes(value);
}

function normalizeText(
  value: unknown,
  maxLength: number = TARGETING_BRIEF_LIMITS.maxTextLength,
) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

/**
 * This is an early UX boundary only. The database and fetch worker remain the
 * authority because a hostname can resolve differently over time. Rejecting
 * obvious local destinations here prevents a confusing save failure and keeps
 * browser-opened evidence links from pointing at a local service.
 */
function isClearlyPrivateNetworkHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host === "local" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }

  // WHATWG URL serializes IPv6 hosts inside brackets. These ranges are never
  // valid public crawl destinations; mapped IPv4 is rejected wholesale so an
  // alternative IPv6 spelling cannot conceal a private IPv4 address.
  if (host.startsWith("[") && host.endsWith("]")) {
    const address = host.slice(1, -1);
    return (
      address === "::1" ||
      address.startsWith("fe8") ||
      address.startsWith("fe9") ||
      address.startsWith("fea") ||
      address.startsWith("feb") ||
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      address.startsWith("::ffff:")
    );
  }

  const octets = host.split(".");
  if (
    octets.length !== 4 ||
    octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)
  ) {
    return false;
  }

  const [first, second] = octets.map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function normalizeTextList(value: unknown, maxLength?: number) {
  const values = Array.isArray(value) ? value : [];
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of values) {
    const text = normalizeText(item, maxLength);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;

    seen.add(key);
    normalized.push(text);
    if (normalized.length === TARGETING_BRIEF_LIMITS.maxItemsPerField) break;
  }

  return normalized;
}

/**
 * Seed URLs are public references that help Arcli find a target. We retain a
 * path (projects and launch pages often live below a domain) but drop hashes,
 * which do not identify a separate public source.
 */
export function normalizeSeedUrl(value: unknown) {
  const text = normalizeText(value, TARGETING_BRIEF_LIMITS.maxSeedUrlLength);
  if (!text) return "";

  // Detect every URI scheme before adding https. Otherwise `mailto:` would
  // become a syntactically valid hostname (`https://mailto:...`) instead of
  // being rejected as a non-public source.
  const urlCandidate = /^[a-z][a-z\d+.-]*:/i.test(text)
    ? text
    : `https://${text}`;

  try {
    const url = new URL(urlCandidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    // Credentials are neither needed for public discovery nor safe to retain
    // in a workspace targeting brief. The database repeats this validation.
    if (url.username || url.password) return "";
    if (isClearlyPrivateNetworkHost(url.hostname)) return "";

    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeSeedUrls(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of values) {
    const url = normalizeSeedUrl(item);
    const key = url.toLocaleLowerCase();
    if (!url || seen.has(key)) continue;

    seen.add(key);
    normalized.push(url);
    if (normalized.length === TARGETING_BRIEF_LIMITS.maxItemsPerField) break;
  }

  return normalized;
}

/**
 * Keep browser drafts, server actions, and database reads on one conservative
 * shape. Unknown values are discarded rather than becoming targeting input.
 */
export function normalizeTargetingBriefInput(
  value: Partial<TargetingBriefInput> | null | undefined,
): TargetingBriefInput {
  const rawTargetTypes = Array.isArray(value?.targetTypes)
    ? value.targetTypes
    : [];
  const targetTypes = Array.from(
    new Set(rawTargetTypes.filter(isTargetType)),
  );

  return {
    targetTypes,
    idealCustomerTraits: normalizeTextList(value?.idealCustomerTraits),
    changeTriggers: normalizeTextList(value?.changeTriggers),
    strongEvidenceDefinitions: normalizeTextList(
      value?.strongEvidenceDefinitions,
    ),
    exclusions: normalizeTextList(value?.exclusions),
    seedUrls: normalizeSeedUrls(value?.seedUrls),
  };
}

export function emptyTargetingBriefView(): TargetingBriefView {
  return {
    id: null,
    hasBrief: false,
    updatedAt: null,
    ...EMPTY_TARGETING_BRIEF_INPUT,
  };
}
