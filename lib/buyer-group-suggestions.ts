/**
 * Website-derived buyer-group hypotheses.
 *
 * A website is enough to suggest a few focused directions, but not enough to
 * claim that public demand has been proven. These records are intentionally
 * bounded, explainable hypotheses that can be activated through the existing
 * Watchlist workflow. The same pure function runs in the server action and
 * the dashboard, so a browser cannot alter the group that is persisted.
 */

import {
  deriveCommunitySourcePlan,
  type CommunitySourcePlan,
} from "@/lib/community-source-plan";

/**
 * Retained for callers that imported this original source universe. New
 * website-derived groups use the narrower, product-aware community plan.
 */
export const DEFAULT_BUYER_GROUP_SOURCES = [
  "hackernews",
  "bluesky",
  "lemmy",
  "stackexchange",
  "github",
] as const;

export type BuyerGroupSource = (typeof DEFAULT_BUYER_GROUP_SOURCES)[number];

export type BuyerGroupSuggestion = {
  id: string;
  name: string;
  targetBuyer: string;
  problemToSolve: string;
  includeTerms: string[];
  excludeTerms: string[];
  sourcePreferences: BuyerGroupSource[];
  suggestedPlaces: string[];
  communityPlan: CommunitySourcePlan;
  rationale: string;
  evidence: string[];
};

export type BuyerGroupSuggestionProfile = {
  companyName?: string | null;
  targetAudience?: unknown;
  coreProblem?: unknown;
  uniqueValueProp?: unknown;
  useCases?: unknown;
  painPoints?: unknown;
  buyingTriggers?: unknown;
  negativeKeywords?: unknown;
  excludedAudiences?: unknown;
  buyerGroups?: unknown;
  discoveryQueries?: unknown;
  searchTerms?: unknown;
};

type GroupSeed = {
  name?: string;
  targetBuyer: string;
  problemToSolve: string;
  includeTerms: string[];
  rationale?: string;
};

const MAX_SUGGESTIONS = 3;
const MAX_TEXT_LENGTH = 500;
const MAX_TERM_LENGTH = 180;
const MAX_NAME_LENGTH = 120;

