// =============================================================
// Soft deletion — the four doors must never destroy an entry.
// =============================================================
// This file exists because of a measured production fact, not a theory:
//
//   `pool_entries` is the parent of twelve ON DELETE CASCADE children —
//   predictions, league_predictions, league_entry_totals, league_match_scores,
//   match_scores, bonus_scores, badge_unlocks, entry_xp_state, point_adjustments,
//   entry_round_submissions and the bracket_picker_* tables. Deleting one row
//   erased an entire season with no undo, and that is what produced the World
//   Cup complaints about members who were removed by accident and could not be
//   put back.
//
// So the assertions below are all of the same shape: **no DELETE is issued.**
// A helper that "worked" but deleted is the exact failure this replaces.
// =============================================================

import { describe, it, expect } from 'vitest'
import { retireEntries, restoreEntriesForMember } from '@/lib/entries/retire'

type EntryRow = {
  entry_id: string
  member_id: string | null
  pool_id: string | null
  user_id: string | null
  retired_at: string | null
  retired_reason: string | null
  retired_by: string | null
}

/**
 * Stub that records every DELETE it is asked to perform, so a test can assert
 * none happened, and applies UPDATEs to an in-memory table so a test can read
 * the resulting state back.
 */
function fakeDb(rows: EntryRow[]) {
  const table = new Map(rows.map((r) => [r.entry_id, { ...r }]))
  const deletes: string[] = []

  // Every pool the code asked to have its Showdown fixture list rebuilt.
  // Recorded rather than stubbed silently: "a retired member leaves the fixture
  // list" is real behaviour, and a fake that swallowed the call would let it
  // regress without a test noticing.
  const scheduled: string[] = []

  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn === 'league_generate_duel_schedule') scheduled.push(args.p_pool_id as string)
      return Promise.resolve({ data: { written: 0 }, error: null })
    },
    from(name: string) {
      const filters: Array<(r: EntryRow) => boolean> = []
      let patch: Partial<EntryRow> | null = null

      const api: Record<string, unknown> = {}

      api.update = (p: Partial<EntryRow>) => { patch = p; return api }
      api.delete = () => { deletes.push(name); return api }
      api.select = () => api

      api.eq = (col: keyof EntryRow, val: unknown) => {
        filters.push((r) => r[col] === val)
        return api
      }
      api.is = (col: keyof EntryRow, val: unknown) => {
        filters.push((r) => r[col] === val)
        return api
      }
      api.in = (col: keyof EntryRow, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col] as unknown))
        return api
      }
      // Only the one shape the helper uses: detached OR retired.
      api.or = () => {
        filters.push((r) => r.member_id === null || r.retired_at !== null)
        return api
      }

      const run = () => {
        const matched = [...table.values()].filter((r) => filters.every((f) => f(r)))
        if (patch) for (const r of matched) Object.assign(table.get(r.entry_id)!, patch)
        return { data: matched.map((r) => ({ ...r })), error: null }
      }

      // Awaiting the builder runs it — same as postgrest-js.
      api.then = (resolve: (v: { data: EntryRow[]; error: null }) => unknown) => resolve(run())
      return api
    },
  }

  return { client: client as never, table, deletes, scheduled }
}

const ENTRY = (over: Partial<EntryRow> = {}): EntryRow => ({
  entry_id: 'e1',
  member_id: 'm1',
  pool_id: 'p1',
  user_id: 'u1',
  retired_at: null,
  retired_reason: null,
  retired_by: null,
  ...over,
})

