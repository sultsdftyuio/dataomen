export const DISCOVERY_QUERY_TYPES = [
  "buyer_pain",
  "urgent_failure",
  "recommendation_request",
  "manual_workflow_frustration",
  "category_tool_search",
  "switching_trigger",
] as const;

export type DiscoveryQueryType = (typeof DISCOVERY_QUERY_TYPES)[number];

export type DiscoveryQuery = {
  query_type: DiscoveryQueryType;
  phrase: string;
};

const OPERATOR_LANGUAGE_PATTERNS = [
  /\bfind\s+buyers?\b/i,
  /\bbuyer\s+intent\b/i,
  /\bkeyword\s+noise\b/i,
  /\bqualified\s+leads?\b/i,
  /\bfind\s+(?:qualified\s+)?leads?\b/i,
  /\bfilter\s+leads?\b/i,
  /\blead\s+(?:matching|scoring|generation)\b/i,
  /\btrial\s+intent\b/i,
  /\b(?:reddit|hacker\s*news|twitter|x\.com)\b/i,
] as const;

export const DISCOVERY_QUERY_TYPE_LABELS: Record<DiscoveryQueryType, string> = {
  buyer_pain: "Buyer pain",
  urgent_failure: "Urgent failure",
  recommendation_request: "Recommendation request",
  manual_workflow_frustration: "Manual-workflow frustration",
  category_tool_search: "Category or tool search",
  switching_trigger: "Switching trigger",
};

export function isDiscoveryQueryType(value: unknown): value is DiscoveryQueryType {
  return (
    typeof value === "string" &&
    (DISCOVERY_QUERY_TYPES as readonly string[]).includes(value)
  );
}

export function discoveryQueryTypeLabel(value: string): string {
  return isDiscoveryQueryType(value)
    ? DISCOVERY_QUERY_TYPE_LABELS[value]
    : value.replace(/_/g, " ");
}

/**
 * Mirrors the profile-extraction contract for user-authored query plans. An
 * empty plan remains valid for legacy profiles that only have flat terms;
 * once a typed plan is supplied it must be complete and safe for HN/X.
 */
export function discoveryQueryPlanValidationError(
  queries: readonly DiscoveryQuery[],
): string | null {
  if (queries.length === 0) return null;

  if (queries.length !== DISCOVERY_QUERY_TYPES.length) {
    return "Provide exactly one phrase for each discovery query category.";
  }

  const queryTypes = new Set<DiscoveryQueryType>();
  const phrases = new Set<string>();

  for (const query of queries) {
    if (queryTypes.has(query.query_type)) {
      return "Each discovery query category may appear only once.";
    }
    queryTypes.add(query.query_type);

    const phrase = query.phrase.trim().replace(/\s+/g, " ");
    const words = phrase.split(" ").filter(Boolean);
    if (words.length < 2) {
      return "Each discovery phrase must contain at least two words.";
    }
    if (words.length > 14 || phrase.length > 140) {
      return "Discovery phrases must be concise buyer-language phrases.";
    }
    if (OPERATOR_LANGUAGE_PATTERNS.some((pattern) => pattern.test(phrase))) {
      return "Discovery phrases must describe a buyer problem, request, or switching event—not operator language or a source platform.";
    }

    const phraseKey = phrase.toLowerCase();
    if (phrases.has(phraseKey)) {
      return "Discovery phrases must be distinct.";
    }
    phrases.add(phraseKey);
  }

  const missingTypes = DISCOVERY_QUERY_TYPES.filter(
    (queryType) => !queryTypes.has(queryType),
  );
  if (missingTypes.length > 0) {
    return "Provide every discovery query category exactly once.";
  }

  return null;
}
