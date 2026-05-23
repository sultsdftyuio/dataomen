import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createClient } from "@/utils/supabase/server";

type TenantContext = {
  supabase: SupabaseClient<Database>;
  tenantId: string;
  userId: string;
};

type TenantContextResult =
  | { context: TenantContext }
  | { response: NextResponse };

const unauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function resolveTenantContext(): Promise<TenantContextResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return { response: unauthorizedResponse() };
  }

  const userId = data.user.id;

  const { data: mapping, error: mappingError } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (mappingError) {
    return {
      response: NextResponse.json(
        { error: "Tenant resolution failed" },
        { status: 500 }
      ),
    };
  }

  const tenantId = mapping?.tenant_id ? String(mapping.tenant_id) : userId;

  return {
    context: {
      supabase,
      tenantId,
      userId,
    },
  };
}
