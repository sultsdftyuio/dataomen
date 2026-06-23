// app/actions/billing.ts
"use server"

import { createServerClient } from "@/utils/supabase/server";
import { DodoPayments } from "dodopayments";

const dodo = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY,
});

export async function upgradeToProPlan() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data: tenant } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  // Create a checkout session for a recurring SaaS product
  const session = await dodo.checkoutSessions.create({
    product_cart: [{ 
      product_id: process.env.DODO_PRO_PLAN_ID, // e.g., 'prod_123abc'
      quantity: 1 
    }],
    customer: { 
      email: user.email 
    },
    metadata: {
      tenant_id: tenant.tenant_id, // Mandatory for safe async routing
    },
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard?billing=success`,
  });

  return { url: session.checkout_url };
}