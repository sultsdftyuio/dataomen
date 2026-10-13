import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'

process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key'

import { GET as authCallback } from '../app/auth/callback/route'
import { describeNewPasswordProblem } from '../lib/auth/password-rules'
import {
  RECOVERY_GRANT_TTL_SECONDS,
  createRecoveryGrant,
  isRecoveryGrantValid,
} from '../lib/auth/recovery-grant'
import proxy from '../proxy'

const USER_ID = '7c1f0a52-6f0e-4d0b-9a55-2f4f6f1f0c11'
const OTHER_USER_ID = '0b9d6a0e-83a4-4b0e-8f39-6f2f5f6f7a22'
const NOW = Date.UTC(2026, 0, 1)

test('accepts a recovery grant only for the user it was issued to', () => {
  const grant = createRecoveryGrant(USER_ID, NOW)

  assert.equal(isRecoveryGrantValid(grant, USER_ID, NOW), true)
  assert.equal(isRecoveryGrantValid(grant, OTHER_USER_ID, NOW), false)
})

test('rejects a recovery grant once it has expired', () => {
  const grant = createRecoveryGrant(USER_ID, NOW)
  const lifetime = RECOVERY_GRANT_TTL_SECONDS * 1000

  assert.equal(isRecoveryGrantValid(grant, USER_ID, NOW + lifetime - 1000), true)
  assert.equal(isRecoveryGrantValid(grant, USER_ID, NOW + lifetime), false)
})

test('rejects missing, malformed and tampered recovery grants', () => {
  const grant = createRecoveryGrant(USER_ID, NOW)
  const [expiresAt, signature] = grant.split('.')
  const extended = `${Number(expiresAt) + 3600}.${signature}`

  assert.equal(isRecoveryGrantValid(undefined, USER_ID, NOW), false)
  assert.equal(isRecoveryGrantValid('', USER_ID, NOW), false)
  assert.equal(isRecoveryGrantValid('not-a-grant', USER_ID, NOW), false)
  assert.equal(isRecoveryGrantValid(`${expiresAt}.`, USER_ID, NOW), false)
  assert.equal(isRecoveryGrantValid(`${grant}.extra`, USER_ID, NOW), false)
  assert.equal(isRecoveryGrantValid(extended, USER_ID, NOW), false)
})

test('describes why a new password cannot be used', () => {
  assert.equal(describeNewPasswordProblem(''), 'Enter a new password')
  assert.match(describeNewPasswordProblem('short') ?? '', /at least 8 characters/)
  assert.match(describeNewPasswordProblem('a'.repeat(73)) ?? '', /72 characters or fewer/)
  assert.equal(describeNewPasswordProblem('correct horse battery'), null)
})

test('sends a rejected reset link to the page that issues a new one', async () => {
  const expired = await authCallback(
    new Request(
      'https://www.arcli.tech/auth/callback?error=access_denied&error_code=otp_expired&next=%2Freset-password',
    ),
  )
  const unlabelled = await authCallback(new Request('https://www.arcli.tech/auth/callback'))

  assert.equal(
    expired.headers.get('location'),
    'https://www.arcli.tech/forgot-password?error=recovery_link_invalid',
  )
  assert.equal(
    unlabelled.headers.get('location'),
    'https://www.arcli.tech/login?error=invalid_auth_callback',
  )
})

test('forwards a rejected email link from the home page to the auth callback', async () => {
  const response = await proxy(
    new NextRequest('https://www.arcli.tech/?error=access_denied&error_code=otp_expired'),
  )
  const location = new URL(response.headers.get('location') ?? '')

  assert.equal(location.pathname, '/auth/callback')
  assert.equal(location.searchParams.get('error_code'), 'otp_expired')
})
