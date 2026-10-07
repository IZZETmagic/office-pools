import { describe, it, expect, vi } from 'vitest'

// The real transports are never reached — every test passes its own deps — but
// the module imports them, so they are stubbed to keep the import inert.
vi.mock('@/lib/email/resend', () => ({ getResendClient: () => { throw new Error('no real email in tests') } }))
vi.mock('@/lib/push/apns', () => ({ sendPushToUser: () => { throw new Error('no real push in tests') } }))
vi.mock('@/lib/email/topics', () => ({
  TOPICS: { POOL_ACTIVITY: 'topic-pool', PREDICTIONS: 'topic-predictions', MATCH_RESULTS: 'topic-results', LEADERBOARD: 'topic-lb', ADMIN: 'topic-admin', COMMUNITY: 'topic-community' },
  TOPIC_KEYS: ['POOL_ACTIVITY', 'PREDICTIONS', 'MATCH_RESULTS', 'LEADERBOARD', 'ADMIN', 'COMMUNITY'],
}))

import {
  backoffMs, decide, dispatch, MAX_ATTEMPTS, recipientFor, settle,
  type Composer, type DispatchDeps, type OutboxRow, type Person, type Settlement,
} from './outbox'

const NOW = new Date('2026-10-05T12:00:00Z')

const row = (over: Partial<OutboxRow> = {}): OutboxRow => ({
  outbox_id: 1,
  type_key: 'pool_welcome',
  user_id: 'u1',
  to_email: null,
  pool_id: 'p1',
  dedup_key: 'pool_welcome:p1:u1',
  payload: {},
  channels: ['email', 'push'],
  event_at: NOW.toISOString(),
  deadline_at: null,
  expires_at: null,
  shadow: false,
  email_status: null,
  push_status: null,
  attempts: 1,
  ...over,
})

const person = (over: Partial<Person> = {}): Person => ({
  address: 'member@example.com', emailOff: new Set(), pushOff: new Set(), hasDevice: true, ...over,
})

const welcome = { emails: [{ key: 'welcome', subject: 'Welcome', html: '<p>hi</p>' }], push: { title: 'Welcome', body: 'hi' } }

describe('settle', () => {
  it('finishes a row when every channel has finished, and calls it sent if any channel sent', () => {
    const s = settle(row(), { email: 'sent', push: 'skipped:no_device' }, NOW, null)
    expect(s).toMatchObject({ outcome: 'sent', processed_at: NOW.toISOString(), email_status: 'sent', push_status: 'skipped:no_device' })
  })
  it('calls a row skipped when nothing was sent', () => {
    expect(settle(row(), { email: 'skipped:opted_out', push: 'skipped:opted_out' }, NOW, null).outcome).toBe('skipped')
  })
  it('keeps a channel that already finished when only the other one is retried', () => {
    const s = settle(row({ email_status: 'sent' }), { push: 'sent' }, NOW, null)
    expect(s).toMatchObject({ outcome: 'sent', email_status: 'sent', push_status: 'sent' })
  })
  it('schedules a retry when a channel failed and attempts remain', () => {
    const s = settle(row({ attempts: 2 }), { email: 'failed', push: 'sent' }, NOW, 'boom')
    expect(s.outcome).toBeNull()
    expect(s.processed_at).toBeNull()
    expect(s.next_attempt_at).toBe(new Date(NOW.getTime() + backoffMs(2)).toISOString())
    expect(s.push_status).toBe('sent')
    expect(s.last_error).toBe('boom')
  })
  it('gives up as failed once the attempts run out', () => {
    expect(settle(row({ attempts: MAX_ATTEMPTS }), { email: 'failed' }, NOW, 'boom')).toMatchObject({ outcome: 'failed', processed_at: NOW.toISOString() })
  })
  it('marks a shadow row shadow, never sent', () => {
    expect(settle(row({ shadow: true }), { email: 'shadow:would_send', push: 'shadow:no_device' }, NOW, null).outcome).toBe('shadow')
  })
  it('ignores a channel the row does not use', () => {
    expect(settle(row({ channels: ['push'] }), { push: 'sent' }, NOW, null).outcome).toBe('sent')
  })
})

describe('backoffMs', () => {
  it('doubles from a minute and stops at an hour', () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => backoffMs(n) / 60_000)).toEqual([1, 2, 4, 8, 16, 60])
  })
})

