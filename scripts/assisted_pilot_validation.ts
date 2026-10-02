import { z } from "zod";

export const publicUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
    && !value.includes("@")
    && !/(^|\.)(localhost|local)$/.test(host)
    && !/^(0|10|127)\./.test(host)
    && !/^192\.168\.|^169\.254\.|^198\.(18|19)\./.test(host)
    && !/^172\.(1[6-9]|2\d|3[01])\./.test(host)
    && !/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
    && !/^\[(::1|0:0:0:0:0:0:0:1|::ffff:|fe[89ab]|f[cd])/.test(host);
}, "Use a public HTTP(S) URL without credentials.");

export const safeText = z.string().trim().min(1).max(480).refine(
  (value) => !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}|[+]?([0-9][0-9 .()-]{6,}[0-9])/i.test(value),
  "Do not copy personal email addresses or phone numbers into cards.",
);

export const sourceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => Number.isFinite(Date.parse(value)) && value <= new Date().toISOString().slice(0, 10),
  "Use an actual source date that is not in the future.",
);