function compactText(value: unknown, maximum = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function textList(value: unknown, maximum: number, itemLength = MAX_TERM_LENGTH) {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : [];
  const seen = new Set<string>();
  const values: string[] = [];

  for (const rawItem of rawItems) {
    const item = compactText(rawItem, itemLength);
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    values.push(item);
    if (values.length >= maximum) break;
  }

  return values;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function slug(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleLowerCase();
  return normalized.slice(0, 44) || "group";
}

function suggestionId(targetBuyer: string, problemToSolve: string, index: number) {
  return `website-${index + 1}-${slug(targetBuyer)}-${slug(problemToSolve)}`.slice(0, 120);
}

const NAME_TARGET_LENGTH = 56;
const NAME_MAX_WORDS = 9;

// A short name must not end on one of these: "…ship quality by" reads as a
// sentence cut off mid-thought rather than the name of an audience.
const TRAILING_FILLER = new Set([
  "a", "an", "the", "and", "or", "but", "nor", "of", "to", "for", "by",
  "with", "without", "in", "on", "at", "from", "into", "over", "under",
  "about", "as", "than", "via", "per", "who", "that", "which", "whose",
  "where", "when", "while", "so", "because", "using", "their", "its", "our",
  "your", "is", "are", "be", "can", "&", "+", "-", "\u2013", "\u2014",
]);

// Words that open a qualifying clause. Cutting just before one keeps the
// head noun phrase ("Design + engineering orgs" from "… orgs that need …").
const CLAUSE_OPENERS = new Set([
  "who", "that", "which", "whose", "where", "when", "while", "because", "by",
  "using", "via", "with", "without",
]);

// Common nouns that end in "-ing" and so must not be read as the start of a
// participle phrase ("Design + engineering orgs", "Marketing teams").
const ING_NOUNS = new Set([
  "engineering", "marketing", "accounting", "manufacturing", "consulting",
  "hosting", "banking", "pricing", "training", "publishing", "staffing",
  "recruiting", "onboarding", "billing", "learning", "computing", "gaming",
  "shipping", "operating", "funding", "housing", "nursing", "lending",
]);
const CONNECTORS = new Set(["+", "&", "and", "or", "of", "for"]);
const CONJUNCTIONS = new Set(["and", "or", "but"]);

function words(value: string) {
  return value.split(" ").filter(Boolean);
}

function fitsName(value: string) {
  return value.length <= NAME_TARGET_LENGTH && words(value).length <= NAME_MAX_WORDS;
}

function tidyName(value: string) {
  const parts = words(value.replace(/[\s,;:.!?\u2013\u2014-]+$/, ""));
  while (parts.length > 1 && TRAILING_FILLER.has(parts[parts.length - 1].toLocaleLowerCase())) {
    parts.pop();
  }
  const name = parts.join(" ").replace(/[\s,;:.!?\u2013\u2014-]+$/, "");
  return name.charAt(0).toLocaleUpperCase() + name.slice(1);
}

/**
 * Shortens an audience or problem sentence into a complete, readable name.
 * It prefers natural boundaries (clause punctuation, then a relative clause
 * or "-ing" phrase) over a word count, and never ends on a filler word.
 */
export function shortGroupName(value: string) {
  let text = value
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:!?]+$/, "");
  if (!text) return "";
  if (fitsName(text)) return tidyName(text);

  const beforePunctuation = text.split(/\s*(?:[,;:\u2013\u2014]|\s-\s)\s*/)[0] ?? text;
  if (words(beforePunctuation).length >= 2) text = beforePunctuation;
  if (fitsName(text)) return tidyName(text);

  const parts = words(text);
  const clauseStart = parts.findIndex((word, index) => {
    if (index < 2) return false;
    const lower = word.toLocaleLowerCase();
    if (CLAUSE_OPENERS.has(lower)) return true;
    return /^[a-z]{3,}ing$/.test(lower)
      && !ING_NOUNS.has(lower)
      && !CONNECTORS.has(parts[index - 1].toLocaleLowerCase());
  });
  if (clauseStart >= 2) text = parts.slice(0, clauseStart).join(" ");
  if (fitsName(text)) return tidyName(text);

  const kept: string[] = [];
  for (const word of words(text)) {
    const next = [...kept, word].join(" ");
    if (kept.length >= NAME_MAX_WORDS || next.length > NAME_TARGET_LENGTH) break;
    kept.push(word);
  }
  // End before a trailing "and/or" branch rather than halfway through it.
  const lastConjunction = kept.findLastIndex(
    (word, index) => index >= 3 && CONJUNCTIONS.has(word.toLocaleLowerCase()),
  );
  if (lastConjunction >= 3) kept.splice(lastConjunction);
  return tidyName(kept.join(" ") || text.slice(0, NAME_TARGET_LENGTH));
}

/**
 * Names each suggestion after its audience. When several suggestions share
 * an audience (one audience, several problems), they are named after their
 * problems instead so the cards stay distinguishable.
 */
