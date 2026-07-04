"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import DOMPurify from "dompurify";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Code, CheckCircle2, Mail, Copy, Check, AlertTriangle, Info } from "lucide-react";

// Canonical imports from Arcli Recovery Intelligence Layer
import { renderTemplateUnsafe, extractVariables, escapeUrl } from "./template-catalog";
import { TEMPLATE_CATALOG, isTemplateKey, type TemplateKey, type RecoveryTemplate } from "./render-template";

// ==========================================
// 1. TYPE CONTRACTS & RUNTIME ASSERTIONS
// ==========================================

export interface TemplateDefinition {
  readonly name: string;
  readonly trigger: string;
  readonly cooldownDays: number;
  readonly subject: string;
  readonly rawHtml: string;
}

// Context values a template might interpolate. Widened from `string | number`
// to include null/undefined (values that are legitimately "missing" rather
// than absent) while staying aligned with what renderTemplateUnsafe /
// extractVariables actually accept — `unknown` would be safer in isolation
// but isn't assignable to their declared signatures.
type TemplateContext = Record<string, string | number | null | undefined>;

const FALLBACK_CATALOG: Record<string, TemplateDefinition> = {
  payment_failure: {
    name: "Payment Failure Notice (Dunning)",
    trigger: "invoice.payment_failed",
    cooldownDays: 14,
    subject: "Action Required: Payment failed for {{company_name}}",
    rawHtml: "<p style='font-family: sans-serif; font-size: 15px; color: #111827;'>Hi {{first_name}},</p><p style='font-family: sans-serif; font-size: 15px; color: #111827;'>We were unable to process your recent payment for <strong>{{company_name}}</strong>.</p><p><a href='{{checkout_url}}' style='background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;'>Update Payment Method &rarr;</a></p>",
  },
};

/**
 * Structural type assertion to guarantee runtime safety against malformed exports.
 */
function assertCatalogShape(obj: unknown): asserts obj is Record<string, TemplateDefinition> {
  if (!obj || typeof obj !== "object") {
    throw new Error("[TemplateViewer] Catalog export is not a valid object.");
  }
}

