import type { CookieOptionsWithName } from "@supabase/ssr";

const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const isLocalHostname = (hostname: string) => {
  return LOCALHOST_NAMES.has(hostname) || hostname.endsWith(".localhost");
};

const readNonEmptyEnv = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const resolveCookieSiteUrl = () => {
  const configuredUrl =
    readNonEmptyEnv(process.env.NEXT_PUBLIC_SITE_URL) ??
    readNonEmptyEnv(process.env.NEXT_PUBLIC_VERCEL_URL) ??
    "http://localhost:3000";

  const urlWithScheme = /^https?:\/\//i.test(configuredUrl)
    ? configuredUrl
    : `https://${configuredUrl}`;

  return new URL(urlWithScheme);
};

const resolveCookieDomain = () => {
  const configuredDomain = process.env.NEXT_PUBLIC_SUPABASE_COOKIE_DOMAIN?.trim();
  if (!configuredDomain) return undefined;

  const preserveLeadingDot = configuredDomain.startsWith(".");
  const hostname = configuredDomain
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/^\./, "");

  return isLocalHostname(hostname)
    ? undefined
    : `${preserveLeadingDot ? "." : ""}${hostname}`;
};

export const getSupabaseCookieOptions = (): CookieOptionsWithName => {
  const siteUrl = resolveCookieSiteUrl();
  const domain = resolveCookieDomain();

  return {
    ...(domain ? { domain } : {}),
    path: "/",
    sameSite: "lax",
    secure: siteUrl.protocol === "https:" && !isLocalHostname(siteUrl.hostname),
  };
};
