import DOMPurify from "dompurify";
import { TEMPLATE_CATALOG } from "@/app/(dashboard)/dashboard/campaigns/templates/template-catalog";
import { escapeUrl } from "@/app/(dashboard)/dashboard/campaigns/templates/render-template";
import type { TemplateType } from "@/lib/schemas/template";

export interface TemplateDefinition {
  readonly catalogKey?: string;
  readonly name: string;
  readonly description?: string;
  readonly trigger: string;
  readonly cooldownDays: number;
  readonly campaignType?: TemplateType;
  readonly subject: string;
  readonly rawHtml: string;
}

export type TemplateContext = Record<string, string | number | null | undefined>;

export const FALLBACK_CATALOG: Record<string, TemplateDefinition> = {
  dunning_first_warning: {
    name: "Dunning First Warning",
    trigger: "invoice.payment_failed",
    cooldownDays: 14,
    campaignType: "dunning",
    subject: "Payment issue for {{company_name}}",
    rawHtml: "<p>Hi {{first_name}},</p><p>We could not process the latest <strong>{{company_name}}</strong> renewal.</p><p>Please sign in to your workspace and update your billing details to keep service active.</p><hr /><p>Need help? Reply directly to this email.</p>",
  },
};

export function assertCatalogShape(obj: unknown): asserts obj is Record<string, TemplateDefinition> {
  if (!obj || typeof obj !== "object") {
    throw new Error("[TemplateViewer] Catalog export is not a valid object.");
  }
}

export const ACTIVE_CATALOG: Record<string, TemplateDefinition> = (() => {
  try {
    if (TEMPLATE_CATALOG && typeof TEMPLATE_CATALOG === "object") {
      assertCatalogShape(TEMPLATE_CATALOG);
      return TEMPLATE_CATALOG as unknown as Record<string, TemplateDefinition>;
    }
  } catch (e) {
    console.warn("Falling back to local template catalog due to verification failure:", e);
  }
  return FALLBACK_CATALOG;
})();

/**
 * Hardened client-side DOMPurify sanitizer tuned for email preview sandboxes.
 */
export function sanitizeEmailPreview(rawHtml: string): string {
  if (typeof window === "undefined") return rawHtml;

  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      "a",
      "br",
      "div",
      "em",
      "hr",
      "li",
      "ol",
      "p",
      "span",
      "strong",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "ul",
    ],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover", "onmouseout", "onfocus", "onblur"],
    ALLOWED_ATTR: [
      "href", "alt", "title",
      "target", "rel", "width", "height", "cellpadding", "cellspacing", "border",
    ],
    ALLOWED_URI_REGEXP: /^(https?|mailto):/i,
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: true,
  });
}

/**
 * Enforces strict protocol allowlisting on URL properties.
 */
export function sanitizeContextUrls(context: TemplateContext): TemplateContext {
  const sanitized: TemplateContext = {};
  for (const [key, val] of Object.entries(context)) {
    const isUrlKey = key.endsWith("_url") || key.endsWith("_link");
    if (isUrlKey && typeof val === "string") {
      const normalized = val.trim();
      const lower = normalized.toLowerCase();
      if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:")) {
        sanitized[key] = escapeUrl(normalized);
      } else {
        sanitized[key] = "#blocked-unsafe-protocol";
      }
    } else if (isUrlKey) {
      sanitized[key] = "#blocked-unsafe-protocol";
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}
