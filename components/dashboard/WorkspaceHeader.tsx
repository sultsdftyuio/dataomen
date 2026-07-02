import { createClient } from "@/utils/supabase/server";
import { Badge } from "@/components/ui/badge";
import UpgradeButton from "@/components/ui/UpgradeButton";

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

  // Step 2: Fetch the exact workspace state using strictly typed schema columns
  const { data: workspace, error: workspaceError } = await supabase
    .from("tenants")
    .select("display_name, plan, status, created_at")
    .eq("tenant_id", tenantMapping.tenant_id)
    .single();

  if (workspaceError || !workspace) return null;

  const isTrial = workspace.plan === "free_trial" || workspace.plan === "trial";
  
  // Calculate remaining trial days safely (assuming standard 14-day trial window from created_at)
  const trialDurationDays = 14;
  const createdAtTime = workspace.created_at ? new Date(workspace.created_at).getTime() : Date.now();
  const trialEndsAt = createdAtTime + trialDurationDays * 24 * 60 * 60 * 1000;
  const daysRemaining = Math.max(0, Math.ceil((trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <header className="flex items-center justify-between border-b px-6 py-4 bg-background">
      <div className="flex items-center space-x-3">
        <h1 className="text-lg font-semibold">{workspace.display_name || "Workspace"}</h1>
        
        {/* Render Pro Badge if active subscription */}
        {!isTrial && workspace.status === "active" && (
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
          <UpgradeButton productId={process.env.NEXT_PUBLIC_PRO_PLAN_ID} />
        </div>
      )}
    </header>
  );
}