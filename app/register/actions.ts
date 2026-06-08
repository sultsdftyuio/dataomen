'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export type ActionState = {
  error?: string;
  success?: boolean;
}

// 1. Gate verbose logs behind development environment
const isDev = process.env.NODE_ENV !== 'production';

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
  const flowId = `register-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  let shouldRedirect = false
  let redirectPath = '/dashboard'
  
  try {
    if (isDev) console.log(`[DEBUG-UI][${flowId}] === Starting Registration Flow ===`);

    // SECURITY: Safe FormData coercion (prevents File object injection)
    const emailField = formData.get('email')
    const passwordField = formData.get('password')
    const nextField = formData.get('next')
    
    const rawEmail = typeof emailField === 'string' ? emailField : ''
    const password = typeof passwordField === 'string' ? passwordField : ''
    const requestedNext = typeof nextField === 'string' ? nextField : ''

    const email = rawEmail.trim().toLowerCase()
    redirectPath = isSafeRedirectPath(requestedNext) ? requestedNext : '/dashboard'

    if (isDev) console.log(`[DEBUG-UI][${flowId}] Parsed inputs. Email: "${maskEmail(email)}", NextPath: "${redirectPath}"`);

    // 2. Pre-flight Validation (Lightweight Regex + Length Checks)
    if (!email || !password) {
      if (isDev) console.log(`[DEBUG-UI][${flowId}] Failed validation: Missing fields.`);
      return { error: 'Email and password are required.' }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      if (isDev) console.log(`[DEBUG-UI][${flowId}] Failed validation: Malformed email.`);
      return { error: 'Please enter a valid email address.' };
    }

    if (password.length < 8) {
      if (isDev) console.log(`[DEBUG-UI][${flowId}] Failed validation: Password too short.`);
      return { error: 'Password must be at least 8 characters long.' };
    }

    // DATA INTEGRITY: Stronger company name derivation & sanitization
    const rawCompany = email.includes('@') ? email.split('@')[1].split('.')[0] : 'Workspace'
    const fallbackCompany = rawCompany.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'Workspace'
    // Capitalize first letter for a cleaner default name
    const workspaceName = `${fallbackCompany.charAt(0).toUpperCase() + fallbackCompany.slice(1)} Workspace`

    if (isDev) console.log(`[DEBUG-UI][${flowId}] Attempting Supabase registration...`);

    // Initialize Supabase Client
    const supabase = await createClient()

    // 3. SYNCHRONOUS: Create the Auth User
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError || !authData.user) {
      console.warn(`[DEBUG-UI][${flowId}] Auth registration rejected: ${authError?.message}`);
      return { error: authError?.message || 'Failed to create account. Please try again.' }
    }

    const userId = authData.user.id

    if (isDev) console.log(`[DEBUG-UI][${flowId}] Auth SUCCESS for user_id=${userId}. Provisioning workspace...`);

    // 4. SYNCHRONOUS CORE IDENTITY: Provision the workspace shell
    // This executes the race-safe SQL function directly. Next.js will NOT proceed until this is done.
    const { error: rpcError } = await supabase.rpc('provision_initial_workspace', {
      target_user_id: userId,
      default_name: workspaceName,
    })

    if (rpcError) {
      console.error(`[DEBUG-UI][${flowId}] CRITICAL: Workspace provisioning failed:`, rpcError)
      // Architecture Rule 1 Enforcement: A user must NEVER reach /dashboard without a committed workspace.
      // We return an error and halt execution here so shouldRedirect remains false.
      return { error: 'Account created, but workspace setup failed. Please contact support or try logging in.' }
    }

    if (isDev) console.log(`[DEBUG-UI][${flowId}] Success! Tenant provisioned.`);

    // CRITICAL FIX: Do not trigger redirect() inside the try/catch block
    shouldRedirect = true

  } catch (error) {
    console.error(`[DEBUG-UI][${flowId}] UNCAUGHT EXCEPTION in registration flow:`, error)
    return { error: 'An unexpected error occurred. Please try again later.' }
  }

  // --- External Redirect ---
  // Next.js redirect throws a specific NEXT_REDIRECT error that MUST NOT be caught by your try/catch
  if (shouldRedirect) {
    redirect(redirectPath)
  }

  return { success: true }
}