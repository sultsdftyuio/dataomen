import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { resolveTenantContext } from "@/utils/supabase/tenant";
import { buildSettingsSnapshot } from "@/lib/settings/normalizers";
import { fetchTenantSettingsRow } from "@/lib/settings/server";
import SettingsClient from "./settings-client";
import {
  fetchServiceProfile,
  fetchTenantWebsiteUrl,
} from "@/app/(dashboard)/dashboard/data";
import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SettingsPageProps = {
  searchParams: Promise<{ upgrade?: string | string[] }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  const shouldAutoStartProCheckout =
    (Array.isArray(resolvedSearchParams.upgrade)
      ? resolvedSearchParams.upgrade[0]
      : resolvedSearchParams.upgrade) === "pro";
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const tenantResult = await resolveTenantContext();
  let settings = buildSettingsSnapshot(null);
  let serviceProfile: ServiceProfileView | null = null;

  if (!("response" in tenantResult)) {
    const { supabase: tenantSupabase, tenantId } = tenantResult.context;
    const [settingsResult, websiteUrl] = await Promise.all([
      fetchTenantSettingsRow(tenantSupabase, tenantId),
      fetchTenantWebsiteUrl(tenantSupabase, tenantId),
    ]);

    if (settingsResult.error) {
      console.error("[SETTINGS_FETCH_ERROR]", settingsResult.error);
    } else {
      settings = buildSettingsSnapshot(settingsResult.data as never, null);
    }

    serviceProfile = await fetchServiceProfile(
      tenantSupabase,
      tenantId,
      websiteUrl ?? settings.workspace.websiteUrl,
    );
  }

  return (
    <SettingsClient
      user={user}
      initialSettings={settings}
      serviceProfile={serviceProfile}
      autoStartProCheckout={shouldAutoStartProCheckout}
    />
  );
}
