import { unstable_noStore as noStore } from "next/cache";
import {
  createEmptyGroupedSessions,
  groupSessionsByRecency,
  mapSessionRow,
  type ChatSessionSummary,
} from "@/lib/chat-history";
import { createClient } from "@/utils/supabase/server";
import { DashboardSidebarClient } from "@/components/dashboard/DashboardSidebarClient";

function normalizeSessions(rows: unknown[] | null): ChatSessionSummary[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map(mapSessionRow)
    .filter((row): row is ChatSessionSummary => Boolean(row));
}

export async function DashboardSidebar() {
  noStore();

  let groupedSessions = createEmptyGroupedSessions();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!authError && user) {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("id,title,agent_id,created_at,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(120);

      if (!error) {
        groupedSessions = groupSessionsByRecency(normalizeSessions(data || []));
      }
    }
  } catch (error) {
    console.error("[Dashboard Sidebar] failed to fetch sessions", error);
  }

  return <DashboardSidebarClient groupedSessions={groupedSessions} />;
}