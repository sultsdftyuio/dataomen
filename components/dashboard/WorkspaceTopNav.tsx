import React from "react";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { WorkspacePlanBadge } from "@/components/dashboard/WorkspacePlanBadge";

export async function WorkspaceTopNav() {
  const tenantResult = await resolveTenantContext();

  if ("response" in tenantResult) {
    return null;
  }

  const { supabase, tenantId } = tenantResult.context;
  const entitlements = await getWorkspaceEntitlements(supabase, tenantId);

  return (
    <div className="flex items-center">
      <WorkspacePlanBadge entitlements={entitlements} />
    </div>
  );
}