// =============================================================
// The duel recap: shown once, and honest about a bye
// =============================================================
// The recap is hard to exercise in a browser — it needs a settled duel and a
// member who has not seen it, and both are one-shot. So the rules that would
// break silently are asserted here instead.
//
// Three of them, each with a real failure behind it:
//
//  1. The seen-marker is a TIMESTAMP, not a matchweek number. Rounds are played
//     out of numerical order (101: a minimum gap of minus 121 days), so a
//     `last_recap_seen_matchweek >= n` high-water mark would silently stop a
//     member ever being shown another recap.
//
//  2. A bye is detected STRUCTURALLY. It pays DUEL_BYE, which IS DUEL_TIE, so
//     reading the points would tell a member they tied a duel they never had.
//
//  3. The write happens on DISMISS, not on open. `has_seen_how_to_play` writes
//     on mount, which is right when the modal is the page and wrong here: a
//     member who closes the tab mid-animation would have "seen" a result they
//     never read.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { DUEL_BYE, DUEL_TIE, duelResult } from '@/lib/league/duelPoints'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const migration = read('lib/migrations/122_the_duel_recap_is_shown_once.sql')
/**
 * The migration with its `--` commentary removed.
 *
 * ⚠ Needed because 122's header NAMES the design it rejected
 * (`last_recap_seen_matchweek`) in order to explain why, and the first version
 * of the check below failed on that sentence. A banned-string check that cannot
 * tell a rejection from a use teaches people to stop writing the explanation —
 * the same trap the `t-display` and copy guards each had to be taught.
 */
const migrationSql = migration
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const sheet = read('app/pools/[pool_id]/DuelRecapSheet.tsx')
const page = read('app/pools/[pool_id]/page.tsx')
const detail = read('app/pools/[pool_id]/PoolDetail.tsx')

describe('the seen-marker is a timestamp, not a matchweek number', () => {
  it('migration 122 adds a timestamptz', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS last_recap_seen_at timestamptz/)
  })

  it('and never an integer matchweek high-water mark', () => {
    expect(migrationSql, 'a matchweek-number marker cannot survive out-of-order rounds')
      .not.toMatch(/last_recap_seen_matchweek/)
  })

  it('the server compares SETTLED_AT, not matchweek_number', () => {
    // The ordering that decides which recap is owed.
    expect(page).toMatch(/b\.settled_at!\.localeCompare\(a\.settled_at!\)/)
    expect(page).toMatch(/d\.settled_at! <= seen/)
  })

  it('the migration backfills, so an established pool does not recap old news', () => {
    expect(migration).toMatch(/SET last_recap_seen_at = now\(\)/)
    expect(migration).toMatch(/settled_at IS NOT NULL/)
  })
})

describe('a bye is never mistaken for a tie', () => {
  it('the two values really are identical, which is why this matters', () => {
    expect(DUEL_BYE).toBe(DUEL_TIE)
    // Proof that reading the points cannot separate them.
    expect(duelResult(DUEL_BYE)).toBe('tied')
  })

  it('the sheet branches on `them === null`, before it reads the points', () => {
    const byeIdx = sheet.indexOf('const bye = recap.them === null')
    const outcomeIdx = sheet.indexOf('const outcome =')
    expect(byeIdx, 'the bye test is missing').toBeGreaterThan(-1)
    expect(outcomeIdx).toBeGreaterThan(byeIdx)
    // …and the points are only consulted when it is NOT a bye.
    expect(sheet).toMatch(/bye \? 'bye'\s*:\s*duelResult\(recap\.points\)/)
  })

  it('the server sends null for the opponent rather than an empty side', () => {
    expect(page).toMatch(/them: themEntry \? side\(themEntry\) : null/)
  })

  it('the bye copy is the one sentence the other surfaces use', () => {
    // Migration 100 and leagueModeInfo.ts both say this. A fourth phrasing is
    // how the surfaces start disagreeing about one rule.
    expect(sheet).toMatch(/There was no opponent, so there was no defeat/)
  })
})

describe('shown once, and never in the way', () => {
  it('the marker is written on DISMISS, not on mount', () => {
    // If this ever moves into a useEffect, a member who never read the sheet
    // has "seen" it.
    expect(detail).toMatch(/const dismissRecap = useCallback\(\(\) => \{/)
    expect(detail).toMatch(/last_recap_seen_at: new Date\(\)\.toISOString\(\)/)
    const dismissIdx = detail.indexOf('const dismissRecap')
    const updateIdx = detail.indexOf('last_recap_seen_at: new Date()')
    expect(updateIdx).toBeGreaterThan(dismissIdx)
  })

  it('the write logs its error instead of discarding it', () => {
    // A swallowed PostgREST error is a documented way this codebase has lost
    // hours; `has_seen_how_to_play` still throws its result away.
    expect(detail).toMatch(/\.then\(\(\{ error \}\) =>/)
    expect(detail).toMatch(/console\.error\('\[recap\] marking seen failed:'/)
  })

  it('the sheet gates nothing — it renders null and returns', () => {
    // The disclosure gate: the result is on the card, the table and the
    // leaderboard BEHIND this. If dismissing ever cost a member information,
    // this stops being a recap and becomes a reason to come back.
    expect(sheet).toMatch(/if \(!recap\) return null/)
    expect(sheet).toMatch(/onDismiss/)
  })

  it('the sheet takes no data client of its own', () => {
    // Presentational only: no Supabase, no derivation of who won from raw rows.
    expect(sheet, 'the sheet should not fetch').not.toMatch(/createClient|from\(['"]/)
  })
})
