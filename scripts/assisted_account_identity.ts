import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";

import { publicUrl, safeText } from "./assisted_pilot_validation";

export type AccountIdentity = { domain: string; canonicalUrl: string };

/** Domain identity intentionally handles only case and www. Brand aliases,
 * subsidiaries, and unrelated subdomains still need human review. */
export function normalizeAssistedAccount(rawUrl: string): AccountIdentity {
  const parsed = publicUrl.safeParse(rawUrl);
  if (!parsed.success) throw new Error("Account URL must be a public HTTP(S) URL.");
  const url = new URL(parsed.data);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const domain = host.replace(/^www\./, "");
  if (!domain.includes(".") || isIP(domain) || domain.length > 253
      || !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(domain)) {
    throw new Error("Account identity must use a public company domain.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return { domain, canonicalUrl: url.toString() };
}

export async function ensureAssistedAccountEntity(
  db: SupabaseClient<any, any, any>,
  tenantId: string,
  identity: AccountIdentity,
  title: string | null,
): Promise<string> {
  if (title !== null && (!safeText.safeParse(title).success || title.length > 240)) {
    throw new Error("Account title is invalid or contains contact details.");
  }
  const existing = await db.from("prospect_entities").select("id")
    .eq("tenant_id", tenantId).eq("entity_kind", "account")
    .eq("entity_provider", "assisted_account")
    .eq("entity_external_id", identity.domain).maybeSingle();
  if (existing.error) throw new Error(`Account lookup failed: ${existing.error.code}`);
  if (existing.data) return existing.data.id;

  const inserted = await db.from("prospect_entities").insert({
    tenant_id: tenantId,
    entity_kind: "account",
    entity_provider: "assisted_account",
    entity_external_id: identity.domain,
    canonical_url: identity.canonicalUrl,
    title,
    origin_kind: "manual",
  }).select("id").single();
  if (!inserted.error && inserted.data) return inserted.data.id;
  if (inserted.error?.code !== "23505") {
    throw new Error(`Account creation failed: ${inserted.error?.code ?? "unknown"}`);
  }
  const raced = await db.from("prospect_entities").select("id")
    .eq("tenant_id", tenantId).eq("entity_kind", "account")
    .eq("entity_provider", "assisted_account")
    .eq("entity_external_id", identity.domain).single();
  if (raced.error || !raced.data) {
    throw new Error(`Account conflict could not be resolved: ${raced.error?.code ?? "unknown"}`);
  }
  return raced.data.id;
}
