"use client";

import { useMemo } from "react";
import { renderTemplateUnsafe, extractVariables } from "@/app/(dashboard)/dashboard/campaigns/templates/template-catalog";
import { 
  ACTIVE_CATALOG, 
  sanitizeEmailPreview, 
  sanitizeContextUrls, 
  type TemplateDefinition, 
  type TemplateContext 
} from "@/app/(dashboard)/dashboard/campaigns/templates/security";

export interface WorkspaceSettings {
  companyName?: string;
  supportEmail?: string;
  defaultSenderEmail?: string;
}

export interface UseTemplatePreviewOptions {
  selectedTemplateKey: string;
  settings?: WorkspaceSettings;
  previewContextOverride?: TemplateContext;
  customTemplate?: TemplateDefinition; // Allows live drafting in create-template-form.tsx
}

export function useTemplatePreview({
  selectedTemplateKey,
  settings,
  previewContextOverride,
  customTemplate,
}: UseTemplatePreviewOptions) {
  const companyName = settings?.companyName || "Acme Corp";
  const supportEmail = settings?.supportEmail || "support@acmecorp.com";

  const companySlug = useMemo(() => {
    return companyName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "workspace";
  }, [companyName]);

  const senderEmail = settings?.defaultSenderEmail || `billing@${companySlug}.com`;

  // Stable base context
  const baseContext: TemplateContext = useMemo(() => ({
    first_name: "Alex",
    company_name: companyName,
    support_email: supportEmail,
    checkout_url: "https://billing.arcli.tech/recover/chk_89a7f9a8",
    recovery_attribution_url: "https://arcli.tech/r/cancelsave_v1",
    unsubscribe_url: "https://arcli.tech/unsub/usr_123",
  }), [companyName, supportEmail]);

  // Merge & sanitize context
  const overrideKey = previewContextOverride ? JSON.stringify(previewContextOverride) : "";
  const rawContext = useMemo(() => {
    const merged: TemplateContext = { ...baseContext };
    if (previewContextOverride) {
      for (const [key, val] of Object.entries(previewContextOverride)) {
        if (key.endsWith("_url") || key.endsWith("_link")) continue;
        merged[key] = val;
      }
    }
    return sanitizeContextUrls(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseContext, overrideKey]);

  // Resolve target template (allows fallback to custom drafting templates)
  const currentTemplate = customTemplate || ACTIVE_CATALOG[selectedTemplateKey];

  // Missing variable detection
  const missingVariables = useMemo(() => {
    if (!currentTemplate) return [];
    const requiredInHtml = typeof extractVariables === "function" ? extractVariables(currentTemplate.rawHtml) : [];
    const requiredInSubject = typeof extractVariables === "function" ? extractVariables(currentTemplate.subject) : [];
    const allRequired = Array.from(new Set([...requiredInHtml, ...requiredInSubject]));

    return allRequired.filter((key) => {
      const val = rawContext[key];
      return val == null || val === "";
    });
  }, [currentTemplate, rawContext]);

  // Renderer resolver
  const renderer = useMemo(() => {
    if (typeof renderTemplateUnsafe === "function") return renderTemplateUnsafe;
    return (tpl: string, ctx: TemplateContext) =>
      tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(ctx[k] ?? `{{${k}}}`));
  }, []);

  // Execution & Sanitization Pipeline
  const previewState = useMemo(() => {
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

  return {
    ...previewState,
    missingVariables,
    senderEmail,
    supportEmail,
    companyName,
    currentTemplate,
    catalog: ACTIVE_CATALOG,
  };
}