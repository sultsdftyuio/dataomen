import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // createBrowserClient automatically reads the cookies set by your server actions
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}