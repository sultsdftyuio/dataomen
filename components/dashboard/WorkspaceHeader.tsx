import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { WorkspacePlanBadge } from "@/components/dashboard/WorkspacePlanBadge";

export async function WorkspaceHeader() {
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
    <section className="border-b border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="truncate text-sm font-semibold text-slate-900">
            {workspaceName}
          </h1>
          <WorkspacePlanBadge entitlements={entitlements} />
        </div>
      </div>
    </section>
  );
}