import { describe, expect, it } from 'vitest'

import {
  buildOpponentDossier,
  mergeDossierScopes,
  type ClubRef,
  type OpponentDossier,
  type PickRow,
} from '../opponent'

// =============================================================
// Two scopes, one dossier
// =============================================================
// "How someone picks is a lifetime trait. How they are doing is a pool fact."
//
// The risk this covers is not arithmetic — both halves are the same tested
// builder — it is ATTRIBUTION: a field taken from the wrong half renders
// perfectly and is simply wrong, and nothing errors.
// =============================================================

const ARS: ClubRef = { clubId: 'ars', externalClubId: 42, name: 'Arsenal', abbreviation: 'ARS', crestUrl: null }
const CHE: ClubRef = { clubId: 'che', externalClubId: 49, name: 'Chelsea', abbreviation: 'CHE', crestUrl: null }
const MUN: ClubRef = { clubId: 'mun', externalClubId: 33, name: 'Manchester United', abbreviation: 'MUN', crestUrl: null }

let seq = 0
function pick(over: Partial<PickRow> = {}): PickRow {
  seq += 1
  return {
    entry: 'e1',
    fixtureId: `f${seq}`,
    matchweek: 1,
    kickoffAt: `2026-09-${String((seq % 28) + 1).padStart(2, '0')}T15:00:00+00:00`,
    predictedHome: 2,
    predictedAway: 1,
    predictedOutcome: null,
    actualHome: 2,
    actualAway: 1,
    homeClub: ARS,
    awayClub: CHE,
    scoreType: 'exact',
    points: 100,
    ...over,
  }
}

function many(n: number, over: Partial<PickRow> = {}): PickRow[] {
  return Array.from({ length: n }, () => pick(over))
}

const SPAN = { pools: 3, competitions: 1, droppedConflicts: 0 }

describe('mergeDossierScopes takes each field from the right half', () => {
  // Two deliberately different worlds: in the pool they are accurate and back
  // Arsenal; across their history they are inaccurate and back Man United. Every
  // field can therefore be traced to the half it came from.
  const pool = buildOpponentDossier(
    many(10, { homeClub: ARS, awayClub: CHE, scoreType: 'exact', points: 100 }),
  )
  const lifetime = buildOpponentDossier(
    many(30, { homeClub: MUN, awayClub: CHE, scoreType: 'miss', points: 0 }),
  )

  const merged = mergeDossierScopes(pool, lifetime, SPAN)

  it('⚠ accuracy is the POOL\'s — pool depth changes what a point is worth', () => {
    expect(merged.hitRate).toEqual(pool.hitRate)
    expect(merged.exactCount).toBe(pool.exactCount)
    expect(merged.pointsPerFixture).toBe(pool.pointsPerFixture)
    expect(merged.picks).toBe(pool.picks)
    expect(merged.scored).toBe(pool.scored)
  })

  it('⚠ the matchweek strip is the POOL\'s — two pools interleaved never happened', () => {
    expect(merged.form).toEqual(pool.form)
  })

  it('⚠ club bias is the LIFETIME half — the card it exists for', () => {
    expect(merged.mostBacked?.club.name).toBe('Manchester United')
    expect(pool.mostBacked?.club.name).toBe('Arsenal')
  })

  it('⚠⚠ the baseline travels WITH the fingerprint, never split across halves', () => {
    // Taking one from each would compare a whole history against one pool's
    // slice of football — a comparison of two different populations, rendered as
    // if it were one.
    expect(merged.baseline).toEqual(lifetime.baseline)
    expect(merged.fingerprint).toEqual(lifetime.fingerprint)
  })

  it('reports the span it actually covered', () => {
    expect(merged.lifetime?.pools).toBe(3)
    expect(merged.lifetime?.picks).toBe(lifetime.picks)
  })
})

describe('mergeDossierScopes degrades rather than empties', () => {
  const pool = buildOpponentDossier(many(12))

  it('⚠ a failed lifetime read returns the pool dossier WHOLE', () => {
    // The lifetime read is best-effort. Returning a half-built object here would
    // blank the tendency cards on every transient failure, which is worse than
    // the scope being narrower than it could have been.
    expect(mergeDossierScopes(pool, null, SPAN)).toEqual(pool)
    expect(mergeDossierScopes(pool, pool, null)).toEqual(pool)
  })

  it('⚠ and it leaves `lifetime` unset, so no card claims "All time"', () => {
    // The screen labels cards from the PRESENCE of this field. Setting it on a
    // pool-scoped merge would put "All time" over pool figures — worse than no
    // label at all.
    expect(mergeDossierScopes(pool, null, SPAN).lifetime).toBeUndefined()
  })
})

describe('the thin flag', () => {
  it('marks a short history as thin and a long one as not', () => {
    const pool = buildOpponentDossier(many(5))
    const thin = mergeDossierScopes(pool, buildOpponentDossier(many(12)), SPAN)
    const fat = mergeDossierScopes(pool, buildOpponentDossier(many(60)), SPAN)

    expect(thin.lifetime?.thin).toBe(true)
    expect(fat.lifetime?.thin).toBe(false)
  })
})

describe('⚠ every field of OpponentDossier is assigned a scope', () => {
  it('the merge leaves nothing behind', () => {
    // The compiler already enforces this — `SCOPE` is
    // `Record<keyof OpponentDossier, Scope>`, so a new field fails the build
    // until somebody decides where it belongs. This is the runtime half of the
    // same claim: a key present on both inputs must survive the merge, because
    // a silently dropped field renders as an empty card rather than an error.
    const a = buildOpponentDossier(many(10))
    const b = buildOpponentDossier(many(20, { homeClub: MUN }))
    const merged = mergeDossierScopes(a, b, SPAN)

    const missing = (Object.keys(a) as (keyof OpponentDossier)[]).filter(
      (k) => !(k in merged),
    )
    expect(missing, 'a field was dropped by the scope merge').toEqual([])
  })
})
