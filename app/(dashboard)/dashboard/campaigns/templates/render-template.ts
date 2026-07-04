/**
 * ARCLI RECOVERY INTELLIGENCE LAYER — TEMPLATE CATALOG & SAFE RENDERER
 * Aligned with Arcli Engineering Constitution v3.0 (Rule 9: Recovery & Rule 10: Campaign Safety)
 */

import { renderTemplateUnsafe, RenderOptions } from "./template-catalog";

export type RecoveryTrigger =
  | "invoice.payment_failed"
  | "cancellation_intent_detected"
  | "setup_abandoned_48h";

/**
 * CANONICAL SOURCE OF TRUTH:
 * Single declaration driving both compile-time type checking and runtime verification.
 */
export const TEMPLATE_REQUIRED_VARIABLES = {
  payment_failure: ["first_name", "company_name", "checkout_url", "support_email"],
  cancellation_intent: ["first_name", "company_name", "recovery_attribution_url", "support_email"],
  onboarding_abandonment: ["first_name", "company_name", "recovery_attribution_url", "support_email"],
} as const;

export type TemplateKey = keyof typeof TEMPLATE_REQUIRED_VARIABLES;

/**
 * Strict tuple of required keys per template archetype.
 */
export type RequiredVarsTuple<K extends TemplateKey> = typeof TEMPLATE_REQUIRED_VARIABLES[K];

/**
 * Union of individual variable names required by template K.
 */
export type TemplateVariableKey<K extends TemplateKey> = RequiredVarsTuple<K>[number];

/**
 * STRICT CONTEXT CONTRACT:
 * Forces exact object shape matching all required variables for the selected template.
 * No missing keys allowed; no optional properties.
 */
export type TemplateContext<K extends TemplateKey> = {
  readonly [Var in TemplateVariableKey<K>]: string | number;
};

export interface RecoveryTemplate<K extends TemplateKey = TemplateKey> {
  readonly name: string;
  readonly trigger: RecoveryTrigger;
  readonly cooldownDays: number;
  readonly subject: string;
  readonly rawHtml: string;
  readonly requiredVariables: RequiredVarsTuple<K>;
}

export const TEMPLATE_CATALOG: { [K in TemplateKey]: RecoveryTemplate<K> } = {
  payment_failure: {
    name: "Payment Failure (Dunning)",
    trigger: "invoice.payment_failed",
    cooldownDays: 14,
    subject: "Action Required: Payment failed for {{company_name}}",
    rawHtml: `<p style="font-family: sans-serif; font-size: 15px; color: #111827; line-height: 1.6;">Hi {{first_name}},</p>
<p style="font-family: sans-serif; font-size: 15px; color: #111827; line-height: 1.6;">We noticed your payment method for <strong>{{company_name}}</strong> failed during our last renewal attempt.</p>
<p style="font-family: sans-serif; font-size: 15px; color: #111827; line-height: 1.6;">Please update your billing details securely to avoid service interruption:</p>
<div style="margin: 24px 0;">
  <a href="{{checkout_url}}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-family: sans-serif; font-size: 14px; display: inline-block;">Update Payment Method &rarr;</a>
</div>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0;" />
<p style="font-family: sans-serif; font-size: 12px; color: #6b7280; line-height: 1.5;">Need help? Reply directly to this email or reach out to <a href="mailto:{{support_email}}" style="color: #4b5563;">{{support_email}}</a>.</p>`,
    requiredVariables: TEMPLATE_REQUIRED_VARIABLES.payment_failure,
  },

  cancellation_intent: {
    name: "CancelSave Friction Reduction",
    trigger: "cancellation_intent_detected",
    cooldownDays: 14,
    subject: "Quick question regarding your {{company_name}} account",
    rawHtml: `<p style="font-family: sans-serif; font-size: 15px; color: #111827; line-height: 1.6;">Hi {{first_name}},</p>
<p style="font-family: sans-serif; font-size: 15px; color: #111827; line-height: 1.6;">I noticed you recently initiated a cancellation for your <strong>{{company_name}}</strong> workspace.</p>
<p style="font-family: sans-serif; font-size: 15px; color: #111827; line-height: 1.6;">If you ran into a technical roadblock or pricing misalignment, we can pause your workspace or adjust your tier without losing historical data.</p>
<div style="margin: 24px 0;">
  <a href="{{recovery_attribution_url}}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-family: sans-serif; font-size: 14px; display: inline-block;">Review &amp; Keep Workspace Active &rarr;</a>
</div>
<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0;" />
<p style="font-family: sans-serif; font-size: 12px; color: #6b7280; line-height: 1.5;">Questions? Contact us at <a href="mailto:{{support_email}}" style="color: #4b5563;">{{support_email}}</a>.</p>`,
    requiredVariables: TEMPLATE_REQUIRED_VARIABLES.cancellation_intent,
  },

  onboarding_abandonment: {
    name: "Onboarding Reactivation",
    trigger: "setup_abandoned_48h",
    cooldownDays: 30,
    subject: "Pick up where you left off in {{company_name}}",
    rawHtml: `<p style="font-family: sans-serif; font-size: 15px; color: #111827; line-height: 1.6;">Hi {{first_name}},</p>
<p style="font-family: sans-serif; font-size: 15px; color: #111827; line-height: 1.6;">Your <strong>{{company_name}}</strong> workspace is provisioned, but we noticed your core data pipeline hasn't received its first event yet.</p>
<div style="margin: 24px 0;">
  <a href="{{recovery_attribution_url}}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-family: sans-serif; font-size: 14px; display: inline-block;">Complete Quick Setup &rarr;</a>
</div>
<p style="font-family: sans-serif; font-size: 12px; color: #6b7280; line-height: 1.5;">Need architectural guidance? Reply to <a href="mailto:{{support_email}}" style="color: #4b5563;">{{support_email}}</a>.</p>`,
    requiredVariables: TEMPLATE_REQUIRED_VARIABLES.onboarding_abandonment,
  },
};

/** Runtime type guard to validate a string is a known TemplateKey. */
export function isTemplateKey(value: string): value is TemplateKey {
  return Object.hasOwn(TEMPLATE_CATALOG, value);
}

/**
 * Returns missing variables expected by a template against an arbitrary runtime context.
 * Guaranteed to align with compile-time definitions via TEMPLATE_REQUIRED_VARIABLES.
 */
export function getMissingTemplateVariables<K extends TemplateKey>(
  templateKey: K,
  context: Readonly<Record<string, unknown>>
): TemplateVariableKey<K>[] {
  const required = TEMPLATE_REQUIRED_VARIABLES[templateKey];
  return required.filter(
    (key) => !(key in context) || context[key] === undefined || context[key] === null
  ) as TemplateVariableKey<K>[];
}

/**
 * Type-safe, high-level template renderer for email dispatch pipelines.
 * Enforces strictly typed payload dictionaries at compile-time and guarantees
 * error throwing if variables are unexpectedly missing at execution runtime.
 */
export function renderRecoveryTemplate<K extends TemplateKey>(
  templateKey: K,
  context: Readonly<TemplateContext<K>>,
  options?: Pick<RenderOptions, "allowRawHtml">
): { subject: string; html: string } {
  const template = TEMPLATE_CATALOG[templateKey];

  const subject = renderTemplateUnsafe(template.subject, context, {
    onMissing: "throw",
    ...options,
  });

  const html = renderTemplateUnsafe(template.rawHtml, context, {
    onMissing: "throw",
    ...options,
  });

  return { subject, html };
}