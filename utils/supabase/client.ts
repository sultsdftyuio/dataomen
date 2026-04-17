// utils/supabase/client.ts

import { createBrowserClient } from '@supabase/ssr'

/**
 * Utility to resolve the absolute site URL for OAuth redirects.
 * Prioritizes the custom production domain for consistency.
 */
export const getURL = () => {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ?? // Set this to https://arcli.tech in Vercel
    process.env.NEXT_PUBLIC_VERCEL_URL ?? // Automatically set by Vercel
    'http://localhost:3000'
  
  // Ensure trailing slash is removed for clean redirection
  url = url.charAt(url.length - 1) === '/' ? url.slice(0, -1) : url
  
  // Security by Design: Always ensure https in production environments
  return url.includes('http') ? url : `https://${url}`
}

/**
 * High-performance Supabase browser client.
 * Uses Supabase native singleton mode to resolve "Multiple GoTrueClient instances" errors.
 * Uses 100% Functional pattern for usage within React hooks.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase Initialization Error: Missing Environment Variables");
    throw new Error(
      "Supabase Environment Variables are missing. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set."
    )
  }

  // Use native singleton handling from Supabase to prevent multiple GoTrue instances.
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    isSingleton: true,
  })
}

/**
 * Example usage for Google Login (Security by Design):
 * * const supabase = createClient();
 * await supabase.auth.signInWithOAuth({
 * provider: 'google',
 * options: {
 * redirectTo: `${getURL()}/auth/callback`,
 * queryParams: {
 * access_type: 'offline',
 * prompt: 'consent',
 * },
 * },
 * });
 */