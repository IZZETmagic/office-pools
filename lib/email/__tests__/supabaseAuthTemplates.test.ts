import { describe, expect, it } from 'vitest'

import { RESET_CODE_LENGTH, formatResetCode } from '../../passwordReset'
import { RESET_CODE_DISPLAY, resetPasswordAuthTemplate } from '../supabaseAuthTemplates'

// =============================================================
// The reset email survives being pasted into Supabase
// =============================================================
// Supabase runs the `{{ … }}` actions at send time. A lost one is a reset email
// with no code; a stray `{{` from anywhere else in the shell would be read as
// an action and break the whole template.
// =============================================================

const { subject, html } = resetPasswordAuthTemplate()

/** What Go's `slice` makes of a code — the same cut the template asks for. */
function renderLikeSupabase(template: string, token: string): string {
  return template.replace(/\{\{ slice \.Token (\d+)(?: (\d+))? \}\}/g, (_, from, to) =>
    token.slice(Number(from), to === undefined ? undefined : Number(to))
  )
}

describe('reset password template', () => {
  it('prints the code exactly as the website and the app format it', () => {
    const token = '482039'
    expect(token).toHaveLength(RESET_CODE_LENGTH)
    expect(renderLikeSupabase(RESET_CODE_DISPLAY, token)).toBe(formatResetCode(token))
    expect(renderLikeSupabase(html, token)).toContain('482-039')
  })

  it('carries no link — the code is the whole flow', () => {
    expect(html).not.toContain('ConfirmationURL')
    expect(html).not.toContain('TokenHash')
    expect(html).not.toContain('/auth/confirm')
  })

  it('contains no Go template action except the two halves of the code', () => {
    const actions = html.match(/\{\{[^}]*\}\}/g) ?? []
    expect(actions).toEqual([`{{ slice .Token 0 ${RESET_CODE_LENGTH / 2} }}`, `{{ slice .Token ${RESET_CODE_LENGTH / 2} }}`])
    expect(html.split('{{').length - 1).toBe(actions.length)
  })

  it('is on the shared shell, with no unsubscribe on a security email', () => {
    expect(html).toContain('color-scheme')
    expect(html).not.toContain('Unsubscribe')
    expect(html).not.toContain('#16a34a') // the retired green design
  })

  it('keeps a plain subject, with no code in it to show on a lock screen', () => {
    expect(subject).toBe('Reset your SportPool password')
    expect(subject).not.toContain('{{')
  })
})
