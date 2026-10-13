export const PASSWORD_MIN_LENGTH = 8;

// Supabase hashes with bcrypt, which ignores everything past 72 bytes.
export const PASSWORD_MAX_BYTES = 72;

/** Returns the message to show for an unusable new password, or null. */
export const describeNewPasswordProblem = (password: string): string | null => {
  if (!password) return "Enter a new password";

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `New password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }

  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `New password must be ${PASSWORD_MAX_BYTES} characters or fewer`;
  }

  return null;
};
