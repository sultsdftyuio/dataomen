import { NextResponse } from "next/server";
import { resolveTenantContext, type TenantContext } from "@/utils/supabase/tenant";

type SecureApiHandler = (
  req: Request,
  context: TenantContext & Record<string, unknown>
) => Promise<NextResponse>;

export function withTenant(handler: SecureApiHandler) {
  return async (req: Request, context: Record<string, unknown> = {}) => {
    const contextResult = await resolveTenantContext();

    if ("response" in contextResult) {
      return contextResult.response;
    }

    const { tenantId, userId, supabase } = contextResult.context;

    return handler(req, {
      ...context,
      supabase,
      tenantId,
      userId,
    });
  };
}
