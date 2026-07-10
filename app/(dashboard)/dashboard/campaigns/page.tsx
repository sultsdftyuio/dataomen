// app/(dashboard)/dashboard/campaigns/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { EmailTemplate } from "@/lib/types";
import CampaignsClient from "@/app/(dashboard)/dashboard/campaigns/campaigns-client";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import {
  fetchCampaignTargetUsers,
  normalizeAudienceSegment,
} from "@/lib/campaign-targets";

type EmailTemplateRow = {
  id: string;
  name: string;
  subject: string;
  type: string;
  body_html: string | null;
  body_text: string | null;
  is_active: boolean | null;
};

type WorkspaceSettingsRow = {
  company_name: string | null;
  sender_email: string | null;
};

export const metadata = {
  title: "Campaigns | Arcli",
  description: "Configure automated recovery workflows and email sequences.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams?: Promise<{ audience?: string | string[]; segment?: string | string[] }>;
}) {
  const supabase = await createClient();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialAudienceSegment = normalizeAudienceSegment(
    resolvedSearchParams.audience ?? resolvedSearchParams.segment
  );

  // 1. Secure Deterministic Authentication (Rule 1)
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
  const entitlements = await getWorkspaceEntitlements(supabase as any, tenantId);

  // 3, 4, 5. PARALLEL FETCHING: Fetch independent data concurrently scoped to tenant_id
  const [
    { users: targetUsers, error: targetUsersError },
    { data: templatesData, error: templatesError },
    { data: workspaceData, error: workspaceError }
  ] = await Promise.all([
    // 3. Fetch Campaign Targets (Scoped to Tenant)
    entitlements.canViewCustomerLists
      ? fetchCampaignTargetUsers({
          supabase,
          tenantId,
          segment: initialAudienceSegment,
        })
      : Promise.resolve({ users: [], error: null }),

    // 4. Fetch Email Templates (Scoped to Tenant)
    supabase
      .from("email_templates")
      .select("id, name, subject, type, body_html, body_text, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .returns<EmailTemplateRow[]>(),

    // 5. Fetch Full Workspace Settings for Preview Hydration (Scoped to Tenant)
    supabase
      .from("tenant_settings")
      .select("company_name, sender_email")
      .eq("tenant_id", tenantId)
      .returns<WorkspaceSettingsRow[]>()
      .maybeSingle()
  ]);

  // Observability & Operator Logging (Rule 17)
  if (targetUsersError) {
    console.error("[CampaignsPage] Failed to fetch campaign targets:", {
      tenantId,
      audienceSegment: initialAudienceSegment,
      error: targetUsersError,
    });
  }

  if (templatesError) {
    console.error("[CampaignsPage] Failed to fetch email templates:", { tenantId, error: templatesError });
  }

  if (workspaceError) {
    console.error("[CampaignsPage] Failed to resolve workspace settings:", { tenantId, error: workspaceError });
  }

  // Sanitize & Normalize Recovery Templates
  const emailTemplates: EmailTemplate[] = (templatesData || []).map((row) => ({
    id: row.id,
    name: row.name,
    subject: row.subject,
    type: row.type || "recovery",
    campaign_type: row.type || "recovery",
    body_html: row.body_html,
    body_text: row.body_text,
    is_active: row.is_active ?? true,
  }));

  const initialSenderEmail = workspaceData?.sender_email ?? null;
  const initialCompanyName = workspaceData?.company_name ?? null;
  const initialFullName =
    user.user_metadata?.full_name ?? user.user_metadata?.name ?? null;

  return (
    // Exact canvas background (#FAFAFA) and tight structural padding to frame the dispatch client properly
    <div className="flex flex-col min-h-screen w-full bg-[#FAFAFA] p-6 lg:p-8 animate-in fade-in duration-300 font-sans space-y-12">
      {/* Primary Dispatch Center */}
      <CampaignsClient 
        targetUsers={targetUsers}
        emailTemplates={emailTemplates}
        initialAudienceSegment={initialAudienceSegment}
        initialSenderEmail={initialSenderEmail}
        initialCompanyName={initialCompanyName}
        initialFullName={initialFullName}
        isProTier={entitlements.isPro}
        planTier={entitlements.planTier}
        subscriptionStatus={entitlements.subscriptionStatus}
        restrictionMessage={entitlements.restrictionMessage}
      />
    </div>
  );
}
