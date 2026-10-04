import { describe, expect, it } from 'vitest'

import { resetPasswordAuthTemplate } from '../supabaseAuthTemplates'

// =============================================================
// The reset email survives being pasted into Supabase
// =============================================================
// Supabase fills `{{ .X }}` actions at send time. A placeholder lost here is a
// reset email with no link or no code; a stray `{{` from anywhere else in the
// shell would be read as an action and break the whole template.
// =============================================================

const { subject, html } = resetPasswordAuthTemplate()

describe('reset password template', () => {
  it('links to /auth/confirm with the token hash, never the old PKCE ConfirmationURL', () => {
    expect(html).toContain(
      'href="https://sportpool.io/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery"'
    )
    expect(html).not.toContain('ConfirmationURL')
    // The Site URL is saved without a scheme, so it must never build the link.
    expect(html).not.toContain('{{ .SiteURL }}')
  })

  it('carries the code for the app', () => {
    expect(html).toContain('{{ .Token }}')
  })

  it('contains no Go template action except the two it means to', () => {
    const actions = html.match(/\{\{[^}]*\}\}/g) ?? []
    expect(new Set(actions)).toEqual(new Set(['{{ .TokenHash }}', '{{ .Token }}']))
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
