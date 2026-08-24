import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  TIER_OFFERS,
  FREE_TIER_MEMBER_CAP,
  FREE_TIER_ENTRY_CAP,
} from '@/lib/paddle/tiers'

// Drift guard: the TypeScript copies of the tier caps against the SQL that
// actually enforces them.
//
// The numbers live in two places on purpose — the database enforces them
// (migration 075), the UI displays them (lib/paddle/tiers.ts). Two copies of a
// number drift, and the failure mode is quiet and bad: the pricing page
// advertises 30 members while the database cuts people off at 10, and the
// admin who paid finds out from an angry teammate.
//
// So this test reads the migration and asserts they agree. It is deliberately
// crude — a regex over SQL — because the alternative is a live database
// connection, which the vitest harness explicitly does not do ("No real DB, no
// network", vitest.config.ts).
//
// If migration 075 is ever renamed or superseded, this test fails loudly rather
// than silently passing over a file it can no longer find. That is intended.

const MIGRATION = path.join(process.cwd(), 'lib/migrations/075_free_tier_caps.sql')

function capsFromSql(fnName: string): Record<string, number | null> {
  const sql = readFileSync(MIGRATION, 'utf8')

  const fnStart = sql.indexOf(`FUNCTION public.${fnName}(p_tier text)`)
  if (fnStart === -1) throw new Error(`${fnName} not found in ${MIGRATION}`)
  const body = sql.slice(fnStart, sql.indexOf('$$;', fnStart))

  const caps: Record<string, number | null> = {}
  for (const [, tier, value] of body.matchAll(/WHEN\s+'(\w+)'\s+THEN\s+(\d+)/g)) {
    caps[tier] = Number(value)
  }
  // Anything not listed falls through the ELSE to NULL = unlimited.
  for (const tier of ['free', 'plus', 'max', 'ultra']) {
    if (!(tier in caps)) caps[tier] = null
  }
  return caps
}

describe('tier caps match the SQL that enforces them', () => {
  const sqlMemberCaps = capsFromSql('pool_tier_member_cap')
  const sqlEntryCaps = capsFromSql('pool_tier_entry_cap')

  it('parses the migration at all', () => {
    // Guards the guard: a regex that matched nothing would make every
    // assertion below vacuously pass against a wall of nulls.
    expect(sqlMemberCaps.free).toBeTypeOf('number')
    expect(sqlEntryCaps.free).toBeTypeOf('number')
  })

  it('agrees on the free tier', () => {
    expect(FREE_TIER_MEMBER_CAP).toBe(sqlMemberCaps.free)
    expect(FREE_TIER_ENTRY_CAP).toBe(sqlEntryCaps.free)
  })

  it.each(TIER_OFFERS.map(o => [o.tier, o] as const))(
    'agrees on the %s tier',
    (tier, offer) => {
      expect(offer.memberCap).toBe(sqlMemberCaps[tier])
      expect(offer.entryCap).toBe(sqlEntryCaps[tier])
    },
  )

  it('treats max and ultra as unlimited in both places', () => {
    expect(sqlMemberCaps.max).toBeNull()
    expect(sqlMemberCaps.ultra).toBeNull()
    expect(TIER_OFFERS.find(o => o.tier === 'max')?.memberCap).toBeNull()
    expect(TIER_OFFERS.find(o => o.tier === 'ultra')?.memberCap).toBeNull()
  })

  it('never lets a paid tier be more restrictive than free', () => {
    for (const offer of TIER_OFFERS) {
      if (offer.memberCap !== null) expect(offer.memberCap).toBeGreaterThan(FREE_TIER_MEMBER_CAP)
      if (offer.entryCap !== null) expect(offer.entryCap).toBeGreaterThan(FREE_TIER_ENTRY_CAP)
    }
  })
})

describe('the migration carries the guard rails it claims to', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('adds tier_enforced_from WITHOUT a default, then sets one', () => {
    // The ordering IS the grandfather clause. A single
    // `ADD COLUMN ... DEFAULT now()` backfills every existing row and caps the
    // entire customer base on apply — the one mistake in this file that
    // cannot be walked back quietly.
    const addColumn = sql.match(/ADD COLUMN IF NOT EXISTS tier_enforced_from timestamptz[^;]*/)?.[0] ?? ''
    expect(addColumn).not.toMatch(/DEFAULT/)
    expect(sql).toMatch(/ALTER COLUMN tier_enforced_from SET DEFAULT now\(\)/)
  })

  it('exempts grandfathered pools in both triggers', () => {
    const exemptions = sql.match(/v_enforced IS NULL/g) ?? []
    expect(exemptions.length).toBeGreaterThanOrEqual(2)
  })

  it('locks the pool row so concurrent joins cannot both win the last slot', () => {
    expect(sql).toMatch(/FOR UPDATE/)
  })

  it('uses distinct SQLSTATEs the API can branch on', () => {
    expect(sql).toMatch(/ERRCODE = 'SP010'/)
    expect(sql).toMatch(/ERRCODE = 'SP011'/)
  })
})
