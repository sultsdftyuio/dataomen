export const DEFAULT_POST_AUTH_REDIRECT_PATH = "/dashboard";

const AUTH_ENTRY_PATHS = [
  "/auth/callback",
  "/forgot-password",
  "/login",
  "/register",
  "/sign-up",
  "/signup",
];

const isAuthEntryPath = (pathname: string) => {
  return AUTH_ENTRY_PATHS.some(
    (entryPath) => pathname === entryPath || pathname.startsWith(`${entryPath}/`)
  );
};

export const resolvePostAuthRedirectPath = (
  value: string | null | undefined,
  fallback = DEFAULT_POST_AUTH_REDIRECT_PATH
) => {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.includes(":")
  ) {
    return fallback;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, "https://app.local");
  } catch {
    return fallback;
  }

  if (parsed.origin !== "https://app.local") {
    return fallback;
  }

  const nextPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;

  if (parsed.pathname === "/" || isAuthEntryPath(parsed.pathname)) {
    return fallback;
  }

  return nextPath;
};

export const buildAuthCallbackPath = (nextPath?: string | null) => {
  const callbackUrl = new URL("/auth/callback", "https://app.local");
  callbackUrl.searchParams.set("next", resolvePostAuthRedirectPath(nextPath));

  return `${callbackUrl.pathname}${callbackUrl.search}`;
};
