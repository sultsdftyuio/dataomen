import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { getSupabaseCookieOptions } from "./cookie-options";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

export async function createClient(cookieStore?: CookieStore) {
  const resolvedCookieStore = cookieStore ?? (await cookies());

  return createServerClient<Database>(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookieOptions: getSupabaseCookieOptions(),
      cookies: {
        getAll() {
          return resolvedCookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              resolvedCookieStore.set(name, value, options);
            });
          } catch (error) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "[SUPABASE-SSR] Skipped setting cookies because this context does not allow cookie mutation.",
                error instanceof Error ? error.message : error
              );
            }
          }
        },
      },
      global: {
        headers: {
          "x-client-info": "arcli-nextjs-server-per-request",
        },
      },
    }
  );
}

export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          "x-client-info": "arcli-nextjs-service-role",
        },
      },
    }
  );
}
