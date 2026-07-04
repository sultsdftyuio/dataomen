import DOMPurify from "dompurify";
import { TEMPLATE_CATALOG, type RecoveryTemplate } from "./render-template";

function escapeUrl(input: string): string {
  try {
    return encodeURI(input).replace(/\(/g, "%28").replace(/\)/g, "%29");
  } catch {
    return input;
  }
}

export interface TemplateDefinition {
  readonly name: string;
  readonly trigger: string;
  readonly cooldownDays: number;
  readonly subject: string;
  readonly rawHtml: string;
}

export type TemplateContext = Record<string, string | number | null | undefined>;

export const FALLBACK_CATALOG: Record<string, TemplateDefinition> = {
  payment_failure: {
    name: "Payment Failure Notice (Dunning)",
    trigger: "invoice.payment_failed",
    cooldownDays: 14,
    subject: "Action Required: Payment failed for {{company_name}}",
    rawHtml: "<p style='font-family: sans-serif; font-size: 15px; color: #111827;'>Hi {{first_name}},</p><p>We were unable to process your recent payment for <strong>{{company_name}}</strong>.</p><p><a href='{{checkout_url}}' style='background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;'>Update Payment Method &rarr;</a></p>",
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
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
    FORBID_ATTR: ["onerror", "onclick", "onload", "onmouseover", "onmouseout", "onfocus", "onblur"],
    ALLOWED_ATTR: [
      "href", "src", "style", "alt", "title", "class", "id",
      "target", "rel", "width", "height", "cellpadding", "cellspacing", "border",
    ],
    ALLOWED_URI_REGEXP: /^(https?|mailto):/i,
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