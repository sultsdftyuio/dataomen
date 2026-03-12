'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export type ActionState = {
  error?: string;
  success?: boolean;
}

export async function loginAction(state: ActionState, formData: FormData): Promise<ActionState> {
  const cookieStore = await cookies()
  
  // Initialize the Supabase SSR client for secure cookie management
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { 
            // Handle server component cookie limits gracefully
          }
        },
      },
    }
  )

  const email = formData.get('email')?.toString() || ''
  const password = formData.get('password')?.toString() || ''

  // Authenticate with Supabase
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  // Return the error state to the client component if authentication fails
  if (error) {
    return { error: error.message }
  }

  // Next.js redirect throws an error internally to halt execution and route the client.
  // It must be placed outside of try/catch blocks (or re-thrown) and will successfully
  // push the user to your internal dashboard area after cookies are set.
  redirect('/dashboard')
}