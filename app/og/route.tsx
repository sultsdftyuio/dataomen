/**
 * Compatibility endpoint for stale Open Graph URLs published before the
 * canonical image path moved to `/api/og`. It intentionally renders the same
 * image rather than redirecting: social crawlers vary in redirect support.
 */
export {
  contentType,
  GET,
  runtime,
  size,
} from "../api/og/route";
