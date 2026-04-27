import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import {
  deriveSessionTitle,
  mapMessageRow,
  mapSessionRow,
  type ChatMessageRecord,
} from "@/lib/chat-history";

export const dynamic = "force-dynamic";

const ROUTE_LAYER = "next-app-router";
const ROUTE_HANDLER = "/api/chat/sessions/[sessionId]/messages";

const withRouteTraceHeaders = (headers: Record<string, string> = {}) => ({
  "X-Route-Layer": ROUTE_LAYER,
  "X-Route-Handler": ROUTE_HANDLER,
  ...headers,
});

const WriteMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().trim().min(1).max(100000),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isPartial: z.boolean().optional().default(false),
});

function isMissingTableError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  if (!candidate) return false;
  if (candidate.code === "42P01") return true;
  return String(candidate.message || "").toLowerCase().includes("does not exist");
}

async function getAuthContext() {
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

async function getOwnedSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
) {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id,title,agent_id,created_at,updated_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { session: null as null, error };
  }

  return { session: mapSessionRow(data), error: null };
}

function normalizeMessages(rows: unknown[] | null): ChatMessageRecord[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapMessageRow).filter((item): item is ChatMessageRecord => Boolean(item));
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;
    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session id." },
        { status: 400, headers: withRouteTraceHeaders() },
      );
    }

    const { supabase, user } = await getAuthContext();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: withRouteTraceHeaders() },
      );
    }

    const { session, error: sessionError } = await getOwnedSession(supabase, user.id, sessionId);
    if (sessionError) {
      if (isMissingTableError(sessionError)) {
        return NextResponse.json(
          { messages: [], storeStatus: "missing_tables" },
          { status: 200, headers: withRouteTraceHeaders() },
        );
      }

      return NextResponse.json(
        { error: "Failed to verify session access." },
        { status: 500, headers: withRouteTraceHeaders() },
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: "Session not found." },
        { status: 404, headers: withRouteTraceHeaders() },
      );
    }

    const { data, error } = await supabase
      .from("chat_messages")
      .select("id,session_id,role,content,metadata,is_partial,created_at,updated_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(1000);

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { messages: [], storeStatus: "missing_tables" },
          { status: 200, headers: withRouteTraceHeaders() },
        );
      }

      return NextResponse.json(
        { error: "Failed to fetch chat messages." },
        { status: 500, headers: withRouteTraceHeaders() },
      );
    }

    return NextResponse.json(
      {
        messages: normalizeMessages(data || []),
        storeStatus: "ok",
      },
      { status: 200, headers: withRouteTraceHeaders() },
    );
  } catch (error) {
    console.error("[Chat Messages API] GET failed", error);
    return NextResponse.json(
      { error: "Failed to fetch chat messages." },
      { status: 500, headers: withRouteTraceHeaders() },
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await context.params;
    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session id." },
        { status: 400, headers: withRouteTraceHeaders() },
      );
    }

    const { supabase, user } = await getAuthContext();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: withRouteTraceHeaders() },
      );
    }

    const { session, error: sessionError } = await getOwnedSession(supabase, user.id, sessionId);
    if (sessionError) {
      if (isMissingTableError(sessionError)) {
        return NextResponse.json(
          { error: "Chat session tables are missing. Create chat_sessions/chat_messages first." },
          { status: 503, headers: withRouteTraceHeaders() },
        );
      }

      return NextResponse.json(
        { error: "Failed to verify session access." },
        { status: 500, headers: withRouteTraceHeaders() },
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: "Session not found." },
        { status: 404, headers: withRouteTraceHeaders() },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = WriteMessageSchema.safeParse(body);
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
      session_id: sessionId,
      role: parsed.data.role,
      content: parsed.data.content,
      metadata: parsed.data.metadata || null,
      is_partial: parsed.data.isPartial,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data, error } = await supabase
      .from("chat_messages")
      .insert(payload)
      .select("id,session_id,role,content,metadata,is_partial,created_at,updated_at")
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: "Chat session tables are missing. Create chat_sessions/chat_messages first." },
          { status: 503, headers: withRouteTraceHeaders() },
        );
      }

      return NextResponse.json(
        { error: "Failed to persist chat message." },
        { status: 500, headers: withRouteTraceHeaders() },
      );
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: nowIso,
    };

    const title = session.title.trim();
    if (parsed.data.role === "user" && (!title || title.toLowerCase() === "new chat")) {
      updatePayload.title = deriveSessionTitle(parsed.data.content);
    }

    const { error: updateError } = await supabase
      .from("chat_sessions")
      .update(updatePayload)
      .eq("id", sessionId)
      .eq("user_id", user.id);

    if (updateError) {
      console.warn("[Chat Messages API] Failed to update session timestamp", updateError);
    }

    const message = mapMessageRow(data);
    if (!message) {
      return NextResponse.json(
        { error: "Failed to parse persisted message." },
        { status: 500, headers: withRouteTraceHeaders() },
      );
    }

    return NextResponse.json(
      { message },
      { status: 201, headers: withRouteTraceHeaders() },
    );
  } catch (error) {
    console.error("[Chat Messages API] POST failed", error);
    return NextResponse.json(
      { error: "Failed to persist chat message." },
      { status: 500, headers: withRouteTraceHeaders() },
    );
  }
}
