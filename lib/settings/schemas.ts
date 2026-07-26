// lib/settings/schemas.ts
import { z } from "zod";
import {
  DISCOVERY_QUERY_TYPES,
  discoveryQueryPlanValidationError,
} from "@/lib/discovery-queries";

// ---------------------------------------------------------------------------
// Utility Preprocessors
// ---------------------------------------------------------------------------

/**
 * Trims leading and trailing whitespace from string inputs.
 * Non-string values are returned unchanged so Zod can report
 * the appropriate type validation error.
 */
const trimString = (value: unknown) =>
  typeof value === "string" ? value.trim() : value;

const normalizeEmailString = (value: string) => value.trim().toLowerCase();

const normalizeNullableString = (value: string) => value.trim();

// ---------------------------------------------------------------------------
// Email Validation
// ---------------------------------------------------------------------------

/**
 * Accepts either a plain address or a display-name formatted address.
 * This validates the entire input rather than matching an email embedded
 * somewhere inside an arbitrary string.
 */
const SENDER_EMAIL_REGEX =
  /^(?:[^<>]+<[^<>\s]+@[^<>\s]+\.[^<>\s]+>|[^<>\s]+@[^<>\s]+\.[^<>\s]+)$/;

// ---------------------------------------------------------------------------
// Reusable Field Schemas
// ---------------------------------------------------------------------------

/**
 * Legacy sender email. Empty string is permitted so the UI can clear the field.
 */
export const SenderEmailSchema = z.preprocess(
  trimString,
  z.union([
    z.string().regex(
      SENDER_EMAIL_REGEX,
      "Must be a valid email address or 'Name <email@example.com>'"
    ).transform(normalizeEmailString),
    z.literal(""),
  ])
);

/**
 * Optional Reply-To address.
 *
 * Unlike Sender, this accepts only a plain email address.
 */
export const ReplyToEmailSchema = z.preprocess(
  trimString,
  z.union([
    z.string().email("Invalid email address format").transform(normalizeEmailString),
    z.literal(""),
  ])
);

export const WebsiteUrlSchema = z.preprocess(
  trimString,
  z
    .string()
    .superRefine((value, ctx) => {
      if (value === "") return;

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(value);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be a valid URL format",
        });
        return;
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Website URL must start with http:// or https://",
        });
      }
    })
    .transform(normalizeNullableString)
);

// ---------------------------------------------------------------------------
// Workspace Settings Schema
// ---------------------------------------------------------------------------

export const WorkspaceSettingsSchema = z
  .object({
    companyName: z
      .preprocess(
        trimString,
        z
          .string()
          .max(100, "Company name must be 100 characters or less")
          .transform(normalizeNullableString)
      )
      .optional(),

    /**
     * Legacy sender identity retained for backwards-compatible settings payloads.
     */
    senderEmail: SenderEmailSchema.optional(),

    /**
     * Legacy Reply-To address retained for backwards-compatible settings payloads.
     */
    replyToEmail: ReplyToEmailSchema.optional(),

    /**
     * Full Name associated with the user profile updating the workspace.
     */
    fullName: z
      .preprocess(
        trimString,
        z
          .string()
          .max(100, "Full name must be 100 characters or less")
          .transform(normalizeNullableString)
      )
      .optional(),

    /**
     * Optional company website URL.
     */
    websiteUrl: WebsiteUrlSchema.optional(),
  })
  .strip(); // Safely remove unmapped frontend properties instead of throwing a 400 Bad Request

export type WorkspaceSettingsInput = z.infer<
  typeof WorkspaceSettingsSchema
>;

const serviceProfileListField = z
  .array(z.preprocess(trimString, z.string().min(1)))
  .default([]);

const discoveryPhraseListField = z
  .array(z.preprocess(trimString, z.string().min(1)))
  .max(6)
  .default([]);

const discoveryQueryField = z
  .object({
    query_type: z.preprocess(trimString, z.enum(DISCOVERY_QUERY_TYPES)),
    phrase: z.preprocess(trimString, z.string().min(1)),
  })
  .strict();

const discoveryQueryPlanField = z
  .array(discoveryQueryField)
  .max(DISCOVERY_QUERY_TYPES.length)
  .default([])
  .superRefine((queries, context) => {
    const issue = discoveryQueryPlanValidationError(queries);
    if (issue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue,
      });
    }
  });

export const ServiceProfileSettingsSchema = z
  .object({
    target_audience: serviceProfileListField,
    core_problem: z.preprocess(trimString, z.string().default("")),
    unique_value_prop: z.preprocess(trimString, z.string().default("")),
    use_cases: serviceProfileListField,
    pain_points: serviceProfileListField,
    buying_triggers: serviceProfileListField,
    urgency_signals: serviceProfileListField,
    discovery_queries: discoveryQueryPlanField,
    search_terms: discoveryPhraseListField,
    negative_keywords: serviceProfileListField,
    excluded_audiences: serviceProfileListField,
  })
  .strict();

export type ServiceProfileSettingsInput = z.infer<
  typeof ServiceProfileSettingsSchema
>;

// ---------------------------------------------------------------------------
// Notification Settings Schema
// ---------------------------------------------------------------------------

export const NotificationSettingsSchema = z
  .object({
    notifyAnomalies: z.boolean({
      required_error: "notifyAnomalies flag is required.",
    }),

    notifyWeekly: z.boolean({
      required_error: "notifyWeekly flag is required.",
    }),
  })
  .strip();

export type NotificationSettingsInput = z.infer<
  typeof NotificationSettingsSchema
>;
