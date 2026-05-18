// app/(dashboard)/dashboard/campaigns/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import CampaignsClient from "./campaigns-client";

export const metadata = {
  title: "Campaigns | Arcli",
  description: "Configure automated recovery workflows and email sequences.",
};

export default async function CampaignsPage() {
  // 1. Secure Deterministic Authentication
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login?next=/dashboard/campaigns");
  }

  // 2. IDOR Prevention & Clean SaaS Boundary
  // Like the Risk Queue, we do NOT pass the tenant_id as a prop.
  // The CampaignsClient will handle its own interactions via secure API routes.

  return (
    <div className="flex flex-col h-full w-full animate-in fade-in duration-300">
      <CampaignsClient />
    </div>
  );
}