/**
 * Website-derived buyer-group hypotheses.
 *
 * A website is enough to suggest a few focused directions, but not enough to
 * claim that public demand has been proven. These records are intentionally
 * bounded, explainable hypotheses that can be activated through the existing
 * Watchlist workflow. The same pure function runs in the server action and
 * the dashboard, so a browser cannot alter the group that is persisted.
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
  rationale: string;
  evidence: string[];
};

export type BuyerGroupSuggestionProfile = {
  companyName?: string | null;
  targetAudience?: unknown;
  coreProblem?: unknown;
  useCases?: unknown;
  painPoints?: unknown;
  buyingTriggers?: unknown;
  negativeKeywords?: unknown;
  excludedAudiences?: unknown;
  buyerGroups?: unknown;
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

function conciseTopic(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  return words.slice(0, 7).join(" ") || value;
}

function displayName(targetBuyer: string, problemToSolve: string, providedName?: string) {
  const preferred = compactText(providedName, MAX_NAME_LENGTH);
  if (preferred) return preferred;
  return `${conciseTopic(targetBuyer)} · ${conciseTopic(problemToSolve)}`.slice(
    0,
    MAX_NAME_LENGTH,
  );
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

  return uniqueSeeds(profile).map((seed, index) => {
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
      name: displayName(seed.targetBuyer, seed.problemToSolve, seed.name),
      targetBuyer: seed.targetBuyer,
      problemToSolve: seed.problemToSolve,
      includeTerms: textList(
        [seed.problemToSolve, ...seed.includeTerms],
        4,
      ),
      excludeTerms: exclusions,
      sourcePreferences: [...DEFAULT_BUYER_GROUP_SOURCES],
      rationale,
      evidence,
    };
  });
}
