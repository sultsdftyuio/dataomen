'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export type ActionState = {
  error?: string;
  success?: boolean;
}

// --- Utilities ---

const isSafeRedirectPath = (value: string): boolean => {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.includes('..')
  )
}

// SECURITY: Prevent PII leakage in server logs
const maskEmail = (email: string) => {
  if (!email || !email.includes('@')) return '[redacted]'
  const [local, domain] = email.split('@')
  return local.length <= 2 ? `***@${domain}` : `${local.slice(0, 2)}***@${domain}`
}

// --- Main Action ---

export async function registerAction(state: ActionState, formData: FormData): Promise<ActionState> {
  const flowId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let shouldRedirect = false
  let redirectPath = '/dashboard'
  
  try {
    // SECURITY: Safe FormData coercion (prevents File object injection)
    const emailField = formData.get('email')
    const passwordField = formData.get('password')
    const nextField = formData.get('next')
    
    const email = typeof emailField === 'string' ? emailField.trim().toLowerCase() : ''
    const password = typeof passwordField === 'string' ? passwordField : ''
    const requestedNext = typeof nextField === 'string' ? nextField : ''

    redirectPath = isSafeRedirectPath(requestedNext) ? requestedNext : '/dashboard'

    if (!email || !password) {
      return { error: 'Email and password are required.' }
    }

    const maskedEmail = maskEmail(email)
    console.log(`[Register][${flowId}] Starting for: ${maskedEmail}`)

    // DATA INTEGRITY: Stronger company name derivation & sanitization
    const rawCompany = email.includes('@') ? email.split('@')[1].split('.')[0] : 'Workspace'
    const fallbackCompany = rawCompany.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'Workspace'
    // Capitalize first letter for a cleaner default name
    const workspaceName = `${fallbackCompany.charAt(0).toUpperCase() + fallbackCompany.slice(1)} Workspace`

    // Initialize Supabase Client
    const supabase = await createClient()

    // 1. SYNCHRONOUS: Create the Auth User
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError || !authData.user) {
      console.error(`[Register][${flowId}] Auth failed:`, authError?.message)
      return { error: authError?.message || 'Failed to create account. Please try again.' }
    }

    const userId = authData.user.id

    // 2. SYNCHRONOUS CORE IDENTITY: Provision the workspace shell
    // This executes the race-safe SQL function directly. Next.js will NOT proceed until this is done.
    console.log(`[Register][${flowId}] Provisioning workspace for user ${userId}...`)
    
    const { data: tenantId, error: rpcError } = await supabase.rpc('provision_initial_workspace', {
      target_user_id: userId,
      default_name: workspaceName,
    })

    if (rpcError) {
      console.error(`[Register][${flowId}] CRITICAL: Workspace provisioning failed:`, rpcError)
      return { error: 'Account created, but workspace setup failed. Please contact support.' }
    }

    console.log(`[Register][${flowId}] Success! Tenant provisioned: ${tenantId}`)

    // 3. (Optional Future Implementation): Async Queue
    // If you need to trigger Stripe customer setup, send an async webhook here, 
    // or trigger an API route using a background job (e.g. Inngest / Upstash / Vercel Functions).

    // CRITICAL FIX: Do not trigger redirect() inside the try/catch block
    shouldRedirect = true

  } catch (error) {
    console.error(`[Register][${flowId}] UNCAUGHT EXCEPTION in registration flow:`, error)
    return { error: 'An unexpected error occurred. Please try again later.' }
  }

  // --- External Redirect ---
  // Next.js redirect throws a specific NEXT_REDIRECT error that MUST NOT be caught by your try/catch
  if (shouldRedirect) {
    redirect(redirectPath)
  }

  return { success: true }
}