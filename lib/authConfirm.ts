import type { EmailOtpType } from '@supabase/supabase-js'

// =============================================================
// /auth/confirm — where a verified email link lands
// =============================================================
// The reset email links to `/auth/confirm?token_hash=…&type=recovery`, and the
// route verifies that hash on the SERVER. Unlike the PKCE link it replaces, that
// works in any browser on any device: there is no code verifier sitting in the
// cookie jar of whichever browser asked. The same email also carries the
// code the app types in, so one template serves both.
//
// ⚠ THE DESTINATION IS DECIDED HERE, BY THE LINK'S TYPE, NEVER READ FROM THE URL.
// `/auth/callback` takes a `next` and appends it to the origin, so `next=@x.com`
// becomes `https://sportpool.io@x.com` — another host. This route has no `next`
// at all, so it cannot be turned into an open redirect. A type missing from
// this map is refused outright rather than sent somewhere by default.
// =============================================================

const DESTINATIONS: Partial<Record<EmailOtpType, string>> = {
  recovery: '/reset-password',
}

/** Where a link that could not be verified (expired, used, malformed) lands. */
export const CONFIRM_FAILED_PATH = '/forgot-password?error=link_invalid'

/** The verified type and the path it lands on, or null for a type we do not accept. */
export function confirmDestination(
  type: string | null
): { type: EmailOtpType; path: string } | null {
  if (!type || !Object.hasOwn(DESTINATIONS, type)) return null
  const path = DESTINATIONS[type as EmailOtpType]
  return path ? { type: type as EmailOtpType, path } : null
}
