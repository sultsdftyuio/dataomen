import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

// 1. Robust URL resolution with strict HTTPS enforcement and validation
export const getURL = (): string => {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ?? 
    process.env.NEXT_PUBLIC_VERCEL_URL ?? 
    "http://localhost:3000";

  // Ensure scheme exists
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  // Force HTTPS in production, even if misconfigured
  if (process.env.NODE_ENV === "production" && url.startsWith("http://")) {
    url = url.replace("http://", "https://");
  }

  // Normalize by removing trailing slashes
  url = url.endsWith("/") ? url.slice(0, -1) : url;

  // Validate to prevent redirect poisoning or hidden structural bugs
  try {
    new URL(url);
  } catch (error) {
    throw new Error(`Invalid Supabase redirect URL configuration: ${url}`);
  }

  return url;
};

// 2. Singleton pattern to prevent duplicate listeners and multiple instances in React
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 3. Strict environment validation instead of dangerous fake placeholder clients
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set."
    );
  }

  // Allows @supabase/ssr to manage auth cookie synchronization 
  // using the recommended Next.js App Router integration.
  browserClient = createBrowserClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        headers: {
          "x-client-info": "nextjs-app-router-browser",
        },
      },
    }
  );

  return browserClient;
}