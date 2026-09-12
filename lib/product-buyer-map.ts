export type ProductBuyerMapInput = {
  valueProposition: string;
  coreProblem: string;
  targetAudience: readonly string[];
  painPoints: readonly string[];
  useCases: readonly string[];
  buyingTriggers: readonly string[];
  urgencySignals: readonly string[];
  buyerLanguage: readonly string[];
  negativeKeywords: readonly string[];
  excludedAudiences: readonly string[];
};

export type ProductBuyerMap = {
  positioning: string[];
  idealBuyers: string[];
  buyerProblems: string[];
  buyerLanguage: string[];
  exclusions: string[];
};

const MAX_ITEMS_PER_AREA = 4;

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function distinct(values: readonly string[], limit = MAX_ITEMS_PER_AREA) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = clean(value);
    const key = normalized.toLocaleLowerCase();

    if (!normalized || seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
    if (result.length === limit) break;
  }

  return result;
}

function balancedDistinct(groups: ReadonlyArray<readonly string[]>) {
  const selected = groups.flatMap((group) => group.slice(0, 1));
  const remaining = groups.flatMap((group) => group.slice(1));

  return distinct([...selected, ...remaining]);
}

/**
 * Presents the existing crawl profile as a compact commercial map. It is a
 * derived view only: saving the matching brief remains the single source of
 * truth, so no schema or API contract needs to change.
 */
export function buildProductBuyerMap(
  input: ProductBuyerMapInput,
): ProductBuyerMap {
  return {
    positioning: distinct([input.valueProposition, input.coreProblem], 2),
    idealBuyers: distinct(input.targetAudience),
    // Show at least one example of every commercial signal type before using
    // extra room for more detail from a single large list.
    buyerProblems: balancedDistinct([
      input.painPoints,
      input.useCases,
      input.buyingTriggers,
      input.urgencySignals,
    ]),
    buyerLanguage: distinct(input.buyerLanguage),
    exclusions: distinct([
      ...input.excludedAudiences,
      ...input.negativeKeywords,
    ]),
  };
}
