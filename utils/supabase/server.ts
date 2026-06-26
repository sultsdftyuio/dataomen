/** * ARCLI.TECH - Supabase Server Client
 * Strategy: Secure SSR Authentication & Data Access
 * Purpose: Provides a highly typed, context-aware Supabase instance for Server Components and Server Actions.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

export async function createClient() {
  // 1. Explicit environment variable validation to prevent ambiguous runtime crashes
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set."
    );
  }

  // Next.js 15+ requires awaiting the cookies API
  const cookieStore = await cookies();

  return createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // 2. Targeted logging instead of a completely silent catch block
            // This safely ignores Server Component mutation issues in production, 
            // but warns you in development in case of real cookie/framework failures.
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "[SUPABASE-SSR] Cookie persistence skipped. This is expected if called from a Server Component, but ensure middleware is refreshing sessions.",
                error instanceof Error ? error.message : error
              );
            }
          }
        },
      },
      // 3. Enterprise Improvement: Added global headers for observability
      global: {
        headers: {
          "x-client-info": "nextjs-app-router", // Helpful for tracing auth issues in Supabase logs
        },
      },
    }
  );
}