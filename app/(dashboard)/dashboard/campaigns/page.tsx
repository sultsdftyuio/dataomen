// app/(dashboard)/dashboard/campaigns/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { RiskUser, EmailTemplate } from "@/lib/types";
import CampaignsClient from "@/app/(dashboard)/dashboard/campaigns/campaigns-client";

export const metadata = {
  title: "Campaigns | Arcli",
  description: "Configure automated recovery workflows and email sequences.",
};

export default async function CampaignsPage() {
  const supabase = await createClient();

  // 1. Secure Deterministic Authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login?next=/dashboard/campaigns");
  }

  // 2. IDOR Prevention & Clean SaaS Boundary (Tenant Resolution)
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .returns<{ tenant_id: string; role: string }[]>()
    .single();

  if (membershipError || !membership) {
    redirect("/unauthorized");
  }

  const tenantId = membership.tenant_id;

  // 3. Fetch At-Risk Users (Scoped to Tenant)
  const { data: riskData, error: riskError } = await supabase
    .from("vw_risk_queue_radar")
    .select(`
      customer_id,
      customer_email,
      risk_score,
      signal,
      last_active
    `)
    .eq("tenant_id", tenantId)
    .gte("risk_score", 70) 
    .order("risk_score", { ascending: false })
    .limit(100)
    .returns<{ 
      customer_id: string; 
      customer_email: string; 
      risk_score: number; 
      signal: string; 
      last_active: string | null 
    }[]>();

  if (riskError) {
    console.error("Failed to fetch risk users for campaigns:", riskError);
  }

  const atRiskUsers: RiskUser[] = (riskData || []).map((row) => ({
    id: row.customer_id || "", 
    email: row.customer_email || "Unknown Email",
    riskScore: row.risk_score || 0,
    signal: row.signal || "High Risk Detected",
    lastActive: row.last_active ? new Date(row.last_active).toLocaleDateString() : "Recently",
  }));

  // 4. Fetch Email Templates (Scoped to Tenant)
  const { data: templatesData, error: templatesError } = await supabase
    .from("email_templates")
    .select("id, name, subject, type")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .returns<{ id: string; name: string; subject: string; type: string }[]>();

  if (templatesError) {
    console.error("Failed to fetch email templates:", templatesError);
  }

  const emailTemplates: EmailTemplate[] = (templatesData || []).map((row) => ({
    id: row.id,
    name: row.name,
    subject: row.subject,
    type: row.type || "recovery",
  }));

  // 5. Fetch Sender Email (Scoped to Tenant)
  const { data: workspaceData } = await supabase
    .from("workspace_settings")
    .select("sender_email")
    .eq("tenant_id", tenantId)
    .returns<{ sender_email: string | null }[]>()
    .single();

  const initialSenderEmail = workspaceData?.sender_email ?? null;

  return (
    // AESTHETIC UPGRADE: Added the exact canvas background (#FAFAFA) and tight 
    // structural padding (p-6 lg:p-8) to frame the client component perfectly.
    <div className="flex flex-col min-h-screen w-full bg-[#FAFAFA] p-6 lg:p-8 animate-in fade-in duration-300 font-sans">
      <CampaignsClient 
        atRiskUsers={atRiskUsers} 
        emailTemplates={emailTemplates}
        initialSenderEmail={initialSenderEmail}
      />
    </div>
  );
}