describe('decide — the gate before anything is sent', () => {
  const r = recipientFor(row(), person(), 'POOL_ACTIVITY')
  it('sends on both channels to a member with an address and a device', () => {
    expect(decide(row(), welcome, r, false)).toEqual({ email: 'send', push: 'send' })
  })
  it('honours an email switch turned off for this category', () => {
    const off = recipientFor(row(), person({ emailOff: new Set(['POOL_ACTIVITY']) }), 'POOL_ACTIVITY')
    expect(decide(row(), welcome, off, false)).toEqual({ email: 'skipped:opted_out', push: 'send' })
  })
  it('honours a push switch turned off for this category, and only that category', () => {
    const off = person({ pushOff: new Set(['PREDICTIONS']) })
    expect(decide(row(), welcome, recipientFor(row(), off, 'PREDICTIONS'), false).push).toBe('skipped:opted_out')
    expect(decide(row(), welcome, recipientFor(row(), off, 'POOL_ACTIVITY'), false).push).toBe('send')
  })
  it('lets a transactional kind through a switch that is off', () => {
    const off = recipientFor(row(), person({ emailOff: new Set(['POOL_ACTIVITY']) }), 'POOL_ACTIVITY')
    expect(decide(row(), welcome, off, true).email).toBe('send')
  })
  it('records why a channel could not be used', () => {
    const nobody = recipientFor(row(), person({ address: null, hasDevice: false }), 'POOL_ACTIVITY')
    expect(decide(row(), welcome, nobody, false)).toEqual({ email: 'skipped:no_address', push: 'skipped:no_device' })
  })
  it('passes a composer\'s refusal to every channel', () => {
    expect(decide(row(), { skip: 'no_longer_true' }, r, false)).toEqual({ email: 'skipped:no_longer_true', push: 'skipped:no_longer_true' })
  })
  it('leaves out a channel that already finished, and one the row does not use', () => {
    expect(decide(row({ email_status: 'sent' }), welcome, r, false)).toEqual({ push: 'send' })
    expect(decide(row({ channels: ['email'] }), welcome, r, false)).toEqual({ email: 'send' })
  })
  it('turns every verdict into a shadow one for a shadow row', () => {
    const off = recipientFor(row(), person({ emailOff: new Set(['POOL_ACTIVITY']) }), 'POOL_ACTIVITY')
    expect(decide(row({ shadow: true }), welcome, off, false)).toEqual({ email: 'shadow:opted_out', push: 'shadow:would_send' })
  })
  it('gives an address-only row no device and no switches', () => {
    const addressOnly = row({ user_id: null, to_email: 'new@example.com', channels: ['email'] })
    expect(recipientFor(addressOnly, undefined, 'POOL_ACTIVITY')).toEqual({ address: 'new@example.com', emailOptedOut: false, pushOptedOut: false, hasDevice: false })
  })
})

// =============================================================
// dispatch, end to end, against fakes
// =============================================================

function harness(rows: OutboxRow[], opts: { person?: Person; transactional?: boolean; emailOk?: boolean[]; pushResult?: { sent: number; total: number } } = {}) {
  const store = new Map(rows.map((r) => [r.outbox_id, { ...r }]))
  const emails: Array<{ to: string; idempotencyKey: string; topicId: string | undefined }> = []
  const pushes: string[] = []
  const recordedAs: unknown[] = []
  const pauses: number[] = []
  const emailOk = [...(opts.emailOk ?? [])]
  const deps: DispatchDeps = {
    claim: async (_limit, ids) => [...store.values()]
      .filter((r) => r.email_status === null || r.email_status === 'failed' || r.push_status === null || r.push_status === 'failed')
      .filter((r) => !ids || ids.includes(r.outbox_id))
      .map((r) => ({ ...r, attempts: r.attempts + 1 })),
    registry: async (types) => new Map(types.map((t) => [t, { category: 'POOL_ACTIVITY' as const, is_transactional: opts.transactional ?? false }])),
    people: async (ids) => new Map(ids.map((id) => [id, opts.person ?? person()])),
    sendEmail: async ({ to, idempotencyKey, topicId, recordAs }) => {
      emails.push({ to, idempotencyKey, topicId })
      recordedAs.push({ channel: 'email', ...recordAs })
      return emailOk.length ? (emailOk.shift() ? { ok: true } : { ok: false, error: 'rate_limit_exceeded' }) : { ok: true }
    },
    sendPush: async (userId, _push, kind, context) => {
      pushes.push(userId)
      recordedAs.push({ channel: 'push', kind, ...context })
      return opts.pushResult ?? { sent: 1, total: 1 }
    },
    record: async (id, s: Settlement) => {
      const r = store.get(id)!
      store.set(id, { ...r, email_status: s.email_status, push_status: s.push_status, attempts: r.attempts + 1 })
    },
    pause: async (ms) => { pauses.push(ms) },
    now: () => NOW,
  }
  return { deps, store, emails, pushes, pauses, recordedAs }
}

const composeWelcome: Composer = async (_admin, rows) => new Map(rows.map((r) => [r.outbox_id, welcome]))
const admin = {} as never

