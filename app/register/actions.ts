'use server'

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '')

export type ActionState = {
  error?: string;
  success?: boolean;
}

export async function registerAction(state: ActionState, formData: FormData): Promise<ActionState> {
  // Strictly parse form values to string, defaulting to empty string if null
  const email = formData.get('email')?.toString() || ''
  const password = formData.get('password')?.toString() || ''
  const fullName = formData.get('name')?.toString() || ''
  const companyName = formData.get('company')?.toString() || ''

  try {
    const res = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        company_name: companyName,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: data?.detail || 'Registration failed' }
    }

    return { success: true }
  } catch (error) {
    console.error('Registration error:', error)
    return { error: 'Could not connect to the registration server.' }
  }
}