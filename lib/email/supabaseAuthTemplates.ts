import { paragraph, statBlock } from './components'
import { brandedTemplate } from './templates'
import { RESET_CODE_LENGTH } from '../passwordReset'

// =============================================================
// Supabase auth emails — designed HERE, sent by Supabase
// =============================================================
// Supabase Auth sends these itself, from templates pasted into the dashboard
// (Authentication → Emails), so nothing in the app ever calls this file at
// runtime. It exists so those emails wear the same shell as every email we send
// through Resend, instead of a hand-kept copy of the green design retired in
// July. To change one: edit it here, then
//
//   npx tsx scripts/render-auth-email.ts reset-password --copy
//
// and paste the output over the dashboard's Source.
//
// ⚠ THE `{{ … }}` ARE GO TEMPLATE ACTIONS, run by Supabase at send time. They
// pass through `brandedTemplate` untouched (it is a plain string template), and
// the test pins that no other `{{` reaches the output, since any would be read
// as an action and break the template.
// =============================================================

const HALF = RESET_CODE_LENGTH / 2

/**
 * The code as the person reads it, `123-456`, cut at its half by Go's built-in
 * `slice`. ⚠ ONLY SAFE WHILE THE CODE IS RESET_CODE_LENGTH LONG: Supabase's
 * "Email OTP Length" must match, or a longer code loses its tail here and a
 * shorter one fails to render, which stops the email being sent at all.
 */
export const RESET_CODE_DISPLAY = `{{ slice .Token 0 ${HALF} }}-{{ slice .Token ${HALF} }}`

/** Authentication → Emails → Reset password. */
export function resetPasswordAuthTemplate(): { subject: string; html: string } {
  return {
    subject: 'Reset your SportPool password',
    html: brandedTemplate({
      preheader: 'Your SportPool password reset code.',
      heading: 'Reset your password',
      // No link, by design (Ryan, 2026-10-04): the website and the app both ask
      // for this code. A link can't open the app, and a mail scanner that
      // "clicks" links can spend one before the person does.
      body:
        paragraph(
          'We got a request to reset the password on your SportPool account. Enter this code in SportPool to choose a new one.',
          { marginBottom: 20 }
        ) +
        statBlock({
          label: 'Your code',
          value: RESET_CODE_DISPLAY,
          sub: 'Works once, for an hour',
          variant: 'info',
        }) +
        paragraph(
          'If you didn’t ask to reset your password, you can ignore this email and nothing will change.',
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
