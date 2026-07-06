/**
 * ARCLI RECOVERY INTELLIGENCE LAYER — TEMPLATE VALIDATION SCHEMA
 * Aligned with Arcli Engineering Constitution v3.0
 * Authoritative Table: public.email_templates
 */

import { z } from "zod";

export const SUPPORTED_TEMPLATE_VARIABLES = [
  "first_name",
  "company_name",
] as const;

export type SupportedTemplateVariable =
  (typeof SUPPORTED_TEMPLATE_VARIABLES)[number];

const SUPPORTED_TEMPLATE_VARIABLE_SET = new Set<string>(
  SUPPORTED_TEMPLATE_VARIABLES
);

/**
 * Valid template types corresponding to Arcli's automated recovery pipeline.
 * Enforces Rule 10 (Campaign Safety) & Rule 15 (Email Delivery Standards).
 */
export const TemplateTypeSchema = z.enum([
  "recovery",     // Primary failed invoice recovery
  "dunning",      // Automated pre/post-expiration dunning sequences
  "reactivation", // Post-cancellation win-back campaigns
  "alert",        // Internal or high-urgency billing notifications
]);

export type TemplateType = z.infer<typeof TemplateTypeSchema>;

/**
 * Helper regex to check for mismatched or unclosed Handlebars-style variables: {{var}}
 * Prevents dispatching malformed recovery emails that trigger spam traps (Rule 15).
 */
const UNCLOSED_VARIABLE_REGEX = /\{\{[^}]*$/m;
const UNOPENED_VARIABLE_REGEX = /^[^{]*\}\}/m;
const TEMPLATE_VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const DANGEROUS_HTML_REGEX =
  /<\s*(script|iframe|object|embed|form|input|button|meta|link)\b|on[a-z]+\s*=/i;

function extractTemplateVariables(value: string): string[] {
  return Array.from(
    new Set([...value.matchAll(TEMPLATE_VARIABLE_REGEX)].map((match) => match[1]))
  );
}

function getUnsupportedTemplateVariables(value: string): string[] {
  return extractTemplateVariables(value).filter(
    (variable) => !SUPPORTED_TEMPLATE_VARIABLE_SET.has(variable)
  );
}

export const TemplateSaveSchema = z
  .object({
    id: z
      .string()
      .uuid("Invalid template ID format.")
      .optional(),

    // Rule 6: Optional in input payload so UI doesn't need placeholder UUIDs.
    // Server action enforces and overwrites this securely from session auth.
    tenant_id: z
      .string()
      .uuid("Invalid tenant UUID format.")
      .optional(),

    name: z
      .string()
      .trim()
      .min(2, "Template name must be at least 2 characters.")
      .max(100, "Template name cannot exceed 100 characters."),

    subject: z
      .string()
      .trim()
      .min(5, "Subject line must be at least 5 characters.")
      .max(150, "Subject line cannot exceed 150 characters."),

    type: TemplateTypeSchema.optional(),

    // UI/API callers use campaign_type; the database column is still `type`.
    campaign_type: TemplateTypeSchema.optional(),

    body_html: z
      .string()
      .trim()
      .min(20, "Template HTML body must contain meaningful content (minimum 20 characters)."),

    body_text: z
      .string()
      .trim()
      .optional(),

    is_active: z
      .boolean()
      .default(true),
  })
  .superRefine((data, ctx) => {
    if (data.type && data.campaign_type && data.type !== data.campaign_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template type and campaign_type must match when both are provided.",
        path: ["campaign_type"],
      });
    }

    // Rule 15 Defense: Prevent syntax errors in email variable interpolation
    if (UNCLOSED_VARIABLE_REGEX.test(data.body_html) || UNOPENED_VARIABLE_REGEX.test(data.body_html)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template HTML contains unclosed or malformed variable tags (e.g., mismatched {{ or }}).",
        path: ["body_html"],
      });
    }

    if (UNCLOSED_VARIABLE_REGEX.test(data.subject) || UNOPENED_VARIABLE_REGEX.test(data.subject)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subject line contains unclosed or malformed variable tags.",
        path: ["subject"],
      });
    }

    const unsupportedVariables = Array.from(
      new Set([
        ...getUnsupportedTemplateVariables(data.subject),
        ...getUnsupportedTemplateVariables(data.body_html),
      ])
    );

    if (unsupportedVariables.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsupported template variable(s): ${unsupportedVariables.join(", ")}. Supported variables are ${SUPPORTED_TEMPLATE_VARIABLES.join(", ")}.`,
        path: ["body_html"],
      });
    }

    if (DANGEROUS_HTML_REGEX.test(data.body_html)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Template HTML contains a blocked tag or inline event handler.",
        path: ["body_html"],
      });
    }
  })
  .transform((data) => ({
    ...data,
    type: data.type ?? data.campaign_type ?? "recovery",
    campaign_type: data.type ?? data.campaign_type ?? "recovery",
    // Automatically derive fallback plain text if omitted to ensure compliance (Rule 15)
    body_text:
      data.body_text && data.body_text.length > 0
        ? data.body_text
        : data.body_html
            .replace(/<style[^>]*>.*<\/style>/gm, "") // Strip style blocks
            .replace(/<[^>]+>/gm, " ")                 // Strip HTML tags
            .replace(/\s+/gm, " ")                     // Normalize whitespace
            .trim(),
  }));

// Input represents pre-transform payload (allows undefined body_text & tenant_id from UI forms)
export type TemplateSaveInput = z.input<typeof TemplateSaveSchema>;
// Payload represents post-transform payload (guarantees non-nullable derived fields after Zod validation)
export type TemplateSavePayload = z.infer<typeof TemplateSaveSchema>;
