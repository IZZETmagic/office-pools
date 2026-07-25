// =============================================================
// Pool status display — unit tests
// =============================================================
// Extraction of join-ability out of `pools.status`
//   (drafts/2026-07-25_pool_status_display_audit.md, migration 025).
//
// The properties under test:
//   1. Lifecycle and join-ability are independent — neither leaks into the
//      other. This is the whole point of the refactor.
//   2. A raw lowercase DB value can never reach the user as a label.
// Pure functions only — no DB, no network.

import { describe, it, expect } from 'vitest'
import {
  poolStatusDisplay,
  poolJoinability,
  isPoolFinished,
  poolStatusSortRank,
  toneToBadgeVariant,
  toneToTagClass,
  type PoolStatusTone,
} from '../poolStatus'

describe('poolStatusDisplay — lifecycle without a tournament phase', () => {
  it('labels an open pool "Open"', () => {
    expect(poolStatusDisplay({ status: 'open' })).toEqual({ label: 'Open', tone: 'green' })
  })

  it('labels a completed pool "Completed"', () => {
    expect(poolStatusDisplay({ status: 'completed' })).toEqual({
      label: 'Completed',
      tone: 'neutral',
    })
  })

  it('treats the legacy "active" alias as open', () => {
    expect(poolStatusDisplay({ status: 'active' })).toEqual({ label: 'Open', tone: 'green' })
  })

  it('defaults a null status to open rather than rendering nothing', () => {
    expect(poolStatusDisplay({ status: null })).toEqual({ label: 'Open', tone: 'green' })
  })
})

describe('poolStatusDisplay — refined by tournament phase', () => {
  it('says "In Progress" while the tournament is running', () => {
    expect(poolStatusDisplay({ status: 'open' }, 'running')).toEqual({
      label: 'In Progress',
      tone: 'amber',
    })
  })

  it('says "Final" once the tournament has finished but the pool has not been retired', () => {
    expect(poolStatusDisplay({ status: 'open' }, 'finished')).toEqual({
      label: 'Final',
      tone: 'blue',
    })
  })

  it('says "Open" before the tournament starts', () => {
    expect(poolStatusDisplay({ status: 'open' }, 'not_started')).toEqual({
      label: 'Open',
      tone: 'green',
    })
  })

  it('lets an explicitly completed pool win over a still-running feed', () => {
    // Guards the auto-archive window: an admin who marks the pool complete
    // early must not see it flip back to "In Progress".
    expect(poolStatusDisplay({ status: 'completed' }, 'running')).toEqual({
      label: 'Completed',
      tone: 'neutral',
    })
  })
})

describe('poolStatusDisplay — join-ability never leaks into the badge', () => {
  it('shows a non-accepting pool as Open, because to a member it still is', () => {
    expect(poolStatusDisplay({ status: 'open', accepting_members: false })).toEqual({
      label: 'Open',
      tone: 'green',
    })
  })

  it('produces an identical badge regardless of accepting_members', () => {
    const open = poolStatusDisplay({ status: 'open', accepting_members: true })
    const shut = poolStatusDisplay({ status: 'open', accepting_members: false })
    expect(open).toEqual(shut)
  })
})

describe('poolStatusDisplay — no raw DB value ever reaches the user', () => {
  it('maps the never-written "upcoming" value instead of echoing it', () => {
    expect(poolStatusDisplay({ status: 'upcoming' })).toEqual({
      label: 'Upcoming',
      tone: 'blue',
    })
  })

  it('falls back to a real label for an unrecognised value', () => {
    const { label } = poolStatusDisplay({ status: 'archived' })
    expect(label).toBe('Open')
    expect(label).not.toBe('archived')
  })

  it('never returns a lowercase label', () => {
    for (const status of ['open', 'active', 'completed', 'upcoming', 'closed', 'nonsense']) {
      const { label } = poolStatusDisplay({ status })
      expect(label[0]).toBe(label[0].toUpperCase())
    }
  })
})

describe('poolJoinability', () => {
  it('allows joining an open pool that accepts members', () => {
    expect(poolJoinability({ status: 'open', accepting_members: true })).toEqual({
      canJoin: true,
      reason: null,
    })
  })

  it('blocks joining when the pool has stopped accepting members', () => {
    const { canJoin, reason } = poolJoinability({ status: 'open', accepting_members: false })
    expect(canJoin).toBe(false)
    expect(reason).toBe('This pool is not accepting new members.')
  })

  it('blocks joining a completed pool, with distinct copy', () => {
    const { canJoin, reason } = poolJoinability({ status: 'completed', accepting_members: true })
    expect(canJoin).toBe(false)
    expect(reason).toBe('This pool has finished.')
  })

  it('treats a missing accepting_members as true, not false', () => {
    // Pre-migration rows and partial selects must not read as closed.
    expect(poolJoinability({ status: 'open' }).canJoin).toBe(true)
    expect(poolJoinability({ status: 'open', accepting_members: null }).canJoin).toBe(true)
  })

  it('reports the lifecycle reason first when a completed pool also refuses joiners', () => {
    expect(poolJoinability({ status: 'completed', accepting_members: false }).reason).toBe(
      'This pool has finished.',
    )
  })
})

describe('isPoolFinished', () => {
  it('is true for a completed pool', () => {
    expect(isPoolFinished({ status: 'completed' })).toBe(true)
  })

  it('is false for an open pool with no phase given', () => {
    expect(isPoolFinished({ status: 'open' })).toBe(false)
  })

  it('is true for an open pool once the tournament has finished', () => {
    // The auto-archive window: matches are done, the pool has not been retired
    // yet, and the card should already read "final standings".
    expect(isPoolFinished({ status: 'open' }, 'finished')).toBe(true)
  })

  it('is false while the tournament is still running', () => {
    expect(isPoolFinished({ status: 'open' }, 'running')).toBe(false)
  })

  it('is not affected by join-ability', () => {
    expect(isPoolFinished({ status: 'open', accepting_members: false })).toBe(false)
  })

  it('treats the retired "archived" value as not-finished rather than crashing', () => {
    // Nothing writes 'archived' and migration 025b forbids it; this pins the
    // behaviour so a stray legacy row cannot silently read as finished.
    expect(isPoolFinished({ status: 'archived' })).toBe(false)
  })
})

describe('poolStatusSortRank', () => {
  it('ranks live pools ahead of completed ones', () => {
    expect(poolStatusSortRank({ status: 'open' })).toBeLessThan(
      poolStatusSortRank({ status: 'completed' }),
    )
  })

  it('ranks the "active" alias identically to open', () => {
    expect(poolStatusSortRank({ status: 'active' })).toBe(poolStatusSortRank({ status: 'open' }))
  })

  it('sinks unrecognised values to the bottom', () => {
    expect(poolStatusSortRank({ status: 'nonsense' })).toBeGreaterThan(
      poolStatusSortRank({ status: 'completed' }),
    )
  })
})

describe('rendering adapters cover every tone', () => {
  const tones: PoolStatusTone[] = ['green', 'amber', 'blue', 'neutral']

  it('maps every tone to a badge variant', () => {
    for (const tone of tones) expect(toneToBadgeVariant(tone)).toBeTruthy()
  })

  it('maps every tone to non-empty tag classes', () => {
    for (const tone of tones) expect(toneToTagClass(tone).length).toBeGreaterThan(0)
  })

  it('gives each tone a distinct tag class', () => {
    const classes = tones.map(toneToTagClass)
    expect(new Set(classes).size).toBe(tones.length)
  })
})