describe('dispatch', () => {
  it('sends each channel once, with a per-row idempotency key and the category\'s topic', async () => {
    const h = harness([row()])
    const s = await dispatch(admin, { pool_welcome: composeWelcome }, {}, h.deps)
    expect(s).toMatchObject({ claimed: 1, sent: 1 })
    expect(h.emails).toEqual([{ to: 'member@example.com', idempotencyKey: 'outbox/1/welcome', topicId: 'topic-pool' }])
    expect(h.pushes).toEqual(['u1'])
  })

  it('tells both transports which outbox row and pool it is, for the delivery record', async () => {
    const h = harness([row({ outbox_id: 9 })])
    await dispatch(admin, { pool_welcome: composeWelcome }, {}, h.deps)
    expect(h.recordedAs).toEqual([
      { channel: 'email', userId: 'u1', poolId: 'p1', outboxId: 9 },
      { channel: 'push', kind: 'pool_welcome', outboxId: 9, poolId: 'p1' },
    ])
  })

  it('retries ONLY the channel that failed — the push is not sent twice', async () => {
    const h = harness([row()], { emailOk: [false, true] })
    const first = await dispatch(admin, { pool_welcome: composeWelcome }, {}, h.deps)
    expect(first).toMatchObject({ retrying: 1 })
    expect(h.store.get(1)).toMatchObject({ email_status: 'failed', push_status: 'sent' })

    const second = await dispatch(admin, { pool_welcome: composeWelcome }, {}, h.deps)
    expect(second).toMatchObject({ sent: 1 })
    expect(h.pushes).toEqual(['u1'])
    // The retried email reuses its key, so Resend would collapse a duplicate.
    expect(h.emails.map((e) => e.idempotencyKey)).toEqual(['outbox/1/welcome', 'outbox/1/welcome'])
  })

  it('sends nothing for a shadow row, and records what it would have done', async () => {
    const h = harness([row({ shadow: true, dedup_key: 'shadow:pool_welcome:p1:u1' })])
    const s = await dispatch(admin, { pool_welcome: composeWelcome }, {}, h.deps)
    expect(s).toMatchObject({ shadow: 1, sent: 0 })
    expect(h.emails).toEqual([])
    expect(h.pushes).toEqual([])
    expect(h.store.get(1)).toMatchObject({ email_status: 'shadow:would_send', push_status: 'shadow:would_send' })
  })

  it('sends nothing to a member whose switch is off, and says so', async () => {
    const h = harness([row()], { person: person({ emailOff: new Set(['POOL_ACTIVITY']), pushOff: new Set(['POOL_ACTIVITY']) }) })
    const s = await dispatch(admin, { pool_welcome: composeWelcome }, {}, h.deps)
    expect(s).toMatchObject({ skipped: 1 })
    expect(h.emails).toEqual([])
    expect(h.pushes).toEqual([])
  })

  it('sends a transactional kind with no topic, so no unsubscribe can swallow it', async () => {
    const h = harness([row({ type_key: 'crew_invite_email', user_id: null, to_email: 'new@example.com', channels: ['email'] })], { transactional: true })
    await dispatch(admin, { crew_invite_email: composeWelcome }, {}, h.deps)
    expect(h.emails).toEqual([{ to: 'new@example.com', idempotencyKey: 'outbox/1/welcome', topicId: undefined }])
  })

  it('fails a kind with no composer at once — retrying cannot write the code', async () => {
    const h = harness([row({ type_key: 'member_removed' })])
    expect(await dispatch(admin, {}, {}, h.deps)).toMatchObject({ failed: 1 })
  })

  it('retries, not fails, when composing throws — a read can fail and then succeed', async () => {
    const h = harness([row()])
    const flaky: Composer = async () => { throw new Error('read timed out') }
    expect(await dispatch(admin, { pool_welcome: flaky }, {}, h.deps)).toMatchObject({ retrying: 1, failed: 0 })
  })

  it('paces emails to stay under Resend\'s two requests a second', async () => {
    const h = harness([row(), row({ outbox_id: 2, user_id: 'u2', dedup_key: 'pool_welcome:p1:u2' })])
    await dispatch(admin, { pool_welcome: composeWelcome }, {}, h.deps)
    expect(h.emails).toHaveLength(2)
    expect(h.pauses).toEqual([550])
  })

  it('counts a push no device accepted as failed, and one with no devices as skipped', async () => {
    const rejected = harness([row({ channels: ['push'] })], { pushResult: { sent: 0, total: 2 } })
    await dispatch(admin, { pool_welcome: composeWelcome }, {}, rejected.deps)
    expect(rejected.store.get(1)!.push_status).toBe('failed')

    const gone = harness([row({ channels: ['push'] })], { pushResult: { sent: 0, total: 0 } })
    await dispatch(admin, { pool_welcome: composeWelcome }, {}, gone.deps)
    expect(gone.store.get(1)!.push_status).toBe('skipped:no_device')
  })
})
