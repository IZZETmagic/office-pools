// =============================================================
// Password reset — the website's copy of the app's rules
// =============================================================
// A reset is a 6-digit code from the reset email, typed into the website or the
// app — one flow for both (Ryan, 2026-10-04). See mobile/lib/passwordReset.ts
// for why there is no link.
//
// ⚠ A MIRROR OF mobile/lib/passwordReset.ts, NOT AN IMPORT: `mobile/` is in
// .vercelignore, so a production import from it breaks the Vercel build.
// lib/__tests__/passwordResetParity.test.ts runs both against the same inputs
// and fails if they ever answer differently. Change both.
// =============================================================

/**
 * Digits in the reset code. ⚠ MIRRORS A DASHBOARD SETTING — Authentication →
 * Sign In / Providers → Email → "Email OTP Length" (6, set 2026-10-04). The
 * email template splits the code at its half (lib/email/supabaseAuthTemplates.ts).
 */
export const RESET_CODE_LENGTH = 6

/** Supabase refuses a second reset email to one address inside 60 seconds. */
export const RESEND_COOLDOWN_SECONDS = 60

/** The parts of a Supabase `AuthError` the copy depends on. */
export type ResetError = {
  code?: string
  status?: number
  name?: string
  message?: string
}

/** Keep digits only, so a pasted `123 456` or `123-456` still works. */
export function normalizeResetCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, RESET_CODE_LENGTH)
}

/** Show a code the way the email prints it: `123-456`, the dash arriving with the fourth digit. */
export function formatResetCode(input: string): string {
  const digits = normalizeResetCode(input)
  const half = RESET_CODE_LENGTH / 2
  return digits.length > half ? `${digits.slice(0, half)}-${digits.slice(half)}` : digits
}

/** Enough of an email address to be worth sending to. Supabase has the final say. */
export function looksLikeEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())
}

/** What a person reads when a reset step fails. */
export function resetErrorMessage(error: ResetError): string {
  // supabase-js turns a failed or timed-out fetch into a status-0
  // AuthRetryableFetchError; its message ("Failed to fetch") explains nothing.
  if (error.status === 0 || error.name === 'AuthRetryableFetchError') {
    return 'Couldn’t reach SportPool. Check your connection and try again.'
  }
  switch (error.code) {
    // A wrong code and an expired one are the same answer from Supabase.
    case 'otp_expired':
      return 'That code didn’t work. Check it, or send a new one.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many tries. Wait a minute, then try again.'
    case 'email_address_invalid':
    case 'validation_failed':
      return 'That doesn’t look like an email address.'
    case 'weak_password':
      return error.message || 'Choose a stronger password.'
  }
  return error.message || 'Something went wrong. Please try again.'
}
