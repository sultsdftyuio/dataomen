/**
 * Compatibility endpoint for stale Open Graph URLs published before the
 * canonical image path moved to `/api/og`. It intentionally renders the same
 * image rather than redirecting: social crawlers vary in redirect support.
 */
import { GET as canonicalOgGet } from "../api/og/route";

// Route-segment configuration must be declared locally. Turbopack statically
// analyzes these exports and deliberately rejects re-exports, even when the
// values are identical to the canonical `/api/og` endpoint.
export const runtime = "edge";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export function GET(request: Request) {
  return canonicalOgGet(request);
}
