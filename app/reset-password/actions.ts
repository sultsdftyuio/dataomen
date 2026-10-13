'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { describeNewPasswordProblem } from '@/lib/auth/password-rules'
import {
  RECOVERY_GRANT_COOKIE,
  isRecoveryGrantValid,
  recoveryGrantCookieOptions,
} from '@/lib/auth/recovery-grant'
import { RECOVERY_LINK_INVALID_PATH } from '@/utils/auth-redirects'
import { createClient } from '@/utils/supabase/server'

export type ResetPasswordState = {
  error?: string
}

const describeUpdateFailure = (error: { code?: string; message: string }) => {
  if (error.code === 'same_password') {
    return 'New password must be different from your current password'
  }

  // The project's own password policy; Supabase's message lists what is missing.
  if (error.code === 'weak_password') {
    return error.message
  }

  return 'Your password could not be updated. Try again, or request a new reset link.'
}

/**
 * Sets a new password for a user who arrived through a verified reset link.
 */
export async function updatePassword(
  _state: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const passwordField = formData.get('password')
  const password = typeof passwordField === 'string' ? passwordField : ''

  const problem = describeNewPasswordProblem(password)
  if (problem) return { error: problem }

  let linkStillValid = true

  try {
    const cookieStore = await cookies()
    const supabase = await createClient(cookieStore)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !isRecoveryGrantValid(cookieStore.get(RECOVERY_GRANT_COOKIE)?.value, user.id)) {
      linkStillValid = false
    } else {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        console.warn('[RESET_PASSWORD] Password update rejected', {
          code: error.code,
          status: error.status,
        })
        return { error: describeUpdateFailure(error) }
      }

      cookieStore.delete({ name: RECOVERY_GRANT_COOKIE, path: recoveryGrantCookieOptions().path })

      // End every session, this one included: whoever prompted the reset may
      // still be signed in elsewhere, and logging in again confirms the new
      // password works. The password is already changed, so a failure here
      // must not be reported as a failed reset.
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
      if (signOutError) {
        console.error('[RESET_PASSWORD] Could not end existing sessions', {
          code: signOutError.code,
          status: signOutError.status,
        })
      }
    }
  } catch (error) {
    console.error('[RESET_PASSWORD] Password update threw', error)
    return { error: 'Your password could not be updated. Check your connection and try again.' }
  }

  // redirect() works by throwing, so it stays outside the try/catch.
  redirect(linkStillValid ? '/login?reset=done' : RECOVERY_LINK_INVALID_PATH)
}
