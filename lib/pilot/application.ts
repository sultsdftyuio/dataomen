import { isIP } from "node:net";
import { z } from "zod";

const shortText = (max: number) => z.string().trim().min(2).max(max)
  .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/.test(value), "Use plain text without markup.");

export const pilotApplicationSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  websiteUrl: z.string().trim().url().max(2048).transform((value, context) => {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
        || !host.includes(".") || isIP(host) || host === "localhost"
        || host.endsWith(".localhost") || host.endsWith(".local")) {
      context.addIssue({ code: "custom", message: "Enter a public company website." });
      return z.NEVER;
    }
    url.hash = "";
    return url.toString();
  }),
  offer: shortText(500).refine((value) => value.length >= 10),
  idealCustomer: shortText(700).refine((value) => value.length >= 10),
  buyerRole: shortText(160).optional().or(z.literal("")),
  geography: shortText(160).optional().or(z.literal("")),
  companyFax: z.string().max(200).optional(),
}).strict();

export type PilotApplication = z.infer<typeof pilotApplicationSchema>;
