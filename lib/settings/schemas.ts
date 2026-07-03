// lib/settings/schemas.ts
import { z } from "zod";

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

// ---------------------------------------------------------------------------
// Email Validation
// ---------------------------------------------------------------------------

/**
 * Accepts either:
 * recovery@example.com
 *
 * or:
 * Arcli Recovery <recovery@example.com>
 *
 * This validates the entire input rather than matching an email
 * embedded somewhere inside an arbitrary string.
 */
const SENDER_EMAIL_REGEX =
  /^(?:[^<>]+<[^<>\s]+@[^<>\s]+\.[^<>\s]+>|[^<>\s]+@[^<>\s]+\.[^<>\s]+)$/;

// ---------------------------------------------------------------------------
// Reusable Field Schemas
// ---------------------------------------------------------------------------

/**
 * Sender email used for campaign delivery.
 *
 * Empty string is permitted so the UI can clear the field while
 * reverting a campaign back to a draft state.
 */
export const SenderEmailSchema = z.preprocess(
  trimString,
  z.union([
    z.string().regex(
      SENDER_EMAIL_REGEX,
      "Must be a valid email address or 'Name <email@example.com>'"
    ),
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
    z.string().email("Invalid email address format"),
    z.literal(""),
  ])
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
      )
      .optional(),

    /**
     * Sender used for recovery email campaigns.
     */
    senderEmail: SenderEmailSchema.optional(),

    /**
     * Reply-To header for recovery emails.
     */
    replyToEmail: ReplyToEmailSchema.optional(),

    /**
     * Full Name associated with the user profile updating the workspace.
     */
    fullName: z
      .preprocess(
        trimString,
        z.string().max(100, "Full name must be 100 characters or less")
      )
      .optional(),

    /**
     * Optional company website URL.
     */
    websiteUrl: z
      .preprocess(
        trimString,
        z.union([
          z.string().url("Must be a valid URL format"),
          z.literal(""),
        ])
      )
      .optional(),
  })
  .strip(); // Safely remove unmapped frontend properties instead of throwing a 400 Bad Request

export type WorkspaceSettingsInput = z.infer<
  typeof WorkspaceSettingsSchema
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