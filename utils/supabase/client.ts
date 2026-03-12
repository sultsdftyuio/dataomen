import { createBrowserClient } from '@supabase/ssr'

// Keep a cached instance of the client
let supabase: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  // If we already have an instance, return it immediately
  if (supabase) return supabase

  // Otherwise, create it once and store it
  supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  return supabase
}