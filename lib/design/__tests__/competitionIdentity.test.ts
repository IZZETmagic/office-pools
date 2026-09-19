// =============================================================
// A competition is a colour and a NAME — and no longer a mark
// =============================================================
// This file used to check that every competition's logo was on disk. Those
// logos were the provider's artwork, recoloured and committed; they were
// removed on 2026-09-19 (drafts/2026-09-13_ip_exposure_audit.md §2) and the
// rail says the competition's name instead.
//
// So the invariant flipped. What matters now is that the marks stay gone and
// every themed competition has a name — because both ways of drifting are
// silent:
//
//   · a mark creeps back in      → we are shipping someone's logo again
//   · a themed id with no name   → a 46px rail with nothing in it
//
// Neither throws and neither shows up in a build.
// =============================================================

import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  MARKED_COMPETITION_IDS,
  getCompetitionMark,
  hasCompetitionMark,
} from '@/lib/design/competitionMark'
import {
  COMPETITION_COLOR,
  COMPETITION_NAME,
  getCompetitionName,
} from '@/lib/design/competitionColor'

describe('the league marks are gone, and stay gone', () => {
  it('⚠ no competition has a mark', () => {
    // If this fails, someone repopulated MARKED. The assets it pointed at are
    // deleted and so is the script that derived them — read the audit before
    // putting anything back.
    expect(MARKED_COMPETITION_IDS).toEqual([])
  })

  it('⚠ public/competitions holds no artwork', () => {
    const dir = join(process.cwd(), 'public', 'competitions')
    const onDisk = existsSync(dir)
      ? readdirSync(dir).filter((f) => /\.(png|svg)$/.test(f))
      : []
    expect(onDisk).toEqual([])
  })

  it('the mark API is inert for every themed competition', () => {
    // The functions survive because callers still reference them while each
    // surface is given its own answer. They must answer "nothing", never throw.
    for (const id of Object.keys(COMPETITION_COLOR).map(Number)) {
      expect(getCompetitionMark(id)).toBeNull()
      expect(hasCompetitionMark(id)).toBe(false)
    }
  })
})

describe('every themed competition has a name', () => {
  it('names and colours cover the same competitions', () => {
    // Keyed the same way on purpose — external_league_id — so a competition
    // that is themed but unnamed would get a coloured rail with a hole in it.
    const themed = Object.keys(COMPETITION_COLOR).map(Number).sort((a, b) => a - b)
    const named = Object.keys(COMPETITION_NAME).map(Number).sort((a, b) => a - b)
    expect(named).toEqual(themed)
  })

  it('every name is uppercase and short enough to run up a rail', () => {
    for (const [id, name] of Object.entries(COMPETITION_NAME)) {
      expect(name, `league ${id}`).toBe(name.toUpperCase())
      // ⚠ The rail shrinks type to fit rather than truncating, and below ~7pt a
      // word stops being a word. 16 characters is "CHAMPIONS LEAGUE", which is
      // the longest that still reads on the home card's 180pt rail.
      expect(name.length, `league ${id} is too long for the rail`).toBeLessThanOrEqual(16)
    }
  })

  it('⚠ returns null rather than an empty rail for an unnamed competition', () => {
    // Load-bearing: a league is a row rather than a deploy, so a competition can
    // be created and picked in the wizard before anyone names it. The card
    // checks for null and renders the original 5px bar instead.
    expect(getCompetitionName(9999)).toBeNull()
    expect(getCompetitionName(null)).toBeNull()
    expect(getCompetitionName(undefined)).toBeNull()
  })
})
