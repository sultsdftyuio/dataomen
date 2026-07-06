/**
 * ARCLI RECOVERY INTELLIGENCE LAYER - TEMPLATE CATALOG
 * Catalog definitions stay deterministic and only use approved interpolation
 * variables from lib/schemas/template.ts.
 */

import type {
  SupportedTemplateVariable,
  TemplateType,
} from "@/lib/schemas/template";

export type RecoveryTrigger =
  | "invoice.payment_failed"
  | "invoice.payment_failed_urgent"
  | "customer.inactivity_detected";

export const TEMPLATE_REQUIRED_VARIABLES = {
  dunning_first_warning: [
    "first_name",
    "company_name",
  ],
  payment_failed_urgent: [
    "first_name",
    "company_name",
  ],
  inactivity_check_in: [
    "first_name",
    "company_name",
  ],
} as const satisfies Record<string, readonly SupportedTemplateVariable[]>;

export type TemplateKey = keyof typeof TEMPLATE_REQUIRED_VARIABLES;
export type RequiredVarsTuple<K extends TemplateKey> =
  (typeof TEMPLATE_REQUIRED_VARIABLES)[K];
export type TemplateVariableKey<K extends TemplateKey> =
  RequiredVarsTuple<K>[number];

export interface RecoveryTemplate<K extends TemplateKey = TemplateKey> {
  readonly name: string;
  readonly description: string;
  readonly trigger: RecoveryTrigger;
  readonly cooldownDays: 7 | 14 | 30;
  readonly campaignType: TemplateType;
  readonly subject: string;
  readonly rawHtml: string;
  readonly requiredVariables: RequiredVarsTuple<K>;
}

export const TEMPLATE_CATALOG: { [K in TemplateKey]: RecoveryTemplate<K> } = {
  dunning_first_warning: {
    name: "Dunning First Warning",
    description: "A calm payment recovery note for the first failed renewal.",
    trigger: "invoice.payment_failed",
    cooldownDays: 7,
    campaignType: "dunning",
    subject: "Payment issue for {{company_name}}",
    rawHtml: `<p>Hi {{first_name}},</p>
<p>We could not process the latest <strong>{{company_name}}</strong> renewal.</p>
<p>Please sign in to your workspace and update your billing details to keep service active.</p>
<hr />
<p>Need help? Reply directly to this email and our team will help.</p>`,
    requiredVariables: TEMPLATE_REQUIRED_VARIABLES.dunning_first_warning,
  },

  payment_failed_urgent: {
    name: "Payment Failed Urgent",
    description: "A higher-urgency payment notice before account interruption.",
    trigger: "invoice.payment_failed_urgent",
    cooldownDays: 7,
    campaignType: "alert",
    subject: "Urgent: update {{company_name}} billing to avoid interruption",
    rawHtml: `<p>Hi {{first_name}},</p>
<p>Your <strong>{{company_name}}</strong> workspace has an unresolved payment.</p>
<p>To keep service active, please update the payment method from your billing settings.</p>
<p>If this looks wrong, reply to this email and we will help immediately.</p>
<hr />
<p>Thank you,<br />The {{company_name}} billing team</p>`,
    requiredVariables: TEMPLATE_REQUIRED_VARIABLES.payment_failed_urgent,
  },

  inactivity_check_in: {
    name: "Inactivity Check-in",
    description: "A friendly reactivation note for accounts showing churn risk.",
    trigger: "customer.inactivity_detected",
    cooldownDays: 30,
    campaignType: "reactivation",
    subject: "Can we help you get more from {{company_name}}?",
    rawHtml: `<p>Hi {{first_name}},</p>
<p>We noticed your team has been quieter than usual in <strong>{{company_name}}</strong>.</p>
<p>If you still want to continue, sign in to your workspace and pick up where you left off.</p>
<p>Questions or blockers? Reply directly and we will help.</p>`,
    requiredVariables: TEMPLATE_REQUIRED_VARIABLES.inactivity_check_in,
  },
};

export const TEMPLATE_CATALOG_ENTRIES = Object.entries(TEMPLATE_CATALOG) as Array<
  [TemplateKey, RecoveryTemplate<TemplateKey>]
>;

export function isTemplateKey(value: string): value is TemplateKey {
  return Object.hasOwn(TEMPLATE_CATALOG, value);
}

export function getMissingTemplateVariables<K extends TemplateKey>(
  templateKey: K,
  context: Readonly<Record<string, unknown>>
): TemplateVariableKey<K>[] {
  const required = TEMPLATE_REQUIRED_VARIABLES[templateKey];
  return required.filter(
    (key) => !(key in context) || context[key] === undefined || context[key] === null
  ) as TemplateVariableKey<K>[];
}
