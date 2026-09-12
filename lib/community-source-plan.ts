import {
  DISCOVERY_QUERY_TYPES,
  type DiscoveryQuery,
} from "@/lib/discovery-queries";

export const COMMUNITY_SOURCE_ORDER = [
  "hackernews",
  "bluesky",
  "stackexchange",
  "github",
  "lemmy",
] as const;

export type CommunitySource = (typeof COMMUNITY_SOURCE_ORDER)[number];

export type CommunitySourcePlanInput = {
  valueProposition?: unknown;
  targetAudience?: unknown;
  coreProblem?: unknown;
  painPoints?: unknown;
  useCases?: unknown;
  buyingTriggers?: unknown;
  discoveryQueries?: unknown;
  searchTerms?: unknown;
};

export type CommunitySourcePlanEntry = {
  source: CommunitySource;
  label: string;
  community: string;
  rationale: string;
  queryTerms: string[];
};

export type CommunitySourcePlan = {
  sources: CommunitySourcePlanEntry[];
  suggestedPlaces: string[];
};

const TECHNICAL_TERMS = new Set([
  "api",
  "architecture",
  "backend",
  "cloud",
  "code",
  "database",
  "developer",
  "developers",
  "devops",
  "engineering",
  "frontend",
  "infrastructure",
  "integration",
  "integrations",
  "kubernetes",
  "observability",
  "sdk",
  "security",
]);

const OPEN_SOURCE_TERMS = new Set([
  "github",
  "open-source",
  "open source",
  "oss",
  "repository",
  "self-hosted",
  "self hosted",
]);

const COMMERCE_TERMS = new Set([
  "commerce",
  "ecommerce",
  "etsy",
  "listing",
  "listings",
  "marketplace",
  "seo",
  "shop",
  "shopify",
  "store",
  "stores",
]);

const SOURCE_DETAILS: Record<
  CommunitySource,
  Omit<CommunitySourcePlanEntry, "source" | "rationale" | "queryTerms">
> = {
  hackernews: {
    label: "Hacker News",
    community: "Founder, builder, and tool-evaluation discussions",
  },
  bluesky: {
    label: "Bluesky",
    community: "Public practitioner questions, requests, and recommendations",
  },
  stackexchange: {
    label: "Stack Exchange",
    community: "Problem-solving and architecture discussions in relevant Q&A sites",
  },
  github: {
    label: "GitHub",
    community: "Open-source tool evaluation and project discussions",
  },
  lemmy: {
    label: "Lemmy",
    community: "Independent technical and builder communities",
  },
};

const QUERY_TYPES_BY_SOURCE: Record<CommunitySource, DiscoveryQuery["query_type"][]> = {
  bluesky: ["recommendation_request", "buyer_pain", "urgent_failure"],
  hackernews: [
    "manual_workflow_frustration",
    "category_tool_search",
    "switching_trigger",
  ],
  stackexchange: [
    "urgent_failure",
    "manual_workflow_frustration",
    "category_tool_search",
  ],
  github: [
    "category_tool_search",
    "switching_trigger",
    "manual_workflow_frustration",
  ],
  lemmy: [
    "buyer_pain",
    "recommendation_request",
    "manual_workflow_frustration",
  ],
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function textList(value: unknown, limit = 6) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const item = text(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;

    seen.add(key);
    result.push(item);
    if (result.length === limit) break;
  }

  return result;
}

function typedQueries(value: unknown) {
  if (!Array.isArray(value)) return [] as DiscoveryQuery[];

  const queries: DiscoveryQuery[] = [];
  const seen = new Set<string>();
  for (const rawQuery of value) {
    if (
      !rawQuery ||
      typeof rawQuery !== "object" ||
      Array.isArray(rawQuery)
    ) {
      continue;
    }

    const query = rawQuery as Record<string, unknown>;
    const queryType = text(query.query_type);
    const phrase = text(query.phrase);
    const key = `${queryType}\u0000${phrase.toLowerCase()}`;
    if (
      !phrase ||
      !(DISCOVERY_QUERY_TYPES as readonly string[]).includes(queryType) ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    queries.push({
      query_type: queryType as DiscoveryQuery["query_type"],
      phrase,
    });
  }

  return queries;
}

function tokenSet(values: readonly string[]) {
  return new Set(
    values
      .join(" ")
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9_-]*/g) ?? [],
  );
}

