import { NextResponse } from "next/server";
import { withTenant } from "@/lib/api-security";
import { getWorkspaceEntitlements, PRO_PLAN_REQUIRED_MESSAGE } from "@/lib/entitlements";
import {
  fetchCampaignTargetUsers,
  normalizeAudienceSegment,
} from "@/lib/campaign-targets";

export const runtime = "nodejs";

export const GET = withTenant(async (req, { supabase, tenantId }) => {
  const entitlements = await getWorkspaceEntitlements(supabase as any, tenantId);

  if (!entitlements.canViewCustomerLists) {
    return NextResponse.json(
      { error: PRO_PLAN_REQUIRED_MESSAGE, code: "pro_plan_required" },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const segment = normalizeAudienceSegment(url.searchParams.get("segment"));

  const { users, error } = await fetchCampaignTargetUsers({
    supabase,
    tenantId,
    segment,
  });

  if (error) {
    console.error("[CAMPAIGN_TARGETS] Failed to fetch targets", {
      tenantId,
      segment,
      error,
    });
    return NextResponse.json(
      { error: "Failed to fetch campaign targets" },
      { status: 500 }
    );
  }

  return NextResponse.json({ segment, users });
});
