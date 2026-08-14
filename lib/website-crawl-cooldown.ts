import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

const DEFAULT_WEBSITE_CRAWL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

/**
 * The daily quality guard is the default. Local testing can opt into unlimited
 * scans explicitly, but no deployed environment should need this override.
 */
export function websiteCrawlTestModeEnabled() {
  const value = process.env.ARCLI_UNLIMITED_CRAWL_TEST_MODE?.trim().toLowerCase();
  return ENABLED_VALUES.has(value ?? "");
}

export const WEBSITE_CRAWL_COOLDOWN_MS = websiteCrawlTestModeEnabled()
  ? 0
  : DEFAULT_WEBSITE_CRAWL_COOLDOWN_MS;

type CrawlCooldownClient = SupabaseClient<Database>;

export type WebsiteCrawlCooldown = {
  lastRequestedAt: string | null;
  nextAvailableAt: string | null;
};

type CrawlJobTimestamp = { queued_at?: string | null };

/**
 * Read the tenant-wide website scan cooldown. This is an early, user-friendly
 * guard; the worker enforces the same limit before any crawl work begins.
 */
export async function getWebsiteCrawlCooldown(
  supabase: CrawlCooldownClient,
  tenantId: string,
): Promise<WebsiteCrawlCooldown> {
  if (WEBSITE_CRAWL_COOLDOWN_MS === 0) {
    return { lastRequestedAt: null, nextAvailableAt: null };
  }

  const client = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => {
            limit: (count: number) => {
              maybeSingle: <T>() => Promise<{ data: T | null; error: unknown }>;
            };
          };
        };
      };
    };
  };

  const result = await client
    .from("crawl_jobs")
    .select("queued_at")
    .eq("tenant_id", tenantId)
    .order("queued_at", { ascending: false })
    .limit(1)
    .maybeSingle<CrawlJobTimestamp>();

  if (result.error) {
    console.warn("[WebsiteCrawlCooldown] lookup unavailable", {
      tenant_id: tenantId,
      error: result.error,
    });
    return { lastRequestedAt: null, nextAvailableAt: null };
  }

  const lastRequestedAt =
    typeof result.data?.queued_at === "string" ? result.data.queued_at : null;
  const timestamp = lastRequestedAt ? Date.parse(lastRequestedAt) : Number.NaN;
  if (!Number.isFinite(timestamp)) {
    return { lastRequestedAt: null, nextAvailableAt: null };
  }

  const nextTimestamp = timestamp + WEBSITE_CRAWL_COOLDOWN_MS;
  return {
    lastRequestedAt,
    nextAvailableAt:
      nextTimestamp > Date.now() ? new Date(nextTimestamp).toISOString() : null,
  };
}

export function websiteCrawlCooldownMessage(nextAvailableAt: string | null) {
  const date = nextAvailableAt ? new Date(nextAvailableAt) : null;
  const nextAvailableLabel =
    date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(date)
      : "tomorrow";

  return `Website scans are available once every 24 hours to keep matching quality high. Your next fresh scan is available ${nextAvailableLabel}.`;
}
