/**
 * Compatibility endpoint for stale Open Graph URLs published before the
 * canonical image path moved to `/api/og`. It intentionally renders the same
 * image rather than redirecting: social crawlers vary in redirect support.
 */
import { GET as canonicalOgGet } from "../api/og/route";

export const runtime = "edge";

export function GET(request: Request) {
  return canonicalOgGet(request);
}