// Resolve catalog deterministically with runtime shape verification
const ACTIVE_CATALOG: Record<string, TemplateDefinition> = (() => {
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

// ==========================================
// 2. SECURITY & URL POLICIES
// ==========================================

/**
 * Hardened client-side DOMPurify sanitizer tuned for email preview sandboxes.
 * Guards internally against SSR (no DOM) so callers never need to branch on
 * mount state just to decide whether it's safe to call this.
 */
function sanitizeEmailPreview(rawHtml: string): string {
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
 * Enforces strict protocol allowlisting on URL properties. Non-string, non-URL
 * values pass through untouched; the narrowing happens explicitly per key.
 */
function sanitizeContextUrls(context: TemplateContext): TemplateContext {
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
      // A URL-shaped key with a non-string value (number/bool/object/null) is
      // never safe to interpolate as a link — block it rather than coerce it.
      sanitized[key] = "#blocked-unsafe-protocol";
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

// ==========================================
// 3. COMPONENT INTERFACES
// ==========================================

interface WorkspaceSettings {
  companyName?: string;
  supportEmail?: string;
  defaultSenderEmail?: string;
}

interface RecoveryTemplateViewerProps {
  settings?: WorkspaceSettings;
  previewContextOverride?: TemplateContext;
}

// ==========================================
// 4. CUSTOM HOOKS (extracted for clarity)
// ==========================================

/**
 * Resolves the initial template key from the active catalog.
 * Handles edge cases where catalog may be empty or missing expected keys.
 */
function useInitialTemplateKey(catalog: Record<string, TemplateDefinition>): string {
  return useMemo(() => {
    const keys = Object.keys(catalog);
    if (keys.length === 0) return "";
    return keys.includes("payment_failure") ? "payment_failure" : keys[0];
  }, [catalog]);
}

/**
 * Builds the stable base context for template rendering.
 */
function useBaseContext(companyName: string, supportEmail: string): TemplateContext {
  return useMemo(() => ({
    first_name: "Alex",
    company_name: companyName,
    support_email: supportEmail,
    checkout_url: "https://billing.arcli.io/recover/chk_89a7f9a8",
    recovery_attribution_url: "https://arcli.io/r/cancelsave_v1",
    unsubscribe_url: "https://arcli.io/unsub/usr_123",
  }), [companyName, supportEmail]);
}

/**
 * Merges base context with user overrides, then sanitizes URL values.
 * Override is applied AFTER base, but only for keys that are NOT already URL
 * keys, preventing accidental URL injection via previewContextOverride.
 *
 * The override is depended on via its serialized shape rather than object
 * identity, so callers passing a freshly-constructed object with the same
 * contents on every render (a common pattern) don't cause the context,
 * missing-variable check, and renderer to all recompute needlessly.
 */
function useRenderContext(
  baseContext: TemplateContext,
  previewContextOverride?: TemplateContext
): TemplateContext {
  const overrideKey = previewContextOverride ? JSON.stringify(previewContextOverride) : "";

  return useMemo(() => {
    const merged: TemplateContext = { ...baseContext };

    if (previewContextOverride) {
      for (const [key, val] of Object.entries(previewContextOverride)) {
        if (key.endsWith("_url") || key.endsWith("_link")) {
          console.warn(`[TemplateViewer] Ignoring URL override for key: ${key}`);
          continue;
        }
        merged[key] = val;
      }
    }

    return sanitizeContextUrls(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseContext, overrideKey]);
}

/**
 * Extracts missing variables from template content against the provided context.
 * Treats null, undefined, and empty string as missing (0 and false are valid).
 */
function useMissingVariables(
  template: TemplateDefinition | undefined,
  context: TemplateContext
): string[] {
  return useMemo(() => {
    if (!template) return [];

    const requiredInHtml = typeof extractVariables === "function" ? extractVariables(template.rawHtml) : [];
    const requiredInSubject = typeof extractVariables === "function" ? extractVariables(template.subject) : [];
    const allRequired = Array.from(new Set([...requiredInHtml, ...requiredInSubject]));

    return allRequired.filter((key) => {
      const val = context[key];
      return val == null || val === "";
    });
  }, [template, context]);
}

/**
 * Renders template with production-matching fallback renderer.
 */
function useTemplateRenderer() {
  return useMemo(() => {
    if (typeof renderTemplateUnsafe === "function") {
      return renderTemplateUnsafe;
    }
    return (tpl: string, ctx: TemplateContext, _options?: any) =>
      tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(ctx[k] ?? `{{${k}}}`));
  }, []);
}

// ==========================================
// 5. MAIN COMPONENT
// ==========================================

export function RecoveryTemplateViewer({
  settings,
  previewContextOverride,
}: RecoveryTemplateViewerProps) {
  const initialKey = useInitialTemplateKey(ACTIVE_CATALOG);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>(initialKey);
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [copiedHtml, setCopiedHtml] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Safe Settings Fallbacks & Slug Generation
  const companyName = settings?.companyName || "Acme Corp";
  const supportEmail = settings?.supportEmail || "support@acmecorp.com";

  const companySlug = useMemo(() => {
    return companyName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "workspace";
  }, [companyName]);

  const senderEmail = settings?.defaultSenderEmail || `billing@${companySlug}.com`;

  // Stable base context
  const baseContext = useBaseContext(companyName, supportEmail);

  // Sanitized render context (URL overrides blocked)
  const rawContext = useRenderContext(baseContext, previewContextOverride);

  // Template resolution — this, not selectedTemplateKey, is the real source
  // of truth for "do we have something valid to render".
  const currentTemplate = ACTIVE_CATALOG[selectedTemplateKey];

  // Missing variable detection
  const missingVariables = useMissingVariables(currentTemplate, rawContext);

  // Renderer function
  const renderer = useTemplateRenderer();

  // Hydration, XSS Sanitization & Render Pipeline.
  // Sanitization always runs here — sanitizeEmailPreview itself guards on
  // `typeof window` — so we don't gate the *result* behind isMounted and
  // recompute this memo an extra time purely for mount status.
  const { sanitizedHtml, hydratedSubject, renderError, rawHtml } = useMemo(() => {
    if (!currentTemplate) {
      return {
        sanitizedHtml: "",
        hydratedSubject: "Template Not Found",
        rawHtml: "",
        renderError: "Selected template definition could not be loaded.",
      };
    }

    try {
      const rawHtmlRendered = renderer(currentTemplate.rawHtml, rawContext, {
        allowRawHtml: false,
        onMissing: "leave",
      });

      const subjectRendered = renderer(currentTemplate.subject, rawContext, {
        allowRawHtml: false,
        onMissing: "leave",
      });

      return {
        sanitizedHtml: sanitizeEmailPreview(rawHtmlRendered),
        hydratedSubject: subjectRendered,
        rawHtml: currentTemplate.rawHtml,
        renderError: null,
      };
    } catch (error) {
      return {
        sanitizedHtml: "",
        hydratedSubject: currentTemplate.subject,
        rawHtml: currentTemplate.rawHtml,
        renderError: error instanceof Error ? error.message : "Failed to interpolate template variables.",
      };
    }
  }, [currentTemplate, rawContext, renderer]);

  // Event handlers
  const handleTemplateChange = useCallback((val: string) => {
    if (val in ACTIVE_CATALOG || isTemplateKey?.(val)) {
      setSelectedTemplateKey(val);
    }
  }, []);

  const handleCopyHtml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawHtml);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2000);
    } catch (err) {
      setCopiedHtml(false);
      console.error("Clipboard copy failed:", err);
    }
  }, [rawHtml]);

  // Guard: empty catalog / no resolvable template. currentTemplate is the
  // actual source of truth — selectedTemplateKey could theoretically be a
  // stale/invalid string without currentTemplate ever being undefined-safe.
  if (!currentTemplate) {
    return (
      <Card className="w-full border-slate-200 shadow-sm p-6">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-amber-800 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">No Templates Available</p>
            <p className="mt-1 text-amber-700">The template catalog is empty. Please check your configuration.</p>
          </div>
        </div>
      </Card>
    );
  }

  const catalogEntries = Object.entries(ACTIVE_CATALOG);

  return (
    <Card className="w-full border-slate-200 shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Mail className="w-4 h-4 text-slate-500" aria-hidden="true" />
            Active Recovery Templates
          </CardTitle>
          <CardDescription className="text-sm text-slate-500 mt-1">
            Visual verification using active settings from <strong className="text-slate-700">{companyName}</strong>
          </CardDescription>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedTemplateKey} onValueChange={handleTemplateChange}>
            <SelectTrigger className="w-[240px] bg-white text-xs font-medium">
              <SelectValue placeholder="Select a template" />
            </SelectTrigger>
            <SelectContent>
              {catalogEntries.map(([key, item]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Active
          </span>
        </div>
      </CardHeader>

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "preview" | "code")}>
        <div className="px-6 pt-3 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
          <TabsList className="grid w-48 grid-cols-2 bg-slate-200/60 p-0.5">
            <TabsTrigger value="preview" className="text-xs flex items-center gap-1.5 data-[state=active]:bg-white">
              <Eye className="w-3.5 h-3.5" aria-hidden="true" /> Live Preview
            </TabsTrigger>
            <TabsTrigger value="code" className="text-xs flex items-center gap-1.5 data-[state=active]:bg-white">
              <Code className="w-3.5 h-3.5" aria-hidden="true" /> Raw Code
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>Trigger: <strong className="text-slate-600">{currentTemplate?.trigger ?? "—"}</strong></span>
            <span>•</span>
            <span>Cooldown: <strong className="text-slate-600">{currentTemplate?.cooldownDays ?? "—"} Days</strong></span>
          </div>
        </div>

        <CardContent className="p-6">
          <TabsContent value="preview" className="m-0 space-y-4">
            {/* Fatal Hydration / Render Error */}
            {renderError && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Template Hydration Warning</p>
                  <p className="mt-1 text-amber-700">{renderError}</p>
                </div>
              </div>
            )}

            {/* Missing Variables Notice Banner */}
            {!renderError && missingVariables.length > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 text-blue-800 text-xs">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Unmapped Placeholders Detected</p>
                  <p className="mt-0.5 text-blue-700">
                    The following placeholders have missing or empty values and will render un-interpolated:{" "}
                    <code className="font-mono font-bold bg-blue-100 px-1 rounded">{missingVariables.join(", ")}</code>
                  </p>
                </div>
              </div>
            )}

            {/* Email Inbox Sandbox Container */}
            {!renderError && (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-100/60 p-6 sm:p-8">
                <div className="max-w-xl mx-auto bg-white rounded-md shadow-sm border border-slate-200/80 p-6 sm:p-8">
                  {/* Simulated Email Client Header */}
                  <div className="border-b border-slate-100 pb-4 mb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Inbox Rendering Preview
                    </p>
                    <h4 className="text-base font-semibold text-slate-900">
                      {hydratedSubject}
                    </h4>
                    <div className="flex justify-between items-center mt-1 text-xs text-slate-500">
                      <span>From: <strong className="text-slate-700">{senderEmail}</strong></span>
                      <span>Reply-To: <strong className="text-slate-700">{supportEmail}</strong></span>
                    </div>
                  </div>

                  {/* Clean SSR Boundary: Prevents hydration mismatch without content flicker */}
                  {!isMounted ? (
                    <div className="space-y-3 animate-pulse py-4">
                      <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                      <div className="h-4 bg-slate-200 rounded w-full"></div>
                      <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                    </div>
                  ) : (
                    <div
                      className="prose prose-sm max-w-none text-slate-800"
                      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                    />
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="code" className="m-0 relative">
            <button
              onClick={handleCopyHtml}
              className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors cursor-pointer z-10"
              title="Copy Raw HTML"
            >
              {copiedHtml ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedHtml ? "Copied!" : "Copy HTML"}
            </button>

            <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono whitespace-pre-wrap break-all leading-relaxed border border-slate-800 max-h-[400px] overflow-y-auto">
              <code>{rawHtml}</code>
            </pre>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}