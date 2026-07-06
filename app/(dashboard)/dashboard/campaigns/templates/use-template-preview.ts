"use client";

import { useEffect, useMemo, useState } from "react";
import {
  extractVariables,
  getUnsupportedVariables,
  renderTemplateUnsafe,
} from "@/app/(dashboard)/dashboard/campaigns/templates/render-template";
import {
  ACTIVE_CATALOG,
  sanitizeContextUrls,
  sanitizeEmailPreview,
  type TemplateContext,
  type TemplateDefinition,
} from "@/app/(dashboard)/dashboard/campaigns/templates/security";
import {
  SUPPORTED_TEMPLATE_VARIABLES,
  type SupportedTemplateVariable,
} from "@/lib/schemas/template";

export interface WorkspaceSettings {
  companyName?: string | null;
  fullName?: string | null;
  defaultSenderEmail?: string | null;
}

export interface UseTemplatePreviewOptions {
  selectedTemplateKey: string;
  settings?: WorkspaceSettings;
  previewContextOverride?: TemplateContext;
  customTemplate?: TemplateDefinition;
  debounceMs?: number;
}

const SUPPORTED_VARIABLE_SET = new Set<string>(SUPPORTED_TEMPLATE_VARIABLES);

function isSupportedVariable(value: string): value is SupportedTemplateVariable {
  return SUPPORTED_VARIABLE_SET.has(value);
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

export function useTemplatePreview({
  selectedTemplateKey,
  settings,
  previewContextOverride,
  customTemplate,
  debounceMs = 120,
}: UseTemplatePreviewOptions) {
  const companyName = settings?.companyName?.trim() || "Your Workspace";
  const fullName = settings?.fullName?.trim() || "Workspace User";
  const firstName = fullName.split(/\s+/)[0] || "Workspace";
  const senderEmail = settings?.defaultSenderEmail?.trim() || "recovery@workspace.test";

  const currentTemplate = customTemplate || ACTIVE_CATALOG[selectedTemplateKey];
  const debouncedSubject = useDebouncedValue(currentTemplate?.subject ?? "", debounceMs);
  const debouncedHtml = useDebouncedValue(currentTemplate?.rawHtml ?? "", debounceMs);

  const baseContext: TemplateContext = useMemo(
    () => ({
      first_name: firstName,
      company_name: companyName,
    }),
    [companyName, firstName]
  );

  const overrideKey = previewContextOverride
    ? JSON.stringify(previewContextOverride)
    : "";

  const previewContext = useMemo(() => {
    const merged: TemplateContext = { ...baseContext };

    if (previewContextOverride) {
      for (const [key, value] of Object.entries(previewContextOverride)) {
        if (!isSupportedVariable(key)) continue;
        merged[key] = value;
      }
    }

    return sanitizeContextUrls(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseContext, overrideKey]);

  const allTemplateVariables = useMemo(() => {
    return Array.from(
      new Set([...extractVariables(debouncedSubject), ...extractVariables(debouncedHtml)])
    );
  }, [debouncedHtml, debouncedSubject]);

  const unsupportedVariables = useMemo(() => {
    return Array.from(
      new Set([
        ...getUnsupportedVariables(debouncedSubject),
        ...getUnsupportedVariables(debouncedHtml),
      ])
    );
  }, [debouncedHtml, debouncedSubject]);

  const missingVariables = useMemo(() => {
    return allTemplateVariables
      .filter(isSupportedVariable)
      .filter((key) => {
        const value = previewContext[key];
        return value === undefined || value === null || value === "";
      });
  }, [allTemplateVariables, previewContext]);

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
      const rawHtmlRendered = renderTemplateUnsafe(debouncedHtml, previewContext, {
        allowRawHtml: false,
        onMissing: "leave",
        onUnsupported: "leave",
      });

      const subjectRendered = renderTemplateUnsafe(debouncedSubject, previewContext, {
        allowRawHtml: false,
        onMissing: "leave",
        onUnsupported: "leave",
      });

      const unsupportedError =
        unsupportedVariables.length > 0
          ? `Unsupported variables: ${unsupportedVariables.join(", ")}.`
          : null;

      return {
        sanitizedHtml: sanitizeEmailPreview(rawHtmlRendered),
        hydratedSubject: subjectRendered,
        rawHtml: debouncedHtml,
        renderError: unsupportedError,
      };
    } catch (error) {
      return {
        sanitizedHtml: "",
        hydratedSubject: debouncedSubject || currentTemplate.subject,
        rawHtml: debouncedHtml,
        renderError:
          error instanceof Error
            ? error.message
            : "Failed to interpolate template variables.",
      };
    }
  }, [
    currentTemplate,
    debouncedHtml,
    debouncedSubject,
    previewContext,
    unsupportedVariables,
  ]);

  return {
    ...previewState,
    catalog: ACTIVE_CATALOG,
    companyName,
    currentTemplate,
    firstName,
    fromEmail: senderEmail,
    missingVariables,
    previewContext,
    recipientEmail: "preview@example.com",
    recipientName: firstName,
    senderEmail,
    unsupportedVariables,
  };
}
