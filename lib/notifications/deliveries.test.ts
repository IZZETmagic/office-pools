// The delivery record's writer (lib/notifications/deliveries.ts). Pinned: an address is kept only
// when no user is known, lower-cased so account deletion can find it; a push never carries an
// address and an email never carries a device; errors are cut to size; and a failed write is
// logged, never thrown — the message has already gone, and a throw would send it again.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const insert = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: (table: string) => ({ insert: (rows: unknown) => insert(table, rows) }) }),
}))

import { describeError, recordDeliveries, toRow, type Delivery } from './deliveries'

const base: Delivery = { kind: 'pool_welcome', channel: 'email', provider: 'resend', status: 'sent' }

beforeEach(() => {
  insert.mockReset()
  insert.mockResolvedValue({ error: null })
})

describe('what a row keeps', () => {
  it('a known user is recorded by id, never by address', () => {
    expect(toRow({ ...base, userId: 'u1', address: 'Mia@Example.com' })).toMatchObject({ user_id: 'u1', address: null })
  })

  it('an address is kept only when there is no user — lower-cased, so deletion can find it', () => {
    expect(toRow({ ...base, kind: 'crew_invite_email', address: ' New.Person@Example.COM ' })).toMatchObject({
      user_id: null,
      address: 'new.person@example.com',
    })
  })

  it('a push never carries an address; an email never carries a device', () => {
    expect(toRow({ ...base, channel: 'push', provider: 'expo', userId: null, address: 'x@y.z', pushTokenId: 't1' }))
      .toMatchObject({ address: null, push_token_id: 't1' })
    expect(toRow({ ...base, pushTokenId: 't1' })).toMatchObject({ push_token_id: null })
  })

  it('an error is cut to 500 characters', () => {
    expect(toRow({ ...base, status: 'failed', error: 'x'.repeat(2000) }).error).toHaveLength(500)
  })
})

describe('writing', () => {
  it('writes every row in one insert', async () => {
    await recordDeliveries([{ ...base, userId: 'u1' }, { ...base, userId: 'u2' }])
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toBe('notification_deliveries')
    expect((insert.mock.calls[0][1] as unknown[]).length).toBe(2)
  })

  it('nothing to record, nothing written', async () => {
    await recordDeliveries([])
    expect(insert).not.toHaveBeenCalled()
  })

  it('a refused write is logged, not thrown', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    insert.mockResolvedValue({ error: { message: 'no partition of relation found for row' } })
    await expect(recordDeliveries([base])).resolves.toBeUndefined()
    insert.mockRejectedValue(new Error('fetch failed'))
    await expect(recordDeliveries([base])).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(2)
    log.mockRestore()
  })
})

describe('describeError', () => {
  it('reads Resend\'s { name, message } and plain errors alike', () => {
    expect(describeError({ name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 }))
      .toBe('rate_limit_exceeded: Too many requests')
    expect(describeError(new Error('boom'))).toBe('boom')
    expect(describeError('nope')).toBe('nope')
  })
})
