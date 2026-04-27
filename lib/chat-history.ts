export type ChatRole = "user" | "assistant" | "system";

export interface ChatSessionSummary {
  id: string;
  title: string;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupedChatSessions {
  today: ChatSessionSummary[];
  yesterday: ChatSessionSummary[];
  previous7Days: ChatSessionSummary[];
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  metadata: Record<string, unknown> | null;
  isPartial: boolean;
  createdAt: string;
  updatedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toIsoOrNow(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return new Date().toISOString();
}

function toStringOrFallback(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return fallback;
}

function toUtcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getUtcDayDelta(targetIso: string, now: Date): number {
  const parsed = new Date(targetIso);
  if (Number.isNaN(parsed.getTime())) {
    return Number.POSITIVE_INFINITY;
  }
  const todayStart = toUtcDayStart(now);
  const targetStart = toUtcDayStart(parsed);
  return Math.floor((todayStart - targetStart) / DAY_MS);
}

export function createEmptyGroupedSessions(): GroupedChatSessions {
  return {
    today: [],
    yesterday: [],
    previous7Days: [],
  };
}

export function mapSessionRow(row: unknown): ChatSessionSummary | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const source = row as Record<string, unknown>;
  const id = toStringOrFallback(source.id, "").trim();
  if (!id) {
    return null;
  }

  return {
    id,
    title: toStringOrFallback(source.title, "Untitled chat"),
    agentId: typeof source.agent_id === "string" ? source.agent_id : null,
    createdAt: toIsoOrNow(source.created_at),
    updatedAt: toIsoOrNow(source.updated_at),
  };
}

export function mapMessageRow(row: unknown): ChatMessageRecord | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const source = row as Record<string, unknown>;
  const id = toStringOrFallback(source.id, "").trim();
  const sessionId = toStringOrFallback(source.session_id, "").trim();
  const role = toStringOrFallback(source.role, "assistant");
  const content = typeof source.content === "string" ? source.content : "";

  if (!id || !sessionId || (role !== "user" && role !== "assistant" && role !== "system")) {
    return null;
  }

  return {
    id,
    sessionId,
    role,
    content,
    metadata: source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
      ? (source.metadata as Record<string, unknown>)
      : null,
    isPartial: Boolean(source.is_partial),
    createdAt: toIsoOrNow(source.created_at),
    updatedAt: toIsoOrNow(source.updated_at),
  };
}

export function deriveSessionTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New chat";
  }

  const title = normalized.slice(0, 80);
  return title.length < normalized.length ? `${title}...` : title;
}

export function groupSessionsByRecency(
  sessions: ChatSessionSummary[],
  now: Date = new Date(),
): GroupedChatSessions {
  const grouped = createEmptyGroupedSessions();

  for (const session of sessions) {
    const delta = getUtcDayDelta(session.updatedAt, now);
    if (delta <= 0) {
      grouped.today.push(session);
      continue;
    }

    if (delta === 1) {
      grouped.yesterday.push(session);
      continue;
    }

    // Keep older threads visible inside the same structural bucket used by the UI.
    grouped.previous7Days.push(session);
  }

  return grouped;
}
