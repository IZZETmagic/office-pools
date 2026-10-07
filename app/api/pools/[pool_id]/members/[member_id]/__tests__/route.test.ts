// DELETE /api/pools/:pool_id/members/:member_id — one request that removes, rescores and tells.
// Pinned: only the pool's admin may remove; only a player can be removed; nobody removes
// themselves here (that is /leave); a member of another pool is not found; and once the
// membership is gone the removal stands — a failed rescore or notice is logged, not reported as
// a failed removal.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  caller: 'boss',
  db: null as null | { client: never; tables: Record<string, Array<Record<string, unknown>>> },
}))

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => unknown) => { void fn() },
}))
vi.mock('@/lib/auth', () => ({ requireAuth: async () => ({ data: { userData: { user_id: h.caller } }, error: null }) }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => h.db!.client }))
vi.mock('@/lib/scoring', () => ({ recalculatePool: vi.fn(async () => ({ success: true })) }))
vi.mock('@/lib/pools/adminNotices', () => ({ queueMemberRemoved: vi.fn(async () => [11]) }))
vi.mock('@/lib/notifications/outbox', () => ({ dispatch: vi.fn(async () => undefined) }))
vi.mock('@/lib/notifications/composers', () => ({ COMPOSERS: {} }))

import { DELETE } from '../route'
import { recalculatePool } from '@/lib/scoring'
import { queueMemberRemoved } from '@/lib/pools/adminNotices'
import { dispatch } from '@/lib/notifications/outbox'
import { fakeDb } from '@/lib/crews/__tests__/fakeDb'

const members = () => [
  { member_id: 'm-boss', pool_id: 'p1', user_id: 'boss', role: 'admin' },
  { member_id: 'm-co', pool_id: 'p1', user_id: 'co', role: 'admin' },
  { member_id: 'm-mia', pool_id: 'p1', user_id: 'mia', role: 'player' },
  { member_id: 'm-elsewhere', pool_id: 'p2', user_id: 'leo', role: 'player' },
]

const remove = async (memberId: string) => {
  const res = await DELETE({} as NextRequest, { params: Promise.resolve({ pool_id: 'p1', member_id: memberId }) })
  return { status: res.status, body: await res.json() }
}
const ids = () => h.db!.tables.pool_members.map((m) => m.member_id)

beforeEach(() => {
  h.caller = 'boss'
  h.db = fakeDb({ pool_members: members() }) as never
  vi.mocked(recalculatePool).mockClear()
  vi.mocked(queueMemberRemoved).mockClear()
  vi.mocked(dispatch).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('who can remove whom', () => {
  it('a player cannot remove anyone', async () => {
    h.caller = 'mia'
    expect((await remove('m-co')).status).toBe(403)
    expect(ids()).toContain('m-co')
  })

  it('nobody removes themselves here — that is /leave', async () => {
    expect(await remove('m-boss')).toMatchObject({ status: 400, body: { error: 'Leaving goes through /leave' } })
    expect(ids()).toContain('m-boss')
  })

  it('an admin cannot be removed — they are demoted first', async () => {
    expect((await remove('m-co')).status).toBe(400)
    expect(ids()).toContain('m-co')
  })

  it('a member of another pool is not found', async () => {
    expect((await remove('m-elsewhere')).status).toBe(404)
    expect(ids()).toContain('m-elsewhere')
  })
})

describe('a removal', () => {
  it('removes, rescores and tells them — in one request', async () => {
    expect(await remove('m-mia')).toEqual({ status: 200, body: { removed: true, told: true } })
    expect(ids()).not.toContain('m-mia')
    expect(recalculatePool).toHaveBeenCalledWith({ poolId: 'p1' })
    expect(queueMemberRemoved).toHaveBeenCalledWith(expect.anything(), { poolId: 'p1', userId: 'mia', actorId: 'boss' })
    expect(dispatch).toHaveBeenCalledWith(expect.anything(), {}, { ids: [11] })
  })

  it('stands even if the rescore or the notice fails', async () => {
    vi.mocked(recalculatePool).mockResolvedValueOnce({ success: false, error: 'timeout' } as never)
    vi.mocked(queueMemberRemoved).mockRejectedValueOnce(new Error('outbox down'))
    expect(await remove('m-mia')).toEqual({ status: 200, body: { removed: true, told: false } })
    expect(ids()).not.toContain('m-mia')
    expect(dispatch).not.toHaveBeenCalled()
  })
})
