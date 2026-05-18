// app/(dashboard)/dashboard/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import RecoveryOverview from "./RecoveryOverview";

export default async function DashboardPage() {
  const supabase = await createClient();

  // 1. Secure Authentication Check
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/dashboard");
  }

  // 2. IDOR Fix & Performance Boost
  // We explicitly REMOVE the tenant_id database lookup here.
  // Passing tenant_id down to the client exposes it to query-parameter manipulation.
  // All downstream Next.js API routes will securely resolve the tenant 
  // directly from the server-side Supabase session.

  // 3. Render the deterministic dashboard
  return <RecoveryOverview />;
}