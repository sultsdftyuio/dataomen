import type { WatchlistCreateInput } from "../prospect-types";

export const SOURCE_OPTIONS = [
  { value: "hackernews", label: "Hacker News", detail: "Founder and builder discussions" },
  { value: "bluesky", label: "Bluesky", detail: "Public conversations and requests" },
  { value: "lemmy", label: "Lemmy", detail: "Independent public communities" },
  { value: "stackexchange", label: "Stack Exchange", detail: "Specific how-to problems" },
  { value: "github", label: "GitHub", detail: "Open-source issues and discussions" },
] as const;

export const DEFAULT_SOURCES: string[] = SOURCE_OPTIONS.map((source) => source.value);

const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_OPTIONS.map((source) => [source.value, source.label]),
);

export function sourceLabel(value: string) {
  if (value.trim().toLowerCase() === "x") return "Public conversation";
  return SOURCE_LABELS[value] ?? value;
}

/** "x" is a retired source key kept on old rows; it is never shown as coverage. */
export function visibleSources(sources: string[]) {
  return sources.filter((source) => source.trim().toLowerCase() !== "x");
}

export function splitLines(value: string) {
  const seen = new Set<string>();
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export type GroupField =
  | "name"
  | "targetBuyer"
  | "problemToSolve"
  | "includeTerms"
  | "excludeTerms"
  | "suggestedPlaces"
  | "sources";

export type GroupFieldErrors = Partial<Record<GroupField, string>>;

// Mirrors WATCHLIST_SCHEMA in ../actions.ts so people see a plain message next
// to the field instead of the server's generic validation text.
const LIST_LIMITS = {
  includeTerms: { max: 6, label: "words people might use" },
  excludeTerms: { max: 12, label: "topics to exclude" },
  suggestedPlaces: { max: 12, label: "places to prioritise" },
} as const;

export function validateGroupFields(
  input: WatchlistCreateInput,
  fields: GroupField[],
): GroupFieldErrors {
  const errors: GroupFieldErrors = {};
  if (fields.includes("name") && !input.name.trim()) {
    errors.name = "Enter a group name.";
  }
  if (fields.includes("targetBuyer") && input.targetBuyer.trim().length < 3) {
    errors.targetBuyer = "Describe who you want to find, in at least 3 characters.";
  }
  if (fields.includes("problemToSolve") && input.problemToSolve.trim().length < 3) {
    errors.problemToSolve = "Describe their problem or the outcome they want.";
  }
  for (const key of ["includeTerms", "excludeTerms", "suggestedPlaces"] as const) {
    if (!fields.includes(key)) continue;
    const { max, label } = LIST_LIMITS[key];
    const values = input[key];
    if (values.length > max) {
      errors[key] = `Use up to ${max} ${label}. You have ${values.length}.`;
    } else if (values.some((value) => value.length < 2)) {
      errors[key] = "Each entry needs at least 2 characters.";
    }
  }
  if (fields.includes("sources") && input.sourcePreferences.length === 0) {
    errors.sources = "Choose at least one public source.";
  }
  return errors;
}

export const GROUP_FIELD_ORDER: GroupField[] = [
  "name",
  "targetBuyer",
  "problemToSolve",
  "includeTerms",
  "excludeTerms",
  "suggestedPlaces",
  "sources",
];

/** Focuses the first field with an error, so keyboard and screen-reader users land on it. */
export function focusFirstError(errors: GroupFieldErrors, idFor: (field: GroupField) => string) {
  const first = GROUP_FIELD_ORDER.find((field) => errors[field]);
  if (!first) return;
  document.getElementById(idFor(first))?.focus();
}
