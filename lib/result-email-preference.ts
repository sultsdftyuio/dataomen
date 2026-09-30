export const RESULT_EMAIL_NOTICE_VERSION = "result-emails-v1";

type SavedResultEmailPreference = {
  enabled: boolean;
  opted_in_at: string | null;
  opted_in_email: string | null;
  notice_version: string | null;
} | null;

/** An old default-on row is not evidence of a deliberate opt-in. */
export function resultEmailsEnabled(
  preference: SavedResultEmailPreference,
  accountEmail: string | null | undefined,
): boolean {
  const normalizedEmail = accountEmail?.trim().toLowerCase();
  return Boolean(
    preference?.enabled &&
      preference.opted_in_at &&
      normalizedEmail &&
      preference.opted_in_email?.trim().toLowerCase() === normalizedEmail &&
      preference.notice_version === RESULT_EMAIL_NOTICE_VERSION,
  );
}
