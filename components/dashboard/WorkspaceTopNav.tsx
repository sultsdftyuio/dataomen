import React from "react";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { C } from "@/lib/tokens";
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
    <div
      className="ml-2 flex items-center gap-2.5 border-l pl-4"
      style={{ borderColor: C.rule }}
    >
      <span
        className="max-w-[140px] truncate text-xs font-semibold sm:max-w-[200px]"
        style={{ color: C.navy }}
      >
        {workspaceName}
      </span>
      <WorkspacePlanBadge entitlements={entitlements} />
    </div>
  );
}
