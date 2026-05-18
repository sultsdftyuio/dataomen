// app/(dashboard)/dashboard/queue/page.tsx
import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import RiskQueueClient from "./risk-queue-client";

export default async function QueuePage() {
  const supabase = await createClient();

  // 1. Secure Authentication Check
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/dashboard/queue");
  }

  // 2. IDOR Fix & Performance Boost
  // We explicitly REMOVE the tenant_id database lookup here.
  // Passing tenant_id down to the client exposes it to query-parameter manipulation.
  // All downstream Next.js API routes will securely resolve the tenant 
  // directly from the server-side Supabase session.

  // 3. Render the interactive client component without the vulnerable prop
  return <RiskQueueClient />;
}