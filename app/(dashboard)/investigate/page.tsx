// app/(dashboard)/investigate/page.tsx
import { redirect } from 'next/navigation';

/**
 * Structural Fallback Route
 * * Catch-all for when a user (or a prefetching <Link>) navigates to 
 * the base /investigate route without specifying an anomaly ID.
 * Automatically bounces the user back to the Command Center to 
 * select a valid insight from the InsightsFeed.
 */
export default function InvestigateIndexPage() {
  // Server-side redirect (HTTP 307 Temporary Redirect)
  // Ensures zero client-side rendering overhead.
  redirect('/dashboard');
}