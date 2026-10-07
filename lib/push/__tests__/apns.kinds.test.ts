// The push transport (lib/push/apns.ts), N4 — 2026-10-07. Pinned: every push names a registry
// kind and the switch applied is that kind's; a kind that is not live is refused before anything
// is read or sent; a failed preference read sends nothing; a call without a kind does not
// compile — so no push anywhere can skip a member's switch. And every device a push is handed to
// gets a row in the delivery record, with the provider's id for it.

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Token = { id: string; token: string; environment: string; bundle_id: null; platform: string }

const state = vi.hoisted(() => ({
  optedOut: [] as Array<{ user_id: string }>,
  prefError: null as { message: string } | null,
  prefColumns: [] as string[],
  tokens: [] as Token[],
}))

type Result = { data: unknown; error: { message: string } | null }
const thenable = (result: () => Result) => {
  const q = {
    select: () => q,
    in: () => q,
    eq: (col: string) => {
      if (col !== 'user_id') state.prefColumns.push(col)
      return q
    },
    then: (resolve: (r: Result) => unknown) => resolve(result()),
  }
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'push_notification_preferences') {
        return thenable(() => (state.prefError ? { data: null, error: state.prefError } : { data: state.optedOut, error: null }))
      }
      if (table === 'push_tokens') return thenable(() => ({ data: state.tokens, error: null }))
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async () => ({ data: 0, error: null }),
  }),
}))
vi.mock('../expo-push', () => ({
  sendExpoPushNotification: vi.fn(async (token: string) =>
    token.includes('gone')
      ? { ok: false, providerId: 'ticket-gone', error: 'DeviceNotRegistered' }
      : { ok: true, providerId: `ticket-${token.slice(18, 21)}`, error: null },
  ),
}))
vi.mock('@/lib/notifications/deliveries', () => ({ recordDeliveries: vi.fn(async () => undefined) }))

import { sendPushToUser, sendPushToUsers } from '../apns'
import { sendExpoPushNotification } from '../expo-push'
import { recordDeliveries } from '@/lib/notifications/deliveries'

const pushed = vi.mocked(sendExpoPushNotification)
const recorded = vi.mocked(recordDeliveries)
const PUSH = { title: 'Hi', body: 'There' }
const phone = (id: string, inner: string): Token => ({
  id, token: `ExponentPushToken[${inner}]`, environment: 'production', bundle_id: null, platform: 'android',
})

beforeEach(() => {
  pushed.mockClear()
  recorded.mockClear()
  state.optedOut = []
  state.prefError = null
  state.prefColumns = []
  state.tokens = [phone('tok-1', 'abc')]
})

describe('the switch is the kind\'s', () => {
  it('a member who switched off Community gets no chat push', async () => {
    state.optedOut = [{ user_id: 'u1' }]
    expect(await sendPushToUser('u1', PUSH, 'chat_message')).toEqual({ sent: 0, total: 0 })
    expect(state.prefColumns).toEqual(['community'])
    expect(pushed).not.toHaveBeenCalled()
  })

  it('a kind under a switch that is on is sent', async () => {
    expect(await sendPushToUser('u1', PUSH, 'matchweek_completed')).toEqual({ sent: 1, total: 1 })
    expect(state.prefColumns).toEqual(['match_results'])
    expect(pushed).toHaveBeenCalledTimes(1)
  })

  it('a fan-out applies the same switch', async () => {
    state.optedOut = [{ user_id: 'u1' }]
    expect(await sendPushToUsers(['u1'], PUSH, 'pool_welcome')).toEqual({ sent: 0, total: 0 })
    expect(state.prefColumns).toEqual(['pool_activity'])
  })
})

describe('refusals', () => {
  it('a kind that is not live is refused before anything is read or sent', async () => {
    await expect(sendPushToUser('u1', PUSH, 'duel_drawn')).rejects.toThrow('duel_drawn is planned, not live')
    await expect(sendPushToUsers(['u1'], PUSH, 'lms_eliminated')).rejects.toThrow('lms_eliminated is planned, not live')
    expect(state.prefColumns).toEqual([])
    expect(pushed).not.toHaveBeenCalled()
  })

  it('a failed preference read sends nothing — never "nobody opted out"', async () => {
    state.prefError = { message: 'connection reset' }
    await expect(sendPushToUser('u1', PUSH, 'chat_message')).rejects.toThrow('preference read failed: connection reset')
    expect(pushed).not.toHaveBeenCalled()
  })

  it('a push without a kind does not compile', () => {
    // @ts-expect-error — the kind is required: no push can skip a member's switch
    const withoutKind = () => sendPushToUser('u1', PUSH)
    // @ts-expect-error — and it must be a kind the registry knows
    const unknownKind = () => sendPushToUser('u1', PUSH, 'rank_change')
    expect([withoutKind, unknownKind]).toHaveLength(2)
  })
})

describe('the delivery record', () => {
  it('one row per device, with the provider\'s id — and a refused device says why', async () => {
    state.tokens = [phone('tok-1', 'abc'), phone('tok-2', 'gone')]
    const res = await sendPushToUser('u1', PUSH, 'pool_countdown', { outboxId: 41, poolId: 'p1' })

    expect(res).toEqual({ sent: 1, total: 2 })
    expect(recorded).toHaveBeenCalledTimes(1)
    expect(recorded.mock.calls[0][0]).toEqual([
      {
        kind: 'pool_countdown', channel: 'push', provider: 'expo', status: 'sent', userId: 'u1',
        poolId: 'p1', outboxId: 41, pushTokenId: 'tok-1', providerId: 'ticket-abc', error: null,
      },
      {
        kind: 'pool_countdown', channel: 'push', provider: 'expo', status: 'failed', userId: 'u1',
        poolId: 'p1', outboxId: 41, pushTokenId: 'tok-2', providerId: 'ticket-gone', error: 'DeviceNotRegistered',
      },
    ])
  })

  it('a device whose send threw is still recorded, as failed', async () => {
    pushed.mockRejectedValueOnce(new Error('socket hang up'))
    await sendPushToUser('u1', PUSH, 'chat_message')
    expect(recorded.mock.calls[0][0]).toEqual([
      expect.objectContaining({ status: 'failed', provider: 'expo', pushTokenId: 'tok-1', providerId: null, error: 'socket hang up' }),
    ])
  })

  it('nothing is recorded when nothing was attempted — switched off, or no device', async () => {
    state.optedOut = [{ user_id: 'u1' }]
    await sendPushToUser('u1', PUSH, 'chat_message')
    state.optedOut = []
    state.tokens = []
    await sendPushToUser('u1', PUSH, 'chat_message')
    expect(recorded).not.toHaveBeenCalled()
  })

  it('a fan-out carries its context to every member\'s record', async () => {
    await sendPushToUsers(['u1', 'u2'], PUSH, 'round_open', { poolId: 'p9' })
    const rows = recorded.mock.calls.flatMap((c) => c[0])
    expect(rows.map((r) => [r.userId, r.poolId, r.outboxId])).toEqual([['u1', 'p9', null], ['u2', 'p9', null]])
  })
})
