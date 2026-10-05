import { describe, it, expect } from 'vitest'
import { emailPreferencesFrom, topicIdToKey, topicChangesFrom, newerThanStored } from './preferences'

const IDS = {
  POOL_ACTIVITY: 't-pool',
  PREDICTIONS: 't-pred',
  MATCH_RESULTS: 't-match',
  LEADERBOARD: 't-board',
  ADMIN: 't-admin',
  COMMUNITY: 't-comm',
}
const idToKey = topicIdToKey(IDS)

describe('emailPreferencesFrom — a missing row means subscribed', () => {
  it('is all on with no rows', () => {
    expect(Object.values(emailPreferencesFrom([]))).toEqual([true, true, true, true, true, true])
  })
  it('turns off only what a row turns off', () => {
    const p = emailPreferencesFrom([{ category: 'MATCH_RESULTS', channel: 'email', enabled: false }])
    expect(p.MATCH_RESULTS).toBe(false)
    expect(p.PREDICTIONS).toBe(true)
  })
  it('ignores a push row — the same category on another channel is a different choice', () => {
    expect(emailPreferencesFrom([{ category: 'MATCH_RESULTS', channel: 'push', enabled: false }]).MATCH_RESULTS).toBe(true)
  })
  it('ignores a category email has no topic for', () => {
    const p = emailPreferencesFrom([{ category: 'GAMIFICATION', channel: 'email', enabled: false }])
    expect(Object.keys(p)).not.toContain('GAMIFICATION')
  })
})

describe('topicChangesFrom — a verified contact.topics.updated event', () => {
  const event = (over: Record<string, unknown> = {}) => ({
    type: 'contact.topics.updated',
    created_at: '2026-10-05T12:00:00.000Z',
    data: { email: 'Member@Example.com ', topics: [{ id: 't-match', subscription: 'opt_out' }] },
    ...over,
  })

  it('reads a footer unsubscribe as that topic turned off, for a lower-cased address', () => {
    expect(topicChangesFrom(event(), idToKey)).toEqual({
      email: 'member@example.com',
      at: '2026-10-05T12:00:00.000Z',
      changes: [{ key: 'MATCH_RESULTS', enabled: false }],
    })
  })
  it('reads opt_in as on', () => {
    const r = topicChangesFrom(event({ data: { email: 'a@b.co', topics: [{ id: 't-pred', subscription: 'opt_in' }] } }), idToKey)
    expect(r?.changes).toEqual([{ key: 'PREDICTIONS', enabled: true }])
  })
  it('drops a topic it does not know rather than guessing', () => {
    const r = topicChangesFrom(event({ data: { email: 'a@b.co', topics: [{ id: 't-unknown', subscription: 'opt_out' }] } }), idToKey)
    expect(r?.changes).toEqual([])
  })
  it('drops a subscription value it does not recognise', () => {
    const r = topicChangesFrom(event({ data: { email: 'a@b.co', topics: [{ id: 't-match', subscription: 'maybe' }] } }), idToKey)
    expect(r?.changes).toEqual([])
  })
  it('ignores every other event type', () => {
    expect(topicChangesFrom(event({ type: 'contact.updated' }), idToKey)).toBeNull()
    expect(topicChangesFrom(event({ type: 'email.delivered' }), idToKey)).toBeNull()
  })
  it('refuses a malformed payload instead of half-reading it', () => {
    expect(topicChangesFrom(null, idToKey)).toBeNull()
    expect(topicChangesFrom(event({ data: { topics: [] } }), idToKey)).toBeNull()
    expect(topicChangesFrom(event({ data: { email: 'a@b.co', topics: 'nope' } }), idToKey)).toBeNull()
  })
  it('keeps a missing timestamp as null rather than inventing one', () => {
    expect(topicChangesFrom(event({ created_at: 'not a date' }), idToKey)?.at).toBeNull()
  })
})

describe('newerThanStored — a late, retried event cannot overwrite a newer choice', () => {
  const changes = [{ key: 'MATCH_RESULTS' as const, enabled: false }]
  it('applies when nothing is stored', () => {
    expect(newerThanStored(changes, '2026-10-05T12:00:00Z', [])).toEqual(changes)
  })
  it('applies an event newer than the stored row', () => {
    expect(newerThanStored(changes, '2026-10-05T12:00:00Z', [{ category: 'MATCH_RESULTS', updated_at: '2026-10-05T11:00:00Z' }])).toEqual(changes)
  })
  it('DROPS an event older than the stored row — the out-of-order retry', () => {
    expect(newerThanStored(changes, '2026-10-05T10:00:00Z', [{ category: 'MATCH_RESULTS', updated_at: '2026-10-05T11:00:00Z' }])).toEqual([])
  })
  it('applies an event with no timestamp, since it cannot be ordered', () => {
    expect(newerThanStored(changes, null, [{ category: 'MATCH_RESULTS', updated_at: '2099-01-01T00:00:00Z' }])).toEqual(changes)
  })
})
