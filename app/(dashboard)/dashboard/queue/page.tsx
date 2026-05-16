// app/(dashboard)/dashboard/queue/page.tsx
import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import RiskQueueClient from "./risk-queue-client";

export default async function QueuePage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?next=/dashboard/queue");
  }

  // 1. Fetch the data explicitly from the database mapping
  const { data: tenantData, error: tenantError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const tenant = tenantData as { tenant_id: string } | null;

  // 2. The Open-Access Fallback (Implicit Isolation)
  // We explicitly REMOVE the email domain fallback to prevent data mixing.
  // We default to the user's ID as their isolated workspace.
  const tenantId = tenant?.tenant_id || user.id;

  if (tenantError && !tenant?.tenant_id) {
    console.info("New user sign-up detected. Provisioning implicit workspace for Queue.", {
      userId: user.id,
      assignedTenantId: tenantId
    });
  }

  // Pass the securely fetched tenantId down to the interactive Client Component
  return <RiskQueueClient tenantId={tenantId} />;
}