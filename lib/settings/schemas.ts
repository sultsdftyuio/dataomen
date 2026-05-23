import { z } from "zod";

const trimString = (value: unknown) => (typeof value === "string" ? value.trim() : value);

const VALID_TIMEZONES =
  typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC"];

const ReplyToEmailSchema = z.preprocess(
  trimString,
  z.union([z.string().email("Invalid email address"), z.literal("")])
);

export const WorkspaceSettingsSchema = z
  .object({
    companyName: z.preprocess(trimString, z.string().max(100, "Company name is too long")).optional(),
    replyToEmail: ReplyToEmailSchema.optional(),
    timezone: z
      .string()
      .refine((tz) => VALID_TIMEZONES.includes(tz), "Invalid timezone")
      .optional(),
  })
  .strict();

export type WorkspaceSettingsInput = z.infer<typeof WorkspaceSettingsSchema>;

export const NotificationSettingsSchema = z
  .object({
    notifyAnomalies: z.boolean({
      required_error: "notifyAnomalies flag is required.",
    }),
    notifyWeekly: z.boolean({
      required_error: "notifyWeekly flag is required.",
    }),
  })
  .strict();

export type NotificationSettingsInput = z.infer<typeof NotificationSettingsSchema>;
