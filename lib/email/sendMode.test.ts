import { describe, it, expect } from 'vitest'
import { resolveSendMode, testEmailFor } from './sendMode'

// The rule these pin: an admin send reaches members ONLY on an explicit boolean
// `dry_run: false`. Every other body previews — including the ones a sloppy
// caller would produce — and a test send reaches nobody but the admin.

describe('resolveSendMode — safe by default', () => {
  it('previews when the flag is left out', () => {
    expect(resolveSendMode({})).toBe('preview')
  })
  it('previews on dry_run: true', () => {
    expect(resolveSendMode({ dry_run: true })).toBe('preview')
  })
  it('sends ONLY on the boolean false', () => {
    expect(resolveSendMode({ dry_run: false })).toBe('send')
  })
  it('does not send on the STRING "false" — a sloppy caller previews', () => {
    expect(resolveSendMode({ dry_run: 'false' })).toBe('preview')
  })
  it('does not send on 0, null or undefined', () => {
    expect(resolveSendMode({ dry_run: 0 })).toBe('preview')
    expect(resolveSendMode({ dry_run: null })).toBe('preview')
    expect(resolveSendMode({ dry_run: undefined })).toBe('preview')
  })
})

describe('resolveSendMode — a test send outranks everything', () => {
  it('is a test even when the caller also said dry_run: false', () => {
    expect(resolveSendMode({ test_send: true, dry_run: false })).toBe('test')
  })
  it('is NOT a test on the string "true" — it previews', () => {
    expect(resolveSendMode({ test_send: 'true' })).toBe('preview')
  })
})

describe('testEmailFor', () => {
  const first = {
    to: 'member@example.com',
    subject: 'Your pool needs you',
    html: '<p>Hi Alice</p>',
    kind: 'pool_size_nudge' as const,
    userId: 'u-alice',
    tags: [{ name: 'category', value: 'growth' }],
  }
  const t = testEmailFor(first, 'admin@example.com')

  it('goes to the admin and never to the member', () => {
    expect(t.to).toBe('admin@example.com')
    expect(JSON.stringify(t)).not.toContain('member@example.com')
  })
  it('is the member’s email exactly, marked as a test', () => {
    expect(t.html).toBe(first.html)
    expect(t.subject).toBe('[TEST] Your pool needs you')
  })
  it('is a direct email — no topic, no switch — so an admin who turned it off still receives it', () => {
    expect(t.kind).toBe('direct_email')
    expect(t.tags).toEqual([{ name: 'category', value: 'test_send' }])
  })
  it('is not the member\'s: the record must not say they were emailed', () => {
    expect(t.userId).toBeNull()
    expect(JSON.stringify(t)).not.toContain('u-alice')
  })
})
