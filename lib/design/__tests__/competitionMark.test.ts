// =============================================================
// The mark list and the files on disk must agree
// =============================================================
// `competitionMark.ts` names the competitions that have a mark; the files are
// produced separately by `scripts/build-competition-silhouettes.ts`. Nothing
// but this test connects the two, and both ways of drifting are silent:
//
//   · an id listed with no file → a 46px rail with nothing in it
//   · a file with no id listed  → the mark is built and never served
//
// Neither throws, neither shows up in a build, and both would reach a member as
// a card that looks broken or a competition that never got its crest.
// =============================================================

import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  MARKED_COMPETITION_IDS,
  getCompetitionMark,
  hasCompetitionMark,
} from '@/lib/design/competitionMark'
import { LEAGUE_ID, COMPETITION_COLOR } from '@/lib/design/competitionColor'

const MARK_DIR = join(process.cwd(), 'public', 'competitions')

describe('every listed competition has its mark on disk', () => {
  it.each(MARKED_COMPETITION_IDS)('league %i', (id) => {
    const url = getCompetitionMark(id)
    expect(url).toBeTruthy()
    // The URL is served from public/, so it maps onto a path directly.
    expect(existsSync(join(process.cwd(), 'public', url!.replace(/^\//, '')))).toBe(true)
  })

  it('serves every mark that was built', () => {
    const onDisk = readdirSync(MARK_DIR)
      .filter((f) => /\.(png|svg)$/.test(f))
      .map((f) => Number(f.replace(/\.(png|svg)$/, '')))
      .sort((a, b) => a - b)
    expect(onDisk).toEqual([...MARKED_COMPETITION_IDS].sort((a, b) => a - b))
  })
})

describe('the fallback', () => {
  it('⚠ returns null rather than a broken URL for an unbuilt competition', () => {
    // Load-bearing: a league is a row rather than a deploy, so a competition can
    // be created and picked in the wizard before anyone runs the build script.
    // The card checks for null and renders the original 5px bar instead.
    expect(getCompetitionMark(9999)).toBeNull()
    expect(getCompetitionMark(null)).toBeNull()
    expect(getCompetitionMark(undefined)).toBeNull()
    expect(hasCompetitionMark(9999)).toBe(false)
  })

  it('agrees with hasCompetitionMark', () => {
    for (const id of [...MARKED_COMPETITION_IDS, 9999, 0, -1]) {
      expect(hasCompetitionMark(id)).toBe(getCompetitionMark(id) !== null)
    }
  })
})

describe('marks and colours cover the same competitions', () => {
  it('every competition with a colour has a mark', () => {
    // They are keyed the same way on purpose — external_league_id — so a
    // competition that is themed but unmarked would get a coloured rail with a
    // hole in it. If this ever has to diverge, the card's fallback is the place
    // to handle it, not a quiet mismatch here.
    const themed = Object.keys(COMPETITION_COLOR).map(Number).sort((a, b) => a - b)
    expect([...MARKED_COMPETITION_IDS].sort((a, b) => a - b)).toEqual(themed)
  })

  it('the World Cup mark is the SVG we drew, not a derived raster', () => {
    // The provider has no World Cup asset — league 1 returns a generic
    // placeholder shield — so this one is hand-drawn and has no PNG to derive.
    expect(getCompetitionMark(LEAGUE_ID.worldCup)).toBe('/competitions/1.svg')
  })

  it('every other mark is a derived PNG', () => {
    for (const id of MARKED_COMPETITION_IDS) {
      if (id === LEAGUE_ID.worldCup) continue
      expect(getCompetitionMark(id)).toBe(`/competitions/${id}.png`)
    }
  })
})
