'use server'

import { redirect } from 'next/navigation'

export async function resetPassword(formData: FormData) {
  const email = formData.get('email')?.toString()

  if (!email) {
    throw new Error('A valid email address is required.')
  }

  try {
    // PHASE 1 INTEGRATION: Route to our Python backend to trigger the reset email
    const apiUrl = process.env.INTERNAL_API_URL || 'http://127.0.0.1:8000'
    
    const response = await fetch(`${apiUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    })

    // Security best practice: We log backend failures internally for debugging, 
    // but we DO NOT expose to the client if the email was actually found or not.
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('FastAPI Forgot Password Error:', errorData)
    }

  } catch (error) {
    // Catching network errors (e.g., FastAPI is down)
    console.error('Forgot password action failed to reach backend:', error)
    throw new Error('Unable to process request at this time. Please try again later.')
  }

  // Always redirect the user back to login with a success parameter
  // so the UI can say "If an account exists, an email has been sent."
  redirect('/login?reset=sent')
}