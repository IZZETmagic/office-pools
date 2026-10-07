// POST /api/admin/broadcast, N4 (Ryan, 2026-10-07: "Everyone only, via Resend"). Pinned: a
// broadcast goes only to everyone, through the fixed General segment, carrying the News from
// SportPool topic; it is refused — before its one-time key is spent, before anything is created —
// for any other audience, or while the News topic is not configured; and the preview and the log
// count everyone except whoever switched News off. Never a shared list rebuilt per send.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  newsTopic: 't-news' as string | undefined,
  newsOff: [] as Array<{ user_id: string }>,
  inserted: [] as Array<{ table: string; row: unknown }>,
  resend: { create: vi.fn(), send: vi.fn(), contactsRemove: vi.fn(), contactsCreate: vi.fn() },
}))

vi.mock('@/lib/auth', () => ({
  requireSuperAdmin: async () => ({
    data: {
      userData: { user_id: 'boss' },
      supabase: { from: (table: string) => ({ insert: async (row: unknown) => { h.inserted.push({ table, row }); return { error: null } } }) },
    },
    error: null,
  }),
}))
vi.mock('@/lib/email/resend', () => ({
  getResendClient: () => ({
    broadcasts: { create: h.resend.create, send: h.resend.send },
    contacts: { remove: h.resend.contactsRemove, create: h.resend.contactsCreate },
  }),
}))
vi.mock('@/lib/email/segments', () => ({
  SEGMENTS: { all: { label: 'All Users' } },
  querySegment: async () => [
    { email: 'mia@example.com', user_id: 'mia', full_name: 'Mia', username: 'mia' },
    { email: 'leo@example.com', user_id: 'leo', full_name: 'Leo', username: 'leo' },
  ],
}))
vi.mock('@/lib/email/topics', () => ({ TOPICS: new Proxy({}, { get: (_t, k) => (k === 'NEWS' ? h.newsTopic : undefined) }) }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/supabase/paginate', () => ({ fetchAllRows: async () => h.newsOff }))

import { POST } from '../route'

const post = async (body: Record<string, unknown>) => {
  const res = await POST({ json: async () => body } as unknown as NextRequest)
  return { status: res.status, body: await res.json() }
}
const SEND = { subject: 'Hello', html: '<p>Hi</p>', dry_run: false, idempotency_key: 'k1' }

beforeEach(() => {
  h.newsTopic = 't-news'
  h.newsOff = []
  h.inserted = []
  vi.stubEnv('RESEND_AUDIENCE_ID', 'seg-general')
  h.resend.create.mockReset().mockResolvedValue({ data: { id: 'b1' }, error: null })
  h.resend.send.mockReset().mockResolvedValue({ error: null })
  h.resend.contactsRemove.mockReset()
  h.resend.contactsCreate.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('everyone only', () => {
  it('refuses any other audience — before the key is spent or anything is created', async () => {
    const res = await post({ ...SEND, segment: 'pool_admins' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Templates → Custom')
    expect(h.inserted).toEqual([])
    expect(h.resend.create).not.toHaveBeenCalled()
  })

  it('sends to the General segment with the News topic — and never touches a shared list', async () => {
    expect((await post(SEND)).status).toBe(200)
    expect(h.resend.create).toHaveBeenCalledWith(expect.objectContaining({ segmentId: 'seg-general', topicId: 't-news' }))
    expect(h.resend.send).toHaveBeenCalledWith('b1')
    expect(h.resend.contactsRemove).not.toHaveBeenCalled()
    expect(h.resend.contactsCreate).not.toHaveBeenCalled()
  })
})

describe('the News switch', () => {
  it('no News topic configured: refused, nothing spent or sent', async () => {
    h.newsTopic = undefined
    const res = await post(SEND)
    expect(res.status).toBe(500)
    expect(res.body.error).toContain('RESEND_TOPIC_NEWS')
    expect(h.inserted).toEqual([])
    expect(h.resend.create).not.toHaveBeenCalled()
  })

  it('the preview and the log leave out whoever switched News off', async () => {
    h.newsOff = [{ user_id: 'leo' }]
    expect(await post({ subject: 'Hello', html: '<p>Hi</p>' })).toEqual({
      status: 200,
      body: { dry_run: true, segment: 'all', kind: 'sportpool_news', recipientCount: 1, preview: ['mia@example.com'] },
    })
    await post(SEND)
    const log = h.inserted.find((i) => i.table === 'broadcast_log')?.row as { recipient_count: number; recipients: string[] }
    expect(log).toMatchObject({ recipient_count: 1, recipients: ['mia@example.com'] })
  })
})

describe('a Terms or Privacy update — always delivered (migration 180)', () => {
  it('carries no News topic and leaves out nobody who switched News off', async () => {
    h.newsOff = [{ user_id: 'leo' }]
    expect(await post({ subject: 'Terms', html: '<p>Hi</p>', kind: 'policy_update' })).toMatchObject({
      status: 200,
      body: { kind: 'policy_update', recipientCount: 2 },
    })
    await post({ ...SEND, kind: 'policy_update' })
    const created = h.resend.create.mock.calls[0][0] as Record<string, unknown>
    expect(created).toMatchObject({ segmentId: 'seg-general' })
    expect(created).not.toHaveProperty('topicId')
  })

  it('goes even while the News topic is not set up — it does not depend on it', async () => {
    h.newsTopic = undefined
    expect((await post({ ...SEND, kind: 'policy_update' })).status).toBe(200)
    expect(h.resend.send).toHaveBeenCalledWith('b1')
  })
})
