import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import UpgradeButton from "@/components/ui/UpgradeButton";
import { getWorkspaceEntitlements } from "@/lib/entitlements";
import { resolveTenantContext } from "@/utils/supabase/tenant";

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
  const isPro = entitlements.isPro;
  const isTrial = entitlements.isTrialing;
  const isPastDue =
    entitlements.planTier === "pro" &&
    entitlements.subscriptionStatus === "past_due";
  const badgeClassName = isPro
    ? isTrial
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700"
    : isPastDue
      ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-slate-200 bg-slate-100 text-slate-700";
  const statusText = isTrial ? "3-day Pro Trial" : entitlements.billingLabel;

  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-slate-900">
              {workspaceName}
            </h1>
            <Badge variant="outline" className={badgeClassName}>
              {statusText}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {entitlements.billingDescription}
          </p>
        </div>

        {!isPro && !isPastDue && (
          <div className="shrink-0">
            <UpgradeButton className="bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-600" />
          </div>
        )}

        {isPastDue && (
          <Link
            href="/settings"
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
          >
            Update Billing
          </Link>
        )}
      </div>
    </section>
  );
}
