import { Redis } from "@upstash/redis";

export interface WorkspaceWidgetConfig {
  id: string;
  query: string;
  group: string;
  priority: number;
  title?: string;
  description?: string;
  data?: Array<Record<string, unknown>>;
  chartSpec?: Record<string, unknown>;
  vegaLiteSpec?: Record<string, unknown>;
}

export interface WorkspaceDocument {
  id: string;
  tenantId: string;
  prompt: string;
  narrative: string;
  widgets: WorkspaceWidgetConfig[];
  plan?: unknown;
  sql?: string;
  insights?: unknown;
  diagnostics?: unknown;
  rawPayload?: unknown;
  createdAt: string;
}

const DEFAULT_WORKSPACE_TTL_SECONDS = 60 * 60 * 24;
const WORKSPACE_KEY_PREFIX = "dataomen:workspace";

type LocalCacheEntry = {
  expiresAt: number;
  value: WorkspaceDocument;
};

const localWorkspaceCache = new Map<string, LocalCacheEntry>();

const redisClient =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function workspaceKey(workspaceId: string): string {
  return `${WORKSPACE_KEY_PREFIX}:${workspaceId}`;
}

function normalizeRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  if (value.length === 0) {
    return [];
  }

  if (isRecord(value[0])) {
    return value as Array<Record<string, unknown>>;
  }

  return value.map((entry, index) => ({
    index,
    value: entry,
  }));
}

function toPriority(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }

  return fallback;
}

function buildWidgetFromRecord(
  candidate: Record<string, unknown>,
  index: number,
  fallbackSql?: string
): WorkspaceWidgetConfig {
  const chartSpecCandidate = candidate.chart_spec ?? candidate.chartSpec;
  const vegaLiteCandidate =
    candidate.vega_lite_spec ?? candidate.vegaLiteSpec ?? candidate.vega_lite ?? candidate.vegaLite;

  return {
    id:
      (typeof candidate.id === "string" && candidate.id.trim()) ||
      `workspace_widget_${index + 1}`,
    query:
      (typeof candidate.query === "string" && candidate.query.trim()) ||
      (typeof candidate.sql === "string" && candidate.sql.trim()) ||
      (typeof candidate.sql_query === "string" && candidate.sql_query.trim()) ||
      fallbackSql ||
      "SELECT 1 AS value",
    group:
      (typeof candidate.group === "string" && candidate.group.trim()) || "analysis",
    priority: toPriority(candidate.priority, Math.max(10, 100 - index * 5)),
    title:
      typeof candidate.title === "string"
        ? candidate.title
        : typeof candidate.metric === "string"
          ? candidate.metric
          : undefined,
    description:
      typeof candidate.description === "string" ? candidate.description : undefined,
    data: normalizeRows(candidate.data ?? candidate.rows ?? candidate.result),
    chartSpec: isRecord(chartSpecCandidate) ? chartSpecCandidate : undefined,
    vegaLiteSpec: isRecord(vegaLiteCandidate) ? vegaLiteCandidate : undefined,
  };
}

export function buildWorkspaceWidgets(
  payload: unknown,
  fallbackSql?: string
): WorkspaceWidgetConfig[] {
  const normalizedPayload =
    isRecord(payload) && payload.payload !== undefined ? payload.payload : payload;

  if (Array.isArray(normalizedPayload)) {
    return [
      {
        id: "workspace_primary_table",
        query: fallbackSql || "SELECT * FROM analysis_result",
        group: "analysis",
        priority: 100,
        title: "Compiled Analytical Result",
        description: "Rehydrated from orchestration payload.",
        data: normalizeRows(normalizedPayload),
      },
    ];
  }

  if (!isRecord(normalizedPayload)) {
    return [];
  }

  const widgetsCandidate = normalizedPayload.widgets;
  if (Array.isArray(widgetsCandidate) && widgetsCandidate.length > 0) {
    return widgetsCandidate.map((widget, index) => {
      if (isRecord(widget)) {
        return buildWidgetFromRecord(widget, index, fallbackSql);
      }

      return {
        id: `workspace_widget_${index + 1}`,
        query: fallbackSql || "SELECT 1 AS value",
        group: "analysis",
        priority: Math.max(10, 100 - index * 5),
        title: `Widget ${index + 1}`,
        data: normalizeRows(widget),
      };
    });
  }

  const hasStructuredPayload =
    normalizedPayload.chart_spec !== undefined ||
    normalizedPayload.chartSpec !== undefined ||
    normalizedPayload.data !== undefined ||
    normalizedPayload.rows !== undefined;

  if (hasStructuredPayload) {
    return [
      buildWidgetFromRecord(
        {
          id: "workspace_primary_widget",
          ...normalizedPayload,
        },
        0,
        fallbackSql
      ),
    ];
  }

  return [];
}

