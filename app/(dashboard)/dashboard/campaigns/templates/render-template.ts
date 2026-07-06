/**
 * ARCLI RECOVERY INTELLIGENCE LAYER - SAFE TEMPLATE RENDERER
 * Deterministic interpolation for the approved recovery email variables.
 */

import {
  SUPPORTED_TEMPLATE_VARIABLES,
  type SupportedTemplateVariable,
} from "@/lib/schemas/template";
import {
  TEMPLATE_CATALOG,
  TEMPLATE_REQUIRED_VARIABLES,
  type TemplateKey,
  type TemplateVariableKey,
} from "./template-catalog";

export {
  TEMPLATE_CATALOG,
  TEMPLATE_CATALOG_ENTRIES,
  TEMPLATE_REQUIRED_VARIABLES,
  getMissingTemplateVariables,
  isTemplateKey,
  type RecoveryTemplate,
  type RecoveryTrigger,
  type TemplateKey,
  type TemplateVariableKey,
} from "./template-catalog";

export const PLACEHOLDER_PATTERN = "\\{\\{\\s*([a-zA-Z0-9_.-]+)\\s*\\}\\}";

const SUPPORTED_TEMPLATE_VARIABLE_SET = new Set<string>(
  SUPPORTED_TEMPLATE_VARIABLES
);

export function createPlaceholderRegex(): RegExp {
  return new RegExp(PLACEHOLDER_PATTERN, "g");
}

export function isSupportedTemplateVariable(
  value: string
): value is SupportedTemplateVariable {
  return SUPPORTED_TEMPLATE_VARIABLE_SET.has(value);
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      case "`":
        return "&#96;";
      default:
        return char;
    }
  });
}

export function escapeAttribute(value: string): string {
  return value.replace(/[^a-zA-Z0-9,\.\-_@:/\s]/g, (char) => {
    const hex = char.charCodeAt(0).toString(16).toUpperCase();
    return `&#x${hex.padStart(2, "0")};`;
  });
}

export function escapeUrl(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (
    !lower.startsWith("http://") &&
    !lower.startsWith("https://") &&
    !lower.startsWith("mailto:")
  ) {
    return "#invalid-url-protocol-blocked";
  }

  return encodeURI(trimmed);
}

export interface RenderOptions {
  allowRawHtml?: boolean;
  onMissing?: "strip" | "throw" | "leave";
  onUnsupported?: "strip" | "throw" | "leave";
}

export function extractVariables(templateString: string): string[] {
  const regex = createPlaceholderRegex();
  const matches = [...templateString.matchAll(regex)];
  return Array.from(new Set(matches.map((match) => match[1])));
}

export function extractSupportedVariables(
  templateString: string
): SupportedTemplateVariable[] {
  return extractVariables(templateString).filter(isSupportedTemplateVariable);
}

export function getUnsupportedVariables(templateString: string): string[] {
  return extractVariables(templateString).filter(
    (key) => !isSupportedTemplateVariable(key)
  );
}

export function getMissingVariables<TContext extends Record<string, unknown>>(
  templateString: string,
  context: Readonly<TContext>
): string[] {
  const missing: string[] = [];

  for (const key of extractSupportedVariables(templateString)) {
    if (!(key in context) || context[key] === undefined || context[key] === null) {
      missing.push(key);
    }
  }

  return missing;
}

export type TemplateContext<K extends TemplateKey> = {
  readonly [Var in TemplateVariableKey<K>]: string | number;
};

export function renderTemplateUnsafe<
  TContext extends Record<string, string | number | undefined | null>
>(
  templateString: string,
  context: Readonly<TContext>,
  options: RenderOptions = {}
): string {
  const {
    allowRawHtml = false,
    onMissing = "strip",
    onUnsupported = "throw",
  } = options;
  const regex = createPlaceholderRegex();

  return templateString.replace(regex, (match, key: string) => {
    if (!isSupportedTemplateVariable(key)) {
      if (onUnsupported === "throw") {
        throw new Error(`[TemplateEngine] Unsupported variable: "${key}"`);
      }
      return onUnsupported === "leave" ? match : "";
    }

    const rawValue = context[key];

    if (rawValue === undefined || rawValue === null) {
      if (onMissing === "throw") {
        throw new Error(`[TemplateEngine] Missing required variable: "${key}"`);
      }
      return onMissing === "leave" ? match : "";
    }

    const stringValue = String(rawValue);
    if (allowRawHtml) return stringValue;

    return escapeHtml(stringValue);
  });
}

export function renderRecoveryTemplate<K extends TemplateKey>(
  templateKey: K,
  context: Readonly<TemplateContext<K>>,
  options?: Pick<RenderOptions, "allowRawHtml">
): { subject: string; html: string } {
  const template = TEMPLATE_CATALOG[templateKey];

  const subject = renderTemplateUnsafe(template.subject, context, {
    onMissing: "throw",
    onUnsupported: "throw",
    ...options,
  });

  const html = renderTemplateUnsafe(template.rawHtml, context, {
    onMissing: "throw",
    onUnsupported: "throw",
    ...options,
  });

  return { subject, html };
}