function distinctNames(seeds: GroupSeed[]) {
  const audienceNames = seeds.map((seed) => shortGroupName(seed.targetBuyer));
  const counts = new Map<string, number>();
  for (const name of audienceNames) {
    const key = name.toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const used = new Set<string>();
  return seeds.map((seed, index) => {
    const provided = compactText(seed.name, MAX_NAME_LENGTH);
    let name = provided || audienceNames[index];
    if (!provided && (counts.get(name.toLocaleLowerCase()) ?? 0) > 1) {
      name = shortGroupName(seed.problemToSolve) || name;
    }
    let candidate = name.slice(0, MAX_NAME_LENGTH);
    for (let suffix = 2; used.has(candidate.toLocaleLowerCase()); suffix += 1) {
      candidate = `${name} (${suffix})`.slice(0, MAX_NAME_LENGTH);
    }
    used.add(candidate.toLocaleLowerCase());
    return candidate;
  });
}

function seedFromRecord(value: unknown): GroupSeed | null {
  const record = asRecord(value);
  if (!record) return null;

  const targetBuyer = compactText(
    record.target_buyer ?? record.targetBuyer ?? record.audience,
  );
  const problemToSolve = compactText(
    record.problem_to_solve ?? record.problemToSolve ?? record.problem,
    700,
  );
  if (targetBuyer.length < 3 || problemToSolve.length < 3) return null;

  return {
    name: compactText(record.name, MAX_NAME_LENGTH) || undefined,
    targetBuyer,
    problemToSolve,
    includeTerms: textList(
      record.include_terms ?? record.includeTerms ?? record.evidence,
      4,
    ),
    rationale: compactText(record.rationale ?? record.why ?? record.reason, 420) || undefined,
  };
}

function fallbackSeeds(profile: BuyerGroupSuggestionProfile): GroupSeed[] {
  const audiences = textList(profile.targetAudience, MAX_SUGGESTIONS, 500);
  const problems = textList(
    [
      compactText(profile.coreProblem, 700),
      ...textList(profile.painPoints, 3, 700),
      ...textList(profile.useCases, 3, 700),
    ],
    MAX_SUGGESTIONS,
    700,
  );
  if (problems.length === 0) return [];
  const primaryProblem = problems[0] ?? "the operational problem described on the website";
  const targets = audiences.length > 0
    ? audiences
    : ["Teams actively trying to solve this problem"];
  const terms = textList(
    [
      ...problems,
      ...textList(profile.buyingTriggers, 3, MAX_TERM_LENGTH),
    ],
    4,
  );

  const seeds: GroupSeed[] = [];

  // First cover distinct audiences against the primary commercial problem.
  // If a website describes only one audience, use the remaining explicit
  // pains/use cases as alternate directions for that same audience instead.
  for (const targetBuyer of targets) {
    seeds.push({ targetBuyer, problemToSolve: primaryProblem, includeTerms: terms });
    if (seeds.length >= MAX_SUGGESTIONS) return seeds;
  }
  for (const problemToSolve of problems.slice(1)) {
    seeds.push({
      targetBuyer: targets[0],
      problemToSolve,
      includeTerms: terms,
    });
    if (seeds.length >= MAX_SUGGESTIONS) break;
  }

  return seeds;
}

function uniqueSeeds(profile: BuyerGroupSuggestionProfile) {
  const explicitSeeds = Array.isArray(profile.buyerGroups)
    ? profile.buyerGroups
      .map(seedFromRecord)
      .filter((seed): seed is GroupSeed => Boolean(seed))
    : [];
  const fallback = fallbackSeeds(profile);
  const seeds = [...explicitSeeds, ...fallback];
  const seen = new Set<string>();

  return seeds.filter((seed) => {
    const key = `${seed.targetBuyer}\u0000${seed.problemToSolve}`.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_SUGGESTIONS);
}

/**
 * Creates a small, readable demand map from an extracted website profile.
 * Suggestions deliberately say "website-derived" in the UI because source
 * conversations must still validate the hypothesis before becoming leads.
 */
export function deriveBuyerGroupSuggestions(
  profile: BuyerGroupSuggestionProfile,
): BuyerGroupSuggestion[] {
  const companyName = compactText(profile.companyName, 120);
  const exclusions = textList(
    [
      ...textList(profile.negativeKeywords, 6),
      ...textList(profile.excludedAudiences, 6),
    ],
    6,
  );

  const seeds = uniqueSeeds(profile);
  const names = distinctNames(seeds);

  return seeds.map((seed, index) => {
    const communityPlan = deriveCommunitySourcePlan({
      valueProposition: profile.uniqueValueProp,
      targetAudience: [seed.targetBuyer],
      coreProblem: seed.problemToSolve,
      painPoints: profile.painPoints,
      useCases: profile.useCases,
      buyingTriggers: profile.buyingTriggers,
      discoveryQueries: profile.discoveryQueries,
      searchTerms: profile.searchTerms,
    });
    const evidence = [
      `Website audience: ${seed.targetBuyer}`,
      `Website problem: ${seed.problemToSolve}`,
    ];
    const rationale = seed.rationale ?? (
      companyName
        ? `${companyName}'s website connects this audience to this problem.`
        : "The website connects this audience to this problem."
    );

    return {
      id: suggestionId(seed.targetBuyer, seed.problemToSolve, index),
      name: names[index],
      targetBuyer: seed.targetBuyer,
      problemToSolve: seed.problemToSolve,
      includeTerms: textList(
        [seed.problemToSolve, ...seed.includeTerms],
        4,
      ),
      excludeTerms: exclusions,
      sourcePreferences: communityPlan.sources.map((entry) => entry.source),
      suggestedPlaces: communityPlan.suggestedPlaces,
      communityPlan,
      rationale,
      evidence,
    };
  });
}
