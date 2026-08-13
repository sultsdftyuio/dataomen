import type { SupabaseClient } from "@supabase/supabase-js";

import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { websiteCrawlTestModeEnabled } from "@/lib/website-crawl-cooldown";

type PlanLimitClient = SupabaseClient<any, any, any>;

export const FREE_PLAN_DOMAIN_LIMIT_MESSAGE =
  "Free workspaces can use one website domain. Upgrade to Pro to change it.";

export function normalizedWebsiteDomain(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;

  try {
    const candidate = /^https?:\/\//i.test(value.trim())
      ? value.trim()
      : `https://${value.trim()}`;
    const hostname = new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
    return hostname || null;
  } catch {
    return null;
  }
}

/**
 * Free workspaces get one discovery domain. Re-submitting that same domain is
 * allowed so an interrupted crawl can be retried, but switching or clearing
 * the saved domain requires Pro.
 */
export async function freePlanDomainChangeError(
  supabase: PlanLimitClient,
  tenantId: string,
  requestedWebsiteUrl: string | null | undefined,
): Promise<string | null> {
  // During the discovery test period, changing the active website is needed to
  // validate crawls. The normal Free-plan domain limit returns when the test
  // mode environment setting is disabled.
  if (websiteCrawlTestModeEnabled()) return null;

  const entitlements = await getWorkspaceEntitlements(supabase, tenantId);
  if (entitlements.planTier.toLowerCase() !== "free") return null;

  const { data, error } = await supabase
    .from("tenant_settings")
    .select("website_url")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ website_url: string | null }>();

  if (error) {
    console.error("[PlanLimits] Free website-domain limit lookup failed", {
      event: "free_plan_domain_limit_lookup_failed",
      tenant_id: tenantId,
      error,
    });
    return "Unable to verify the Free plan website limit. Please try again.";
  }

  const existingDomain = normalizedWebsiteDomain(data?.website_url);
  if (!existingDomain) return null;

  return normalizedWebsiteDomain(requestedWebsiteUrl) === existingDomain
    ? null
    : FREE_PLAN_DOMAIN_LIMIT_MESSAGE;
}
