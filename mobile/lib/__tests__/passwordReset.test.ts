import { describe, expect, it } from 'vitest';

import {
  MIN_PASSWORD_LENGTH,
  RESET_CODE_LENGTH,
  looksLikeEmail,
  normalizeResetCode,
  resetErrorMessage,
  validateNewPassword,
} from '../passwordReset';

describe('normalizeResetCode', () => {
  it('keeps digits from a pasted code with spaces or dashes', () => {
    expect(normalizeResetCode('123 456')).toBe('123456');
    expect(normalizeResetCode('123-456')).toBe('123456');
    expect(normalizeResetCode(' 12a3b4 ')).toBe('1234');
  });

  it('never grows past the code length', () => {
    expect(normalizeResetCode('1234567890123')).toHaveLength(RESET_CODE_LENGTH);
  });
});

describe('looksLikeEmail', () => {
  it('accepts an address, with stray spaces around it', () => {
    expect(looksLikeEmail('sam@example.com')).toBe(true);
    expect(looksLikeEmail('  sam@example.com ')).toBe(true);
  });

  it('refuses what is plainly not one', () => {
    for (const bad of ['', 'sam', 'sam@', 'sam@example', '@example.com', 'sam @example.com']) {
      expect(looksLikeEmail(bad)).toBe(false);
    }
  });
});

describe('validateNewPassword', () => {
  const ok = 'x'.repeat(MIN_PASSWORD_LENGTH);

  it('allows a long-enough password typed twice', () => {
    expect(validateNewPassword(ok, ok)).toBeNull();
  });

  it('checks length before the match, so a short pair says "too short"', () => {
    expect(validateNewPassword('short', 'short')).toMatch(/at least 8/);
    expect(validateNewPassword('short', 'other')).toMatch(/at least 8/);
  });

  it('refuses a mismatch', () => {
    expect(validateNewPassword(ok, `${ok}!`)).toBe('Passwords do not match.');
  });
});

describe('resetErrorMessage', () => {
  it('names the connection, not "Failed to fetch", when the request never landed', () => {
    expect(resetErrorMessage({ status: 0, message: 'Failed to fetch' })).toMatch(/connection/);
    expect(resetErrorMessage({ name: 'AuthRetryableFetchError' })).toMatch(/connection/);
  });

  it('treats a wrong code and an expired one alike', () => {
    expect(resetErrorMessage({ code: 'otp_expired', status: 403 })).toMatch(/code didn’t work/);
  });

  it('asks for patience on either rate limit', () => {
    expect(resetErrorMessage({ code: 'over_email_send_rate_limit', status: 429 })).toMatch(/Wait/);
    expect(resetErrorMessage({ code: 'over_request_rate_limit', status: 429 })).toMatch(/Wait/);
  });

  it('passes a weak-password reason through, since it says what to fix', () => {
    expect(resetErrorMessage({ code: 'weak_password', message: 'Password is known to be weak' })).toBe(
      'Password is known to be weak',
    );
  });

  it('falls back to the server message, then to something generic', () => {
    expect(resetErrorMessage({ code: 'unexpected', message: 'Boom' })).toBe('Boom');
    expect(resetErrorMessage({})).toMatch(/Something went wrong/);
  });
});
