import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

const getRequiredEnv = (name: string) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

/**
 * Creates a Supabase SSR client for the current Next.js request.
 *
 * Never hoist this client to module scope. The cookie store is request-bound,
 * so every Server Component, Server Action, and Route Handler must call this
 * function inside its own request lifecycle.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "[SUPABASE-SSR] Cookie persistence skipped outside a mutable request context.",
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
