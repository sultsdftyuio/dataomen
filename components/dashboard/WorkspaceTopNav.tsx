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
  const [workspaceResult, entitlements] = await Promise.all([
    supabase
      .from("tenants")
      .select("display_name, name")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    getWorkspaceEntitlements(supabase, tenantId),
  ]);

  const workspaceName =
    workspaceResult.data?.display_name ??
    workspaceResult.data?.name ??
    "Workspace";

  return (
    <div className="flex items-center gap-2.5 border-l border-slate-200 pl-4 ml-2">
      <span className="truncate max-w-[140px] sm:max-w-[200px] text-xs font-semibold text-slate-800">
        {workspaceName}
      </span>
      <WorkspacePlanBadge entitlements={entitlements} />
    </div>
  );
}