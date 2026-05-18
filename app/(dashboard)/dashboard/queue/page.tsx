// app/(dashboard)/dashboard/queue/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import RiskQueueClient from "./risk-queue-client";

export const metadata = {
  title: "Risk Queue | Arcli",
  description: "Triage and manage accounts flagged with high churn probability.",
};

export default async function QueuePage() {
  // 1. Secure Deterministic Authentication
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login?next=/dashboard/queue");
  }

  // 2. IDOR Prevention & Clean SaaS Boundary
  // We deliberately do NOT fetch or pass the tenant_id as a prop.
  // Passing tenant_id to the client exposes it to React DevTools and query-parameter manipulation.
  // All downstream data fetching in RiskQueueClient must hit Next.js API routes 
  // that securely resolve the tenant using `resolveTenantContext()`.

  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-300">
      <RiskQueueClient />
    </div>
  );
}