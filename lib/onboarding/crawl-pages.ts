import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

export type CrawlPageSummary = {
  sourceUrl: string;
};

/**
 * Show only page addresses from the tenant's current crawl. The crawler stores
 * raw markdown in this table, but the progress screen never needs that content.
 */
export async function fetchCrawlPageSummaries(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  crawlJobId: string | null | undefined,
): Promise<CrawlPageSummary[]> {
  if (!crawlJobId) return [];

  // The generated database type does not yet include the additive crawl ledger.
  const client = supabase as unknown as SupabaseClient;
  const { data, error } = await client
    .from("crawl_pages")
    .select("source_url")
    .eq("tenant_id", tenantId)
    .eq("crawl_job_id", crawlJobId)
    .order("created_at", { ascending: true })
    .limit(12);

  if (error || !Array.isArray(data)) return [];

  return data.flatMap((row) => {
    if (typeof row?.source_url !== "string") return [];
    try {
      const url = new URL(row.source_url);
      return url.protocol === "http:" || url.protocol === "https:"
        ? [{ sourceUrl: url.toString() }]
        : [];
    } catch {
      return [];
    }
  });
}
