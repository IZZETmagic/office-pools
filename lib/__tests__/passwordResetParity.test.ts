import { describe, expect, it } from 'vitest'

import * as app from '../../mobile/lib/passwordReset'
import * as web from '../passwordReset'

// =============================================================
// The website and the app read a reset code the same way
// =============================================================
// One email, one code, two surfaces. The web keeps a copy of the app's rules
// because it can't import from `mobile/` — so this runs both against the same
// inputs. A code that formats as 123-456 in the app and 1234-56 on the web, or
// a cooldown that differs, fails here instead of in someone's inbox.
// =============================================================

describe('password reset parity', () => {
  it('agrees on the code length and the resend cooldown', () => {
    expect(web.RESET_CODE_LENGTH).toBe(app.RESET_CODE_LENGTH)
    expect(web.RESEND_COOLDOWN_SECONDS).toBe(app.RESEND_COOLDOWN_SECONDS)
  })

  it('normalises and formats every input alike', () => {
    for (const input of ['', '1', '123', '1234', '123456', '123-456', '123 456', ' 12a3-45 6 ', '1234567890', '—']) {
      expect(web.normalizeResetCode(input)).toBe(app.normalizeResetCode(input))
      expect(web.formatResetCode(input)).toBe(app.formatResetCode(input))
    }
  })

  it('agrees on what looks like an email', () => {
    for (const input of ['', 'sam', 'sam@example.com', ' sam@example.com ', 'sam@example', 'a b@c.d']) {
      expect(web.looksLikeEmail(input)).toBe(app.looksLikeEmail(input))
    }
  })

  it('says the same thing for every failure', () => {
    const errors = [
      { status: 0, message: 'Failed to fetch' },
      { name: 'AuthRetryableFetchError' },
      { code: 'otp_expired', status: 403 },
      { code: 'over_email_send_rate_limit', status: 429 },
      { code: 'over_request_rate_limit', status: 429 },
      { code: 'email_address_invalid' },
      { code: 'validation_failed' },
      { code: 'weak_password', message: 'Password is known to be weak' },
      { code: 'weak_password' },
      { code: 'unexpected', message: 'Boom' },
      {},
    ]
    for (const e of errors) expect(web.resetErrorMessage(e)).toBe(app.resetErrorMessage(e))
  })
})
