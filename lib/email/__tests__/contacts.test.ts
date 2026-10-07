// syncContactToResend (lib/email/contacts.ts), N4. Pinned: a new member is created as a contact
// already in the General segment — the list a Broadcast goes to; an existing contact is added to
// that segment instead; and nothing here throws into the request that called it.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const resend = vi.hoisted(() => ({ create: vi.fn(), add: vi.fn() }))
vi.mock('../resend', () => ({ getResendClient: () => ({ contacts: { create: resend.create, segments: { add: resend.add } } }) }))

import { syncContactToResend } from '../contacts'

beforeEach(() => {
  resend.create.mockReset()
  resend.add.mockReset()
  vi.stubEnv('RESEND_AUDIENCE_ID', 'seg-general')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('syncContactToResend', () => {
  it('creates a new contact already in General', async () => {
    resend.create.mockResolvedValue({ data: { id: 'c1' }, error: null })
    await syncContactToResend({ email: 'mia@example.com', firstName: 'Mia' })
    expect(resend.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'mia@example.com', segments: [{ id: 'seg-general' }] }))
    expect(resend.add).not.toHaveBeenCalled()
  })

  it('an existing contact is added to General instead', async () => {
    resend.create.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'Contact already exists' } })
    resend.add.mockResolvedValue({ data: { id: 'seg-general' }, error: null })
    await syncContactToResend({ email: 'mia@example.com' })
    expect(resend.add).toHaveBeenCalledWith({ email: 'mia@example.com', segmentId: 'seg-general' })
  })

  it('never throws into its caller', async () => {
    resend.create.mockRejectedValue(new Error('network down'))
    await expect(syncContactToResend({ email: 'mia@example.com' })).resolves.toBeUndefined()
  })
})
