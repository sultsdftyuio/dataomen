'use server'

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import type { Database } from '@/types/supabase'

export type ActionState = {
  error?: string
  success?: boolean
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isDev = process.env.NODE_ENV !== 'production'

const getRequiredEnv = (name: string) => {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

const isSafeRedirectPath = (value: string): boolean => {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.includes('..')
  )
}

const maskEmail = (email: string) => {
  if (!email || !email.includes('@')) return '[redacted]'

  const [local, domain] = email.split('@')
  return local.length <= 2 ? `***@${domain}` : `${local.slice(0, 2)}***@${domain}`
}

const normalizeFormString = (formData: FormData, key: string) => {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

const deriveWorkspaceName = (email: string) => {
  const domainPart = email.includes('@') ? email.split('@')[1]?.split('.')[0] : ''
  const source = domainPart || email.split('@')[0] || 'Workspace'
  const cleaned = source.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'Workspace'

  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)} Workspace`
}

const createProvisioningClient = () => {
  return createSupabaseAdminClient<Database>(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: {
          'x-client-info': 'arcli-registration-provisioning',
        },
      },
    }
  )
}

export async function registerAction(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  const flowId = `register-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
  let redirectPath = '/dashboard'
  let shouldRedirect = false

  try {
    const email = normalizeFormString(formData, 'email').trim().toLowerCase()
    const password = normalizeFormString(formData, 'password')
    const requestedNext = normalizeFormString(formData, 'next')

    redirectPath = isSafeRedirectPath(requestedNext) ? requestedNext : '/dashboard'

    if (isDev) {
      console.log(`[REGISTER][${flowId}] Starting signup for ${maskEmail(email)}`)
    }

    if (!email || !password) {
      return { error: 'Email and password are required.' }
    }

    if (!EMAIL_PATTERN.test(email)) {
      return { error: 'Please enter a valid email address.' }
    }

    if (password.length < 8) {
      return { error: 'Password must be at least 8 characters long.' }
    }

    const workspaceName = deriveWorkspaceName(email)
    const fullName = email.split('@')[0] || 'User'
    const supabase = await createClient()
    const provisioningClient = createProvisioningClient()

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          company_name: workspaceName,
          full_name: fullName,
          workspace_name: workspaceName,
        },
      },
    })

    if (authError) {
      console.warn(`[REGISTER][${flowId}] Supabase signup rejected`, {
        code: authError.code,
        status: authError.status,
        message: authError.message,
      })

      return { error: authError.message || 'Failed to create account. Please try again.' }
    }

    const user = authData.user

    if (!user?.id) {
      console.error(`[REGISTER][${flowId}] Supabase signup returned no user id`)
      return { error: 'Account creation did not return a valid user. Please try again.' }
    }

    const returnedEmail = user.email?.trim().toLowerCase()
    if (returnedEmail && returnedEmail !== email) {
      console.error(`[REGISTER][${flowId}] Signup identity mismatch`, {
        requestedEmail: maskEmail(email),
        returnedEmail: maskEmail(returnedEmail),
        userId: user.id,
      })

      return { error: 'Account identity verification failed. Please try again.' }
    }

    const { data: tenantId, error: provisionError } = await provisioningClient.rpc(
      'provision_initial_workspace',
      {
        target_user_id: user.id,
        default_name: workspaceName,
      }
    )

    if (provisionError || !tenantId) {
      console.error(`[REGISTER][${flowId}] Workspace provisioning failed`, {
        userId: user.id,
        error: provisionError,
      })

      return {
        error:
          'Account created, but workspace setup failed. Please contact support before continuing.',
      }
    }

    if (isDev) {
      console.log(`[REGISTER][${flowId}] Provisioned tenant ${String(tenantId)} for user ${user.id}`)
    }

    shouldRedirect = true
  } catch (error) {
    console.error(`[REGISTER][${flowId}] Unhandled registration failure`, error)
    return { error: 'An unexpected error occurred. Please try again later.' }
  }

  if (shouldRedirect) {
    redirect(redirectPath)
  }

  return { success: true }
}
