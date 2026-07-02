import { createClient } from "@/utils/supabase/server";
import { Badge } from "@/components/ui/badge";
import  UpgradeButton  from "@/components/ui/UpgradeButton"; // Fixed: Using named import

export async function WorkspaceHeader() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) return null;

  // Step 1: Rule 6 - Explicitly fetch the tenant mapping first to guarantee tenant isolation
  const { data: tenantMapping, error: mapError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (mapError || !tenantMapping?.tenant_id) return null;

  // Step 2: Fetch the exact workspace billing state. 
  // Separating this from the join bypasses the TypeScript relation inference error.
  const { data: workspace, error: workspaceError } = await supabase
    .from("tenants")
    .select("name, plan_tier, subscription_status, trial_ends_at")
    .eq("id", tenantMapping.tenant_id)
    .single();

  if (workspaceError || !workspace) return null;

  const isTrial = workspace.plan_tier === "free_trial";
  
  // Calculate remaining trial days safely
  const daysRemaining = workspace.trial_ends_at 
    ? Math.max(0, Math.ceil((new Date(workspace.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <header className="flex items-center justify-between border-b px-6 py-4 bg-background">
      <div className="flex items-center space-x-3">
        <h1 className="text-lg font-semibold">{workspace.name}</h1>
        
        {/* Render Pro Badge if upgraded */}
        {!isTrial && workspace.subscription_status === "active" && (
          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-medium px-2.5 py-0.5">
            Pro Tier ✨
          </Badge>
        )}
      </div>

      {/* Render Trial Warning & Upgrade Action if on Free Trial */}
      {isTrial && (
        <div className="flex items-center space-x-4 bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-lg">
          <div className="text-sm">
            <span className="font-semibold text-amber-600 dark:text-amber-400">Free Trial</span>
            <span className="text-muted-foreground ml-1">
              — {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left
            </span>
          </div>
          <UpgradeButton productId={process.env.NEXT_PUBLIC_PRO_PLAN_ID!} />
        </div>
      )}
    </header>
  );
}