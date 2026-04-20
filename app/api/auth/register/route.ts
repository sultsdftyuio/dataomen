import { NextResponse } from "next/server";

const ABSOLUTE_HTTP_URL_REGEX = /^https?:\/\//i;
const ROOT_RELATIVE_URL_REGEX = /^\//;
const LOCAL_BACKEND_FALLBACKS = ["http://localhost:8000", "http://localhost:8080"];

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const resolveRegisterEndpoint = (rawBase: string, requestOrigin: string): string | null => {
  const trimmedBase = trimTrailingSlash(rawBase.trim());
  if (!trimmedBase) return null;

  let base = trimmedBase;
  if (ROOT_RELATIVE_URL_REGEX.test(base)) {
    base = `${trimTrailingSlash(requestOrigin)}${base}`;
  } else if (!ABSOLUTE_HTTP_URL_REGEX.test(base)) {
    return null;
  }

  const lowerBase = base.toLowerCase();

  if (lowerBase.endsWith("/api/v1/auth/register") || lowerBase.endsWith("/v1/auth/register")) {
    return base;
  }

  if (lowerBase.endsWith("/api/v1/auth") || lowerBase.endsWith("/v1/auth")) {
    return `${base}/register`;
  }

  if (lowerBase.endsWith("/api/v1") || lowerBase.endsWith("/v1")) {
    return `${base}/auth/register`;
  }

  if (lowerBase.endsWith("/api")) {
    return `${base}/v1/auth/register`;
  }

  return `${base}/api/v1/auth/register`;
};

const buildRegisterEndpointCandidates = (requestOrigin: string): string[] => {
  const baseCandidates = [
    process.env.BACKEND_API_URL,
    process.env.NEXT_PUBLIC_API_URL,
    ...LOCAL_BACKEND_FALLBACKS,
    "/api/v1",
    "/api",
  ];

  const endpoints = new Set<string>();
  for (const candidate of baseCandidates) {
    const endpoint = resolveRegisterEndpoint((candidate || "").trim(), requestOrigin);
    if (endpoint) endpoints.add(endpoint);
  }

  return Array.from(endpoints);
};

const readErrorPayload = async (response: Response): Promise<{ detail?: unknown; message?: string; error?: string }> => {
  const text = await response.text().catch(() => "");
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
};

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON payload." }, { status: 400 });
  }

  const requestOrigin = new URL(request.url).origin;
  const endpoints = buildRegisterEndpointCandidates(requestOrigin);

  if (!endpoints.length) {
    return NextResponse.json({ detail: "Registration service is not configured." }, { status: 500 });
  }

  let selectedResponse: Response | null = null;
  let lastNetworkError: unknown = null;

  for (const endpoint of endpoints) {
    try {
      const attempt = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      selectedResponse = attempt;
      if (attempt.status !== 404) {
        break;
      }
    } catch (error) {
      lastNetworkError = error;
    }
  }

  if (!selectedResponse) {
    return NextResponse.json(
      { detail: "Registration service request failed.", error: String(lastNetworkError || "Network error") },
      { status: 502 }
    );
  }

  if (!selectedResponse.ok) {
    const payload = await readErrorPayload(selectedResponse);
    return NextResponse.json(payload, { status: selectedResponse.status });
  }

  const data = await readErrorPayload(selectedResponse);
  return NextResponse.json(data, { status: selectedResponse.status });
}
