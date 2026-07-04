"use client";

import React, { useState, useMemo, useCallback } from "react";
import DOMPurify from "dompurify";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Code, CheckCircle2, Mail, Copy, Check, AlertTriangle } from "lucide-react";
import { TEMPLATE_CATALOG, TemplateKey, isTemplateKey } from "./template-catalog";
import { renderTemplateUnsafe } from "./template-catalog";

interface WorkspaceSettings {
  companyName?: string;
  supportEmail?: string;
  defaultSenderEmail?: string;
}

interface RecoveryTemplateViewerProps {
  settings?: WorkspaceSettings;
  previewContextOverride?: Record<string, string | number>;
}

/**
 * Hardened client-side DOMPurify sanitizer specifically tuned for email preview sandboxes.
 * Enforces strict tag exclusions and strips active attributes (e.g., onerror, onclick).
 */
function sanitizeEmailPreview(rawHtml: string): string {
  if (typeof window === "undefined") return rawHtml; // SSR guard

  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
    ALLOWED_ATTR: [
      "href", "src", "style", "alt", "title", "class", "id",
      "target", "rel", "width", "height", "cellpadding", "cellspacing", "border"
    ],
  });
}

export function RecoveryTemplateViewer({ 
  settings, 
  previewContextOverride 
}: RecoveryTemplateViewerProps) {
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<TemplateKey>("payment_failure");
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [copiedHtml, setCopiedHtml] = useState(false);

  // Safe Settings Fallbacks & Slug Generation
  const companyName = settings?.companyName || "Acme Corp";
  const supportEmail = settings?.supportEmail || "support@acmecorp.com";
  
  const companySlug = useMemo(() => {
    const sanitized = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
    return sanitized || "workspace";
  }, [companyName]);

  const senderEmail = settings?.defaultSenderEmail || `billing@${companySlug}.com`;

  // Hydration & XSS Sanitization Pipeline
  // Uses selectedTemplateKey primitive in dependency array to guarantee reference stability
  const { sanitizedHtml, hydratedSubject, renderError, rawHtml } = useMemo(() => {
    const template = TEMPLATE_CATALOG[selectedTemplateKey];
    const rawContext: Record<string, string | number> = {
      first_name: "Alex",
      company_name: companyName,
      support_email: supportEmail,
      checkout_url: "https://billing.arcli.io/recover/chk_89a7f9a8",
      recovery_attribution_url: "https://arcli.io/r/cancelsave_v1",
      unsubscribe_url: "https://arcli.io/unsub/usr_123",
      ...previewContextOverride,
    };

    try {
      // HARD GUARD: Explicitly enforce allowRawHtml: false at the render boundary
      const rawHtmlRendered = renderTemplateUnsafe(template.rawHtml, rawContext, {
        allowRawHtml: false,
        onMissing: "leave", // Leave unmapped placeholders visible in UI preview for inspection
      });

      const subjectRendered = renderTemplateUnsafe(template.subject, rawContext, {
        allowRawHtml: false,
        onMissing: "leave",
      });

      return {
        sanitizedHtml: sanitizeEmailPreview(rawHtmlRendered),
        hydratedSubject: subjectRendered,
        rawHtml: template.rawHtml,
        renderError: null,
      };
    } catch (error) {
      return {
        sanitizedHtml: "",
        hydratedSubject: template.subject,
        rawHtml: template.rawHtml,
        renderError: error instanceof Error ? error.message : "Failed to interpolate template variables.",
      };
    }
  }, [selectedTemplateKey, companyName, supportEmail, previewContextOverride]);

  // Handle template switching with runtime type guard
  const handleTemplateChange = useCallback((val: string) => {
    if (isTemplateKey(val)) {
      setSelectedTemplateKey(val);
    }
  }, []);

  // Handle HTML Copy to Clipboard with resilient error trapping
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

  const currentTemplate = TEMPLATE_CATALOG[selectedTemplateKey];

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

        {/* Template Selector with Safe Type Validation */}
        <div className="flex items-center gap-3">
          <Select 
            value={selectedTemplateKey} 
            onValueChange={handleTemplateChange}
          >
            <SelectTrigger className="w-[240px] bg-white text-xs font-medium">
              <SelectValue placeholder="Select a template" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TEMPLATE_CATALOG).map(([key, item]) => (
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
            <span>Trigger: <strong className="text-slate-600">{currentTemplate.trigger}</strong></span>
            <span>•</span>
            <span>Cooldown: <strong className="text-slate-600">{currentTemplate.cooldownDays} Days</strong></span>
          </div>
        </div>

        <CardContent className="p-6">
          <TabsContent value="preview" className="m-0">
            {renderError ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Template Hydration Warning</p>
                  <p className="mt-1 text-amber-700">{renderError}</p>
                </div>
              </div>
            ) : (
              /* Email Inbox Sandbox Container */
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

                  {/* Safe Sandbox Render */}
                  <div 
                    className="prose prose-sm max-w-none text-slate-800"
                    dangerouslySetInnerHTML={{ __html: sanitizedHtml }} 
                  />
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