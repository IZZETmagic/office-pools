// =============================================================
// The band bonuses shown to a member must equal the ones they were paid
// =============================================================
// `league_table_breakdown` returns points PER CLUB, and those are only the
// positional half of a table score. The band bonuses — champion, top N, the
// perfect-set bonus, Europa, relegation — are per ENTRY and are most of a good
// table's total. The breakdown modal therefore recomputes them from the
// per-row hit flags.
//
// That is a formula living in two places, which is a real risk and the reason
// for this file. The authority is `league_score_table` (migration 093):
//
//     champion_hit * champ
//   + top_hits     * top_bonus
//   + (top_hits = top_n AND top_n > 0 ? perfect : 0)
//   + releg_hits   * releg_bonus
//   + europa_hits  * eur_bonus
//
// When it drifts, the symptom is a modal that disagrees with the leaderboard —
// which is exactly what shipped first: 700 shown beside a stored 1,240, with
// nothing on screen to account for the difference. A member reading that
// concludes the scoring is broken, and they are right to.
//
// ⚠ These numbers are not invented. They are the real reconciliation run
// against the seeded pool after rescoring, where all five entries matched their
// stored totals exactly.

import { describe, it, expect } from 'vitest'
import { bandBonuses, deltaHeatClass, type TablePrices } from '@/app/pools/[pool_id]/TableBreakdownView'
import type { TableBreakdownRow } from '@/lib/league/table'

/** Migration 093's COALESCE defaults, which is what a pool with no settings row gets. */
const PRICES: TablePrices = {
  exactPoints: 100,
  stepPenalty: 20,
  championBonus: 500,
  topFourBonus: 100,
  perfectTopFourBonus: 250,
  relegationBonus: 100,
  europaBonus: 50,
}

function rows(
  hits: Array<Partial<Pick<TableBreakdownRow, 'champion_hit' | 'top_hit' | 'releg_hit' | 'europa_hit'>>>,
): TableBreakdownRow[] {
  return hits.map((h, i) => ({
    club_id: `c${i}`,
    club_name: `Club ${i}`,
    crest_url: null,
    predicted_position: i + 1,
    actual_position: i + 1,
    delta: 0,
    points: 0,
    champion_hit: false,
    top_hit: false,
    releg_hit: false,
    europa_hit: false,
    is_final: false,
    ...h,
  })) as TableBreakdownRow[]
}

describe('bandBonuses', () => {
  it('reconciles the real seeded pool — IZZETmagic, 700 + 300 = 1000', () => {
    // One top-4 club right, two relegation clubs right, no champion, no Europa.
    const r = rows([{ top_hit: true }, { releg_hit: true }, { releg_hit: true }])
    expect(bandBonuses(r, 4, PRICES).total).toBe(300)
  })

  it('reconciles Sarah C — 480 + 100 = 580', () => {
    expect(bandBonuses(rows([{ releg_hit: true }]), 4, PRICES).total).toBe(100)
  })

  it('pays the perfect-set bonus only when EVERY top place is named', () => {
    const three = rows([{ top_hit: true }, { top_hit: true }, { top_hit: true }])
    expect(bandBonuses(three, 4, PRICES).total).toBe(300) // 3 x 100, no set bonus

    const four = rows([{ top_hit: true }, { top_hit: true }, { top_hit: true }, { top_hit: true }])
    expect(bandBonuses(four, 4, PRICES).total).toBe(650) // 4 x 100 + 250
  })

  it('a champion is paid on top of the top-N hit it also is', () => {
    // Getting first place exactly right is BOTH a champion hit and a top hit,
    // and the engine counts it in both sums. Paying it once would understate
    // the total against the leaderboard.
    const r = rows([{ champion_hit: true, top_hit: true }])
    expect(bandBonuses(r, 4, PRICES).total).toBe(600)
  })

  it('counts Europa hits at their own price', () => {
    expect(bandBonuses(rows([{ europa_hit: true }, { europa_hit: true }]), 4, PRICES).total).toBe(100)
  })

  it('a competition with no top band cannot earn the set bonus', () => {
    // topN 0 with zero hits would satisfy `topHits === topN` on its own — the
    // engine guards with `AND v_top_n > 0` and so must this.
    expect(bandBonuses(rows([]), 0, PRICES).total).toBe(0)
    expect(bandBonuses(rows([]), 0, PRICES).lines).toEqual([])
  })

  it('an entry that hit nothing shows no lines at all', () => {
    const r = rows([{}, {}, {}])
    expect(bandBonuses(r, 4, PRICES).total).toBe(0)
    expect(bandBonuses(r, 4, PRICES).lines).toEqual([])
  })

  it('every line is worth what it says, so the list sums to the total', () => {
    const r = rows([
      { champion_hit: true, top_hit: true }, { top_hit: true }, { top_hit: true }, { top_hit: true },
      { europa_hit: true }, { releg_hit: true },
    ])
    const { lines, total } = bandBonuses(r, 4, PRICES)
    expect(lines.reduce((s, l) => s + l.points, 0)).toBe(total)
    expect(total).toBe(500 + 400 + 250 + 50 + 100)
  })
})

// =============================================================
// The Diff heat scale
// =============================================================
// It used to colour by DIRECTION — a club finishing higher than predicted was
// green, lower was red. That measured the wrong thing: the points are identical
// either way, so a green "▲ 7" sat beside a red "▼ 6" while both earned zero.
//
// The heat now tracks what the member keeps, over the pool's own ladder rather
// than a fixed five, so it agrees with the rungs printed on the Scoring Rules
// tab for any pricing.

describe('deltaHeatClass', () => {
  // Default pricing: 100 a club, 20 a place, so nothing survives 5 out.
  const ZERO_AT = 5

  it('does not care which way you were wrong', () => {
    for (const n of [1, 2, 3, 4, 5, 9]) {
      expect(deltaHeatClass(n, ZERO_AT), `${n} vs -${n}`).toBe(deltaHeatClass(-n, ZERO_AT))
    }
  })

  it('warms up one place at a time, and never cools going out', () => {
    const ramp = [1, 2, 3, 4, 5].map((n) => deltaHeatClass(n, ZERO_AT))
    // Five distinct steps, in order, ending red.
    expect(new Set(ramp).size).toBe(5)
    expect(ramp[0]).toContain('success')
    expect(ramp[4]).toBe('text-danger-600')
  })

  it('everything past the ladder is the same red — six is not worse than sixteen', () => {
    // They are worth the same: nothing. Shading them differently would imply a
    // penalty that does not exist.
    const beyond = [5, 6, 11, 19].map((n) => deltaHeatClass(n, ZERO_AT))
    expect(new Set(beyond).size).toBe(1)
    expect(beyond[0]).toBe('text-danger-600')
  })

  it('runs the ramp over the POOL’s ladder, not a hardcoded five', () => {
    // A pool charging 25 a place zeroes at four, so four must already be red
    // there while it is still amber on the default pricing.
    expect(deltaHeatClass(4, 4)).toBe('text-danger-600')
    expect(deltaHeatClass(4, ZERO_AT)).not.toBe('text-danger-600')
  })

  it('shows no heat at all when the pool charges nothing per place', () => {
    // With no decay every club is worth full marks wherever it lands; a colour
    // ramp would be inventing a penalty the scoring does not apply.
    expect(deltaHeatClass(9, 0)).toBe('text-neutral-500')
  })
})
