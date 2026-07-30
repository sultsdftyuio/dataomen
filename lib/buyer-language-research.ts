/**
 * Guards for the optional buyer-language research view.
 *
 * This is deliberately stricter than a generic research feed: an item is
 * displayable only when it is explicitly accepted, belongs to the active
 * tenant/profile, and preserves an excerpt that is literally present in the
 * captured source text. It is research evidence, never a lead lifecycle
 * record.
 */

import { sourceGroundedExcerpt } from "@/lib/buyer-demand-report";

type UnknownRecord = Record<string, unknown>;

export type BuyerLanguageResearchEvidence = {
  id: string;
  source: string;
  sourceUrl: string | null;
  /** A normalized, literal substring of the preserved source text. */
  excerpt: string;
  capturedAt: string | null;
};

export type BuyerLanguageResearchView = {
  /** `unavailable` means the additive evidence store is not ready to read. */
  availability: "available" | "unavailable";
  evidence: BuyerLanguageResearchEvidence[];
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizedStatus(value: unknown): string | null {
  return asString(value)?.toLocaleLowerCase().replace(/\s+/g, "_") ?? null;
}

/**
 * Convert a canonical `discovery_evidence` row into safe UI data. The future
 * table contract intentionally uses canonical fields rather than accepting
 * arbitrary JSON aliases, so a schema drift fails closed instead of showing
 * unreviewed or invented wording.
 */
export function acceptedBuyerLanguageEvidenceFromRow(
  value: unknown,
  tenantId: string,
  serviceProfileId: string,
): BuyerLanguageResearchEvidence | null {
  const row = asRecord(value);
  if (!row) return null;

  const id = asString(row.id);
  const source = asString(row.source);
  const sourceText = asString(row.source_text);
  const evidenceExcerpt = asString(row.evidence_excerpt);

  if (
    !id ||
    !source ||
    !sourceText ||
    !evidenceExcerpt ||
    asString(row.tenant_id) !== tenantId ||
    asString(row.service_profile_id) !== serviceProfileId ||
    normalizedStatus(row.evidence_status) !== "accepted"
  ) {
    return null;
  }

  const excerpt = sourceGroundedExcerpt(sourceText, evidenceExcerpt);
  if (!excerpt) return null;

  return {
    id,
    source,
    sourceUrl: safeHttpUrl(asString(row.source_url)),
    excerpt,
    capturedAt: asString(row.created_at),
  };
}

/**
 * De-duplicate retried evidence without letting repeated rows inflate the
 * research view. The query's ordering determines which valid copy is kept.
 */
export function buildBuyerLanguageResearchEvidence(
  rows: unknown[],
  tenantId: string,
  serviceProfileId: string,
): BuyerLanguageResearchEvidence[] {
  const seen = new Set<string>();
  const evidence: BuyerLanguageResearchEvidence[] = [];

  for (const row of rows) {
    const item = acceptedBuyerLanguageEvidenceFromRow(
      row,
      tenantId,
      serviceProfileId,
    );
    if (!item || seen.has(item.id)) continue;

    seen.add(item.id);
    evidence.push(item);
  }

  return evidence;
}
