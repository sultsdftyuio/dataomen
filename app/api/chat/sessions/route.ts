import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import {
  createEmptyGroupedSessions,
  groupSessionsByRecency,
  mapSessionRow,
  type ChatSessionSummary,
} from "@/lib/chat-history";

export const dynamic = "force-dynamic";

const ROUTE_LAYER = "next-app-router";
const ROUTE_HANDLER = "/api/chat/sessions";

const withRouteTraceHeaders = (headers: Record<string, string> = {}) => ({
  "X-Route-Layer": ROUTE_LAYER,
  "X-Route-Handler": ROUTE_HANDLER,
  ...headers,
});

const CreateSessionSchema = z.object({
  title: z.string().trim().max(140).optional(),
  agentId: z.string().trim().max(120).optional(),
});

function isMissingTableError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  if (!candidate) return false;
  if (candidate.code === "42P01") return true;
  return String(candidate.message || "").toLowerCase().includes("does not exist");
}

function normalizeSessionRows(rows: unknown[] | null): ChatSessionSummary[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapSessionRow).filter((value): value is ChatSessionSummary => Boolean(value));
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null as null };
  }

  return { supabase, user };
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: withRouteTraceHeaders() },
      );
    }

    const { data, error } = await supabase
      .from("chat_sessions")
      .select("id,title,agent_id,created_at,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(120);

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            sessions: [],
            grouped: createEmptyGroupedSessions(),
            storeStatus: "missing_tables",
          },
          { status: 200, headers: withRouteTraceHeaders() },
        );
      }

      return NextResponse.json(
        { error: "Failed to fetch chat sessions." },
        { status: 500, headers: withRouteTraceHeaders() },
      );
    }

    const sessions = normalizeSessionRows(data || []);

    return NextResponse.json(
      {
        sessions,
        grouped: groupSessionsByRecency(sessions),
        storeStatus: "ok",
      },
      { status: 200, headers: withRouteTraceHeaders() },
    );
  } catch (error) {
    console.error("[Chat Sessions API] GET failed", error);
    return NextResponse.json(
      { error: "Failed to fetch chat sessions." },
      { status: 500, headers: withRouteTraceHeaders() },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: withRouteTraceHeaders() },
      );
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = CreateSessionSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
          details: parsed.error.flatten(),
        },
        { status: 400, headers: withRouteTraceHeaders() },
      );
    }

    const nowIso = new Date().toISOString();
    const payload = {
      user_id: user.id,
      title: parsed.data.title || "New chat",
      agent_id: parsed.data.agentId || null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data, error } = await supabase
      .from("chat_sessions")
      .insert(payload)
      .select("id,title,agent_id,created_at,updated_at")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: "Chat session tables are missing. Create chat_sessions/chat_messages first." },
          { status: 503, headers: withRouteTraceHeaders() },
        );
      }

      return NextResponse.json(
        { error: "Failed to create chat session." },
        { status: 500, headers: withRouteTraceHeaders() },
      );
    }

    const session = mapSessionRow(data);
    if (!session) {
      return NextResponse.json(
        { error: "Failed to parse created session." },
        { status: 500, headers: withRouteTraceHeaders() },
      );
    }

    return NextResponse.json(
      { session },
      { status: 201, headers: withRouteTraceHeaders() },
    );
  } catch (error) {
    console.error("[Chat Sessions API] POST failed", error);
    return NextResponse.json(
      { error: "Failed to create chat session." },
      { status: 500, headers: withRouteTraceHeaders() },
    );
  }
}