function cleanupLocalWorkspaceCache(now = Date.now()): void {
  for (const [key, entry] of localWorkspaceCache.entries()) {
    if (entry.expiresAt <= now) {
      localWorkspaceCache.delete(key);
    }
  }

  if (localWorkspaceCache.size <= 2000) {
    return;
  }

  const sortedByExpiry = [...localWorkspaceCache.entries()].sort(
    (a, b) => a[1].expiresAt - b[1].expiresAt
  );

  for (const [key] of sortedByExpiry.slice(0, localWorkspaceCache.size - 2000)) {
    localWorkspaceCache.delete(key);
  }
}

export async function saveWorkspaceDocument(
  document: WorkspaceDocument,
  ttlSeconds = DEFAULT_WORKSPACE_TTL_SECONDS
): Promise<void> {
  const key = workspaceKey(document.id);
  const expiresAt = Date.now() + ttlSeconds * 1000;

  localWorkspaceCache.set(key, { expiresAt, value: document });
  cleanupLocalWorkspaceCache();

  if (!redisClient) {
    return;
  }

  try {
    await redisClient.set(key, document, { ex: ttlSeconds });
  } catch (error) {
    console.warn("Failed to persist workspace document to Redis", error);
  }
}

export async function getWorkspaceDocument(
  workspaceId: string
): Promise<WorkspaceDocument | null> {
  const key = workspaceKey(workspaceId);
  const cached = localWorkspaceCache.get(key);

  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return cached.value;
    }

    localWorkspaceCache.delete(key);
  }

  if (!redisClient) {
    return null;
  }

  try {
    const redisValue = await redisClient.get<WorkspaceDocument>(key);
    if (!redisValue) {
      return null;
    }

    localWorkspaceCache.set(key, {
      expiresAt: Date.now() + DEFAULT_WORKSPACE_TTL_SECONDS * 1000,
      value: redisValue,
    });

    cleanupLocalWorkspaceCache();
    return redisValue;
  } catch (error) {
    console.warn("Failed to load workspace document from Redis", error);
    return null;
  }
}

export function getDefaultExecutiveWidgets(): WorkspaceWidgetConfig[] {
  return [
    {
      id: "executive_revenue_trend",
      title: "Revenue Trajectory",
      description: "Daily gross revenue trend",
      query:
        "SELECT created_at, value FROM executive_revenue_trend ORDER BY created_at ASC",
      group: "executive",
      priority: 100,
      data: [
        { created_at: "2026-04-21", value: 14820 },
        { created_at: "2026-04-22", value: 15240 },
        { created_at: "2026-04-23", value: 16110 },
        { created_at: "2026-04-24", value: 15780 },
        { created_at: "2026-04-25", value: 16640 },
      ],
    },
    {
      id: "executive_order_velocity",
      title: "Order Velocity",
      description: "Orders processed per day",
      query:
        "SELECT created_at, value FROM executive_order_velocity ORDER BY created_at ASC",
      group: "executive",
      priority: 95,
      data: [
        { created_at: "2026-04-21", value: 212 },
        { created_at: "2026-04-22", value: 228 },
        { created_at: "2026-04-23", value: 241 },
        { created_at: "2026-04-24", value: 236 },
        { created_at: "2026-04-25", value: 249 },
      ],
    },
    {
      id: "executive_margin_signal",
      title: "Margin Signal",
      description: "Gross margin pulse",
      query:
        "SELECT created_at, value FROM executive_margin_signal ORDER BY created_at ASC",
      group: "finance",
      priority: 90,
      data: [
        { created_at: "2026-04-21", value: 46.3 },
        { created_at: "2026-04-22", value: 45.8 },
        { created_at: "2026-04-23", value: 47.1 },
        { created_at: "2026-04-24", value: 46.7 },
        { created_at: "2026-04-25", value: 47.4 },
      ],
    },
  ];
}
