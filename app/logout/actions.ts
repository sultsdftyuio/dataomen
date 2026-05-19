'use server'

import { createClient } from '@/utils/supabase/server'

export type LogoutActionState = {
  error?: string;
}

export async function logoutAction(): Promise<LogoutActionState> {
  const supabase = await createClient();

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Supabase sign out failed', error);
      return { error: error.message };
    }
  } catch (err) {
    console.error('Critical Auth Failure:', err);
    return { error: 'A secure connection could not be established. Please try again later.' };
  }

  return {};
}
