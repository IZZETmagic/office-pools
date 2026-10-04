// =============================================================
// Password reset — the rules and the words, without the screens
// =============================================================
// A reset is a 6-digit code from the reset email, typed into the app or the
// website — one flow for both (Ryan, 2026-10-04). The email has no link: a link
// can't open the app (no universal links), and a mail scanner that "clicks"
// links can spend one before the person does, which it can't do to a code.
//
// ⚠ MIRRORED, NOT SHARED, AT lib/passwordReset.ts. The website can't import from
// `mobile/` (it is in .vercelignore), so the web keeps a copy and
// lib/__tests__/passwordResetParity.test.ts fails if the two ever disagree.
// Change both.
//
// ⚠ PURE ON PURPOSE — no `react-native`, no supabase client. vitest runs this
// from the repo root, where nothing under `mobile/node_modules` resolves.
// =============================================================

/**
 * Digits in the reset code. ⚠ MIRRORS A DASHBOARD SETTING — Authentication →
 * Sign In / Providers → Email → "Email OTP Length", set to 6 on 2026-10-04 (it
 * had been 8). The code box fills and submits at this length, and the email
 * template splits the code at its half, so all three must agree.
 * `scripts/verify-password-reset.ts` fails if the setting drifts from this.
 */
export const RESET_CODE_LENGTH = 6;

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

/**
 * Show a code the way the email prints it: `123-456`. The dash appears with the
 * fourth digit, so backspacing never strands one on its own.
 */
export function formatResetCode(input: string): string {
  const digits = normalizeResetCode(input);
  const half = RESET_CODE_LENGTH / 2;
  return digits.length > half ? `${digits.slice(0, half)}-${digits.slice(half)}` : digits;
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
