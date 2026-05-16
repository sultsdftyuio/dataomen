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

  // Tenant Resolution Logic
  const deriveTenantId = () => {
    const appTenant = user.app_metadata?.tenant_id;
    if (typeof appTenant === "string" && appTenant.trim()) return appTenant;
    const userTenant = user.user_metadata?.tenant_id;
    if (typeof userTenant === "string" && userTenant.trim()) return userTenant;
    const emailDomain = user.email?.split("@")[1];
    if (emailDomain) return emailDomain;
    return user.id;
  };

  const { data: tenantData, error: tenantError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const tenant = tenantData as { tenant_id: string } | null;
  const fallbackTenantId = deriveTenantId();

  if (tenantError && !tenant?.tenant_id) {
    console.warn("tenant lookup failed on queue page", { userId: user.id });
  }

  const tenantId = tenant?.tenant_id || fallbackTenantId;

  // Pass the securely fetched tenantId down to the interactive Client Component
  return <RiskQueueClient tenantId={tenantId} />;
}