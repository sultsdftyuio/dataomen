/**
 * ARCLI RECOVERY INTELLIGENCE LAYER — LOW-LEVEL TEMPLATE ENGINE
 * Aligned with Arcli Engineering Constitution v3.0 (Rule 6: Security & Rule 15: Email Standards)
 */

import { TEMPLATE_CATALOG } from "./render-template";

/**
 * Centralized regex pattern for template interpolation: {{ variable_name }}
 * Stored as a raw string pattern to allow generating stateless RegExp instances,
 * eliminating stateful `lastIndex` bugs across concurrent worker executions.
 */
export const PLACEHOLDER_PATTERN = "\\{\\{\\s*([a-zA-Z0-9_.-]+)\\s*\\}\\}";

/**
 * Creates a fresh, stateless RegExp instance for global placeholder scanning.
 */
export function createPlaceholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_PATTERN, "g");
}

/**
 * Lightweight HTML entity encoder to prevent XSS injection inside HTML text nodes.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      case "`": return "&#96;";
      default: return char;
    }
  });
}

/**
 * Strict attribute encoder for non-URL HTML tag attributes.
 */
export function escapeAttribute(value: string): string {
  return value.replace(/[^a-zA-Z0-9,\.\-_]/g, (char) => {
    const hex = char.charCodeAt(0).toString(16).toUpperCase();
    return `&#x${hex.padStart(2, "0")};`;
  });
}

/**
 * Sanitizes and encodes URL variables intended for href="" contexts.
 * Blocks dangerous schemes (e.g., javascript:, vbscript:, data:) while preserving
 * standard http://, https://, and mailto: links.
 */
export function escapeUrl(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (
    !lower.startsWith("http://") &&
    !lower.startsWith("https://") &&
    !lower.startsWith("mailto:")
  ) {
    // If protocol is unsafe or unrecognized, strip to safe fallback to prevent execution
    return "#invalid-url-protocol-blocked";
  }

  return encodeURI(trimmed);
}

export interface RenderOptions {
  /** If true, skips HTML escaping (use only for trusted raw HTML injection). Default: false */
  allowRawHtml?: boolean;
  /** Action when a placeholder has no matching value in context. Default: "strip" */
  onMissing?: "strip" | "throw" | "leave";
}

/**
 * Runtime extraction of all placeholder keys from a template string.
 * Uses a fresh regex instance to guarantee O(N) stateless extraction.
 */
export function extractVariables(templateString: string): string[] {
  const regex = createPlaceholderRegex();
  const matches = [...templateString.matchAll(regex)];
  return Array.from(new Set(matches.map((m) => m[1])));
}

/**
 * Scans a template string against a context object and identifies missing keys.
 */
export function getMissingVariables<TContext extends Record<string, unknown>>(
  templateString: string,
  context: Readonly<TContext>
): string[] {
  const regex = createPlaceholderRegex();
  const missing: string[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(templateString)) !== null) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      if (!(key in context) || context[key] === undefined || context[key] === null) {
        missing.push(key);
      }
    }
  }

  return missing;
}
export type TemplateKey = keyof typeof TEMPLATE_CATALOG;

export function isTemplateKey(key: string): key is TemplateKey {
  return key in TEMPLATE_CATALOG;
}
/**
 * @internal Unsafe raw template engine.
 * Applications should prefer `renderRecoveryTemplate()` from `./template-catalog`
 * for compile-time contract enforcement and context-aware URL/text escaping.
 */
export function renderTemplateUnsafe<
  TContext extends Record<string, string | number | undefined | null>
>(
  templateString: string,
  context: Readonly<TContext>,
  options: RenderOptions = {}
): string {
  const { allowRawHtml = false, onMissing = "strip" } = options;
  const regex = createPlaceholderRegex();

  return templateString.replace(regex, (match, key: string) => {
    const rawValue = context[key];

    if (rawValue === undefined || rawValue === null) {
      if (onMissing === "throw") {
        throw new Error(`[TemplateEngine] Missing required variable: "${key}"`);
      }
      return onMissing === "leave" ? match : "";
    }

    const stringValue = String(rawValue);
    if (allowRawHtml) return stringValue;

    // Context-aware heuristics based on naming conventions
    if (key.endsWith("_url") || key.endsWith("_link")) {
      return escapeUrl(stringValue);
    }

    return escapeHtml(stringValue);
  });
}