function hasContextTerm(
  allText: string,
  tokens: ReadonlySet<string>,
  terms: ReadonlySet<string>,
) {
  return [...terms].some(
    (term) => term.includes(" ") ? allText.includes(term) : tokens.has(term),
  );
}

function selectedSources(
  allText: string,
  tokens: ReadonlySet<string>,
): CommunitySource[] {
  // Every profile retains two complementary public conversation sources. The
  // technical communities are deliberately opt-in from product-owned context,
  // which prevents generic B2B searches from turning into noisy code tickets.
  const selected: CommunitySource[] = ["hackernews", "bluesky"];
  const isTechnical = hasContextTerm(allText, tokens, TECHNICAL_TERMS);
  const isOpenSource = hasContextTerm(allText, tokens, OPEN_SOURCE_TERMS);
  const isCommerce = hasContextTerm(allText, tokens, COMMERCE_TERMS);

  if (isTechnical || isCommerce) selected.push("stackexchange");
  if (isOpenSource) selected.push("github");
  if (isTechnical || isOpenSource) selected.push("lemmy");

  return COMMUNITY_SOURCE_ORDER.filter((source) => selected.includes(source));
}

function queryTermsForSource(
  source: CommunitySource,
  queries: readonly DiscoveryQuery[],
  fallbackTerms: readonly string[],
) {
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const queryType of QUERY_TYPES_BY_SOURCE[source]) {
    const phrase = queries.find((query) => query.query_type === queryType)?.phrase;
    const key = phrase?.toLowerCase();
    if (!phrase || !key || seen.has(key)) continue;

    seen.add(key);
    selected.push(phrase);
  }

  for (const phrase of fallbackTerms) {
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    selected.push(phrase);
    if (selected.length >= 3) break;
  }

  return selected.slice(0, 3);
}

function rationaleForSource(
  source: CommunitySource,
  isTechnical: boolean,
  isCommerce: boolean,
) {
  if (source === "stackexchange") {
    return isCommerce
      ? "Commerce and search-visibility wording points to relevant webmaster Q&A."
      : "The product language includes technical implementation or architecture work."
  }
  if (source === "github") {
    return "The website explicitly signals open-source or repository-based evaluation."
  }
  if (source === "lemmy") {
    return "Technical and builder language makes independent communities a useful secondary check."
  }
  if (source === "hackernews") {
    return "Useful for builder, operator, and software-tool evaluation conversations."
  }
  return "Useful for direct practitioner questions, frustrations, and requests for recommendations.";
}

/**
 * Derives a bounded public-community plan from a website profile. The plan is
 * a hypothesis, not a claim that a named group contains demand. Its selected
 * source IDs are compatible with existing Watchlist source preferences.
 */
export function deriveCommunitySourcePlan(
  input: CommunitySourcePlanInput,
): CommunitySourcePlan {
  const queries = typedQueries(input.discoveryQueries);
  const context = [
    text(input.valueProposition),
    ...textList(input.targetAudience),
    text(input.coreProblem),
    ...textList(input.painPoints),
    ...textList(input.useCases),
    ...textList(input.buyingTriggers),
  ].filter(Boolean);
  const fallbackTerms = textList([
    ...queries.map((query) => query.phrase),
    ...textList(input.searchTerms),
    text(input.coreProblem),
    ...textList(input.painPoints),
  ]);
  const allText = context.join(" ").toLowerCase();
  const tokens = tokenSet(context);
  const isTechnical = hasContextTerm(allText, tokens, TECHNICAL_TERMS);
  const isCommerce = hasContextTerm(allText, tokens, COMMERCE_TERMS);

  const sources = selectedSources(allText, tokens).map((source) => ({
    source,
    ...SOURCE_DETAILS[source],
    rationale: rationaleForSource(source, isTechnical, isCommerce),
    queryTerms: queryTermsForSource(source, queries, fallbackTerms),
  }));

  return {
    sources,
    suggestedPlaces: sources.map(
      (entry) => `${entry.label}: ${entry.community}`,
    ),
  };
}
