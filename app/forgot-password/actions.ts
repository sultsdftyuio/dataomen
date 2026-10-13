'use server'

import { createClient } from '@/utils/supabase/server'
import { PASSWORD_RESET_PATH } from '@/utils/auth-redirects'

export type ForgotPasswordState = {
  error?: string
  /** What the user typed, so a failed attempt does not clear the field. */
  email?: string
  /** Set once a request was accepted; the page then shows the confirmation. */
  sentTo?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const resolveSiteUrl = () => {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    'http://localhost:3000'

  const normalized = url.endsWith('/') ? url.slice(0, -1) : url
  return normalized.startsWith('http') ? normalized : `https://${normalized}`
}

/**
 * Emails a password-reset link.
 *
 * The answer is the same whether or not an account exists for the address, so
 * this form cannot be used to find out who has an Arcli account.
 */
export async function requestPasswordReset(
  _state: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const emailField = formData.get('email')
  const email = (typeof emailField === 'string' ? emailField : '').trim().toLowerCase()

  if (!email) {
    return { error: 'Enter your work email' }
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: 'Work email must include an @ and a domain, like name@company.com', email }
  }

  try {
    const supabase = await createClient()

    // `next` only labels the link as a password reset so a failed link can be
    // explained properly. Permission to set a password comes from the callback
    // verifying the link, never from this parameter.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${resolveSiteUrl()}/auth/callback?next=${encodeURIComponent(PASSWORD_RESET_PATH)}`,
    })

    if (error) {
      // Supabase only rate-limits addresses that have an account, so showing
      // this differently would reveal that the account exists.
      if (error.status === 429) {
        console.warn('[FORGOT_PASSWORD] Reset email rate limited', { code: error.code })
        return { sentTo: email }
      }

      console.error('[FORGOT_PASSWORD] Reset email request failed', {
        code: error.code,
        status: error.status,
      })
      return { error: 'The reset email could not be sent. Try again in a few minutes.', email }
    }
  } catch (error) {
    console.error('[FORGOT_PASSWORD] Reset email request threw', error)
    return { error: 'The reset email could not be sent. Check your connection and try again.', email }
  }

  return { sentTo: email }
}
