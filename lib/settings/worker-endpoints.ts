export type WorkerEndpointEnvironment = Record<string, string | undefined>;

// Keep trusted server handoffs aligned with the fallback that fronts ordinary
// `/api` requests in `next.config.mjs`. It is tried last, after any deployment-
// specific endpoint, so a stale environment variable cannot strand a crawl.
const DEPLOYED_API_FALLBACK_URL = "https://arcli-s2mti.ondigitalocean.app";

function joinBackendPath(baseUrl: string, path: string) {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (base.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${base}${normalizedPath.slice(4)}`;
  }

  return `${base}${normalizedPath}`;
}

function uniqueEndpoints(candidates: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      candidates
        .map((endpoint) => endpoint?.trim())
        .filter((endpoint): endpoint is string => Boolean(endpoint)),
    ),
  );
}

function backendEndpoints(
  path: string,
  environment: WorkerEndpointEnvironment,
) {
  return [
    environment.ARCLI_WORKER_API_URL,
    environment.PYTHON_BACKEND_URL,
    environment.INTERNAL_API_URL,
    // The frontend rewrite already uses these names to reach FastAPI. Include
    // them here as well: server-to-server worker handoffs do not pass through
    // Next.js rewrites, so they need to resolve the backend independently.
    environment.BACKEND_API_URL,
    environment.NEXT_PUBLIC_API_URL,
    DEPLOYED_API_FALLBACK_URL,
  ].map((baseUrl) => (baseUrl ? joinBackendPath(baseUrl, path) : null));
}

export function crawlTriggerEndpoints(
  environment: WorkerEndpointEnvironment = process.env,
) {
  return uniqueEndpoints([
    environment.ARCLI_CRAWLER_TRIGGER_URL,
    environment.ARCLI_CRAWLER_INGEST_URL,
    ...backendEndpoints("/api/crawl/trigger", environment),
  ]);
}

export function embeddingTriggerEndpoints(
  environment: WorkerEndpointEnvironment = process.env,
) {
  return uniqueEndpoints([
    environment.ARCLI_PROFILE_EMBEDDING_TRIGGER_URL,
    ...backendEndpoints("/api/service-profile/embed/trigger", environment),
  ]);
}