describe('retireEntries', () => {
  it('never issues a DELETE — the whole point', async () => {
    const db = fakeDb([ENTRY()])
    await retireEntries(db.client, { entryIds: ['e1'] }, 'removed', 'admin-1')
    expect(db.deletes).toEqual([])

    // The fixture list must forget them. A Showdown schedule that still names
    // somebody who stopped participating is worse than no schedule — it puts a
    // duel on the board that nobody can play.
    expect(db.scheduled).toContain('p1')
  })

  it('flags the entry instead of removing it, and records who and why', async () => {
    const db = fakeDb([ENTRY()])
    const res = await retireEntries(db.client, { entryIds: ['e1'] }, 'removed', 'admin-1')

    expect(res.retired).toBe(1)
    const row = db.table.get('e1')!
    expect(row.retired_at).not.toBeNull()
    expect(row.retired_reason).toBe('removed')
    expect(row.retired_by).toBe('admin-1')
    // The entry itself survives, still attached to its member.
    expect(row.member_id).toBe('m1')
  })

  it('is idempotent — a second call does not rewrite when they left', async () => {
    const db = fakeDb([ENTRY()])
    await retireEntries(db.client, { entryIds: ['e1'] }, 'left', 'u1')
    const first = db.table.get('e1')!.retired_at

    await retireEntries(db.client, { entryIds: ['e1'] }, 'removed', 'admin-9')
    const row = db.table.get('e1')!

    expect(row.retired_at).toBe(first)
    expect(row.retired_reason).toBe('left') // original reason preserved
    expect(row.retired_by).toBe('u1')
  })

  it('retires every entry a member holds when the member is the target', async () => {
    const db = fakeDb([
      ENTRY({ entry_id: 'e1' }),
      ENTRY({ entry_id: 'e2' }),
      ENTRY({ entry_id: 'e3', member_id: 'm2' }), // someone else — must not be touched
    ])
    const res = await retireEntries(db.client, { memberIds: ['m1'] }, 'left', 'u1')

    expect(res.retired).toBe(2)
    expect(db.table.get('e3')!.retired_at).toBeNull()
  })

  it('does nothing, safely, when given no target', async () => {
    const db = fakeDb([ENTRY()])
    const res = await retireEntries(db.client, {}, 'left', 'u1')

    expect(res.retired).toBe(0)
    expect(db.deletes).toEqual([])
    expect(db.table.get('e1')!.retired_at).toBeNull()
  })
})

describe('restoreEntriesForMember', () => {
  it('reunites a DETACHED entry with a rejoining member', async () => {
    // What leaving looks like once migration 056 lands: the membership row is
    // gone, so the FK set member_id to NULL and the entry survived.
    const db = fakeDb([ENTRY({ member_id: null, retired_at: '2026-08-01T00:00:00Z', retired_reason: 'left' })])

    const res = await restoreEntriesForMember(db.client, {
      poolId: 'p1',
      userId: 'u1',
      memberId: 'm-new',
    })

    expect(res.restored).toBe(1)
    const row = db.table.get('e1')!
    expect(row.member_id).toBe('m-new')
    expect(row.retired_at).toBeNull()
    expect(row.retired_reason).toBeNull()
  })

  it('reinstates an entry that merely stopped participating', async () => {
    const db = fakeDb([ENTRY({ retired_at: '2026-08-01T00:00:00Z', retired_reason: 'stopped' })])

    const res = await restoreEntriesForMember(db.client, { poolId: 'p1', userId: 'u1', memberId: 'm1' })

    expect(res.restored).toBe(1)
    expect(db.table.get('e1')!.retired_at).toBeNull()
  })

  it('does not resurrect an entry belonging to a different person', async () => {
    const db = fakeDb([ENTRY({ member_id: null, user_id: 'someone-else', retired_at: '2026-08-01T00:00:00Z', retired_reason: 'left' })])

    const res = await restoreEntriesForMember(db.client, { poolId: 'p1', userId: 'u1', memberId: 'm-new' })

    expect(res.restored).toBe(0)
    expect(db.table.get('e1')!.member_id).toBeNull()
  })

  it('does not reach into another pool', async () => {
    const db = fakeDb([ENTRY({ member_id: null, pool_id: 'other-pool', retired_at: '2026-08-01T00:00:00Z', retired_reason: 'left' })])

    const res = await restoreEntriesForMember(db.client, { poolId: 'p1', userId: 'u1', memberId: 'm-new' })

    expect(res.restored).toBe(0)
  })

  it('reports nothing to restore for a genuinely new member', async () => {
    const db = fakeDb([])
    const res = await restoreEntriesForMember(db.client, { poolId: 'p1', userId: 'u1', memberId: 'm-new' })

    // The join route relies on this being 0 to decide it should create a fresh
    // entry — a false positive here would leave a new member with none.
    expect(res.restored).toBe(0)
    expect(res.error).toBeNull()
  })

  it('leaves an active entry alone', async () => {
    const db = fakeDb([ENTRY()])
    const res = await restoreEntriesForMember(db.client, { poolId: 'p1', userId: 'u1', memberId: 'm1' })

    expect(res.restored).toBe(0)
  })
})
