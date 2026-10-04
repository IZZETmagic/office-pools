// =============================================================
// Password reset — the rules and the words, without the screens
// =============================================================
// The app resets a password with the code in the reset email, not with
// the email's link. A link back into the app needs universal links (none are
// set up) or the `officepools://` scheme, which most mail apps will not make
// tappable and which does nothing on a laptop. The code works wherever the
// email is read. The same email's link serves the web (/auth/confirm).
//
// ⚠ PURE ON PURPOSE — no `react-native`, no supabase client. vitest runs this
// from the repo root, where nothing under `mobile/node_modules` resolves.
// =============================================================

/**
 * Digits in the reset code. ⚠ MIRRORS A DASHBOARD SETTING — Auth → Providers →
 * Email → "Email OTP Length". It is 8 on this project, NOT Supabase's default
 * of 6 (read off a generated token, 2026-10-04). The code box fills and submits
 * at this length, so a box built for 6 would submit a truncated code every time.
 * `scripts/verify-password-reset.ts` fails if the two drift apart.
 */
export const RESET_CODE_LENGTH = 8;

/**
 * Seconds before "Send a new code" comes back. Supabase refuses a second
 * reset email to the same address inside 60 seconds, so offering it sooner
 * would only produce an error.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

/** The one password rule, shared by the reset flow and Change Password. */
export const MIN_PASSWORD_LENGTH = 8;

/** The parts of a Supabase `AuthError` the copy depends on. */
export type ResetError = {
  code?: string;
  status?: number;
  name?: string;
  message?: string;
};

/** Keep digits only, so a pasted `123 456` or `123-456` still works. */
export function normalizeResetCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, RESET_CODE_LENGTH);
}

/** Enough of an email address to be worth sending to. Supabase has the final say. */
export function looksLikeEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

/** The error to show under the new-password fields, or null when it may be saved. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) return 'Passwords do not match.';
  return null;
}

/** What a person reads when a reset step fails. */
export function resetErrorMessage(error: ResetError): string {
  // supabase-js turns a failed or timed-out fetch into a status-0
  // AuthRetryableFetchError; its message ("Failed to fetch") explains nothing.
  if (error.status === 0 || error.name === 'AuthRetryableFetchError') {
    return 'Couldn’t reach SportPool. Check your connection and try again.';
  }
  switch (error.code) {
    // A wrong code and an expired one are the same answer from Supabase.
    case 'otp_expired':
      return 'That code didn’t work. Check it, or send a new one.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many tries. Wait a minute, then try again.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'That doesn’t look like an email address.';
    case 'weak_password':
      return error.message || 'Choose a stronger password.';
  }
  return error.message || 'Something went wrong. Please try again.';
}
