import { paragraph, statBlock } from './components'
import { brandedTemplate } from './templates'

// =============================================================
// Supabase auth emails — designed HERE, sent by Supabase
// =============================================================
// Supabase Auth sends these itself, from templates pasted into the dashboard
// (Authentication → Emails), so nothing in the app ever calls this file at
// runtime. It exists so those emails wear the same shell as every email we send
// through Resend, instead of a hand-kept copy of the green design retired in
// July. To change one: edit it here, then
//
//   npx tsx scripts/render-auth-email.ts reset-password
//
// and paste the output over the dashboard's Source.
//
// ⚠ THE `{{ .X }}` PLACEHOLDERS ARE GO TEMPLATE ACTIONS, filled by Supabase at
// send time. They pass through `brandedTemplate` untouched (it is a plain string
// template), and the test pins that no other `{{` reaches the output, since any
// would be read as an action and break the template.
// =============================================================

/**
 * The reset link. It goes to /auth/confirm, which verifies the hash on the
 * server, so it works whichever browser opens it (see lib/authConfirm.ts).
 *
 * ⚠ SPELLED OUT, NOT `{{ .SiteURL }}`: the project's Site URL is saved as bare
 * `sportpool.io`, with no scheme, which would print a link no mail app opens.
 */
export const RESET_PASSWORD_URL =
  'https://sportpool.io/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery'

/** Authentication → Emails → Reset password. */
export function resetPasswordAuthTemplate(): { subject: string; html: string } {
  return {
    subject: 'Reset your SportPool password',
    html: brandedTemplate({
      preheader: 'Choose a new password for your SportPool account.',
      heading: 'Reset your password',
      body: paragraph(
        'We got a request to reset the password on your SportPool account. Tap the button to choose a new one.'
      ),
      ctaText: 'Reset password',
      ctaUrl: RESET_PASSWORD_URL,
      // The app can't open the link (no universal links), so the same email
      // carries the code it asks for. Supabase's {{ .Token }} is 8 digits here.
      afterCta:
        '<div style="height:12px;line-height:12px;font-size:12px;">&nbsp;</div>' +
        statBlock({
          label: 'Using the SportPool app?',
          value: '{{ .Token }}',
          sub: 'Enter this code instead',
          variant: 'info',
        }) +
        paragraph(
          'The button and the code each work once and expire after an hour. If you didn’t ask to reset your password, you can ignore this email and nothing will change.',
          { marginBottom: 0 }
        ),
      footer: 'none',
    }),
  }
}

/** Every dashboard template this file owns, by the name the render script takes. */
export const SUPABASE_AUTH_TEMPLATES = {
  'reset-password': resetPasswordAuthTemplate,
} as const
