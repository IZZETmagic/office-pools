// The push transport (lib/push/apns.ts), N4 — 2026-10-07. Pinned: every push names a registry
// kind and the switch applied is that kind's; a kind that is not live is refused before anything
// is read or sent; a failed preference read sends nothing; and a call without a kind does not
// compile — so no push anywhere can skip a member's switch.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  optedOut: [] as Array<{ user_id: string }>,
  prefError: null as { message: string } | null,
  prefColumns: [] as string[],
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
      if (table === 'push_tokens') {
        return thenable(() => ({
          data: [{ token: 'ExponentPushToken[abc]', environment: 'production', bundle_id: null, platform: 'android' }],
          error: null,
        }))
      }
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async () => ({ data: 0, error: null }),
  }),
}))
vi.mock('../expo-push', () => ({ sendExpoPushNotification: vi.fn(async () => true) }))

import { sendPushToUser, sendPushToUsers } from '../apns'
import { sendExpoPushNotification } from '../expo-push'

const pushed = vi.mocked(sendExpoPushNotification)
const PUSH = { title: 'Hi', body: 'There' }

beforeEach(() => {
  pushed.mockClear()
  state.optedOut = []
  state.prefError = null
  state.prefColumns = []
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
