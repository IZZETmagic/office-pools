// =============================================================
// The Exact Scores picking screen
// =============================================================
// A league pool at Scores depth was rendering KnockoutStageForm — the World
// Cup's component — because the flow's only branch was `isResults`, and false
// meant "World Cup" everywhere it was read. Everything that component carries
// for a knockout tie came with it.
//
// The one that could not be dismissed as cosmetic: `pso_enabled` defaults to
// TRUE, so a predicted 1-1 in a Premier League matchweek opened a "Penalty
// Shootout Score" panel and told the member in amber that a PSO score was
// REQUIRED. `league_score_fixture` reads home/away only, so the number it
// demanded could never have counted for anything.
//
// These are source-text guards, per the limit this harness sets for
// components/** — pure functions and source guards, no rendering.

import { describe, it, expect } from 'vitest'
import { GOAL_WRAP, stepGoals } from '../MatchweekScoresForm'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

/**
 * Source with whole-line comments stripped.
 *
 * Every "must not contain" assertion needs this, because this codebase explains
 * a change by QUOTING what it replaced — MatchweekScoresForm names the penalty
 * shootout panel precisely to say why it does not have one.
 */
const codeOnly = (text: string) =>
  text
    // ⚠ Whole BLOCKS, not lines starting with `*` — the version in
    // components/pools/__tests__ filters line by line, which leaves the middle
    // of a JSX comment behind. The line explaining why this file has no "N of N
    // matches predicted" counter contains that exact phrase, so a line filter
    // fails the assertion on the comment that documents it.
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

const form = read('components/predictions/MatchweekScoresForm.tsx')
const formCode = codeOnly(form)
const flow = read('components/predictions/ProgressivePredictionsFlow.tsx')
const flowCode = codeOnly(flow)

describe('a matchweek never reaches the World Cup form', () => {
  it('routes a matchweek to MatchweekScoresForm', () => {
    expect(flowCode).toContain('<MatchweekScoresForm')
    expect(flowCode).toMatch(/\{isMatchweekRound && !isResults && \(\s*<MatchweekScoresForm/)
  })

  it('gates KnockoutStageForm on the round NOT being a matchweek', () => {
    // The bug was this branch reading `!isResults` alone. A World Cup round is
    // never a matchweek, so this costs the World Cup nothing.
    const branch = flowCode.match(/\{[^{}]*&& \(\s*<KnockoutStageForm/)
    expect(branch, 'KnockoutStageForm branch not found').not.toBeNull()
    expect(branch![0]).toContain('!isMatchweekRound')
  })
})

describe('the knockout furniture is gone', () => {
  it('has no penalty shootout and no winner picker', () => {
    for (const dead of ['psoEnabled', 'homePso', 'awayPso', 'winnerTeamId', 'Penalty Shootout']) {
      expect(formCode, `${dead} must not survive into a league matchweek`).not.toContain(dead)
    }
  })

  it('prints neither a match number nor a group letter', () => {
    // Both are World Cup facts. Every league fixture is stage 'regular_season'
    // and no club is in a group.
    expect(formCode).not.toContain('match_number')
    expect(formCode).not.toContain('group_letter')
  })

  it('does not repeat the completion count the matchweek strip already shows', () => {
    expect(formCode).not.toContain('matches predicted')
    expect(formCode).not.toContain('<Badge')
  })
})

describe('the crest', () => {
  it('is square and uncropped, not the national-flag box', () => {
    // KnockoutStageForm draws `w-6 h-4 rounded-[2px] object-cover`, which crops
    // a round club badge top and bottom.
    expect(formCode).toContain('object-contain')
    expect(formCode).not.toContain('object-cover')
  })

  it('renders on a phone', () => {
    // It was `hidden sm:block` in the knockout card, so a phone showed none.
    const crestLine = formCode.split('\n').find((l) => l.includes('<img'))
    expect(crestLine, '<img not found').toBeTruthy()
    expect(crestLine!).not.toContain('hidden sm:block')
  })
})

const rn = read('mobile/components/pool-detail/TapScoreField.tsx')

describe('the box counts the way the app counts', () => {
  it('wraps on the modulus the app uses, read from the app', () => {
    // `const next = ((value ?? -1) + 1) % 16` — if somebody widens the app's
    // range to 20, this fails here rather than in a member's pool.
    const m = rn.match(/\+ 1\) % (\d+)/)
    expect(m, 'the modulus was not found in TapScoreField.tsx').not.toBeNull()
    expect(GOAL_WRAP).toBe(Number(m![1]))
  })

  it('agrees with the app formula at every value it can hold', () => {
    const app = (v: number | null) => ((v ?? -1) + 1) % GOAL_WRAP
    expect(stepGoals(null, 1)).toBe(app(null))
    for (let v = 0; v < GOAL_WRAP; v++) {
      expect(stepGoals(v, 1), `up from ${v}`).toBe(app(v))
    }
  })

  it('comes round again in both directions', () => {
    expect(stepGoals(GOAL_WRAP - 1, 1)).toBe(0)
    expect(stepGoals(0, -1)).toBe(GOAL_WRAP - 1)
  })

  it('lands an unpicked box on 0 whichever way it is stepped', () => {
    // Not 15. A first click producing the highest score in the range is the
    // kind of thing a member reports as the control being broken.
    expect(stepGoals(null, 1)).toBe(0)
    expect(stepGoals(null, -1)).toBe(0)
  })

  it('never leaves the range', () => {
    for (let v = 0; v < GOAL_WRAP; v++) {
      for (const d of [1, -1] as const) {
        const next = stepGoals(v, d)
        expect(next).toBeGreaterThanOrEqual(0)
        expect(next).toBeLessThan(GOAL_WRAP)
      }
    }
  })

  it('holds for as long as the app holds', () => {
    const appDelay = rn.match(/delayLongPress=\{(\d+)\}/)
    expect(appDelay, 'delayLongPress was not found in TapScoreField.tsx').not.toBeNull()
    const webDelay = formCode.match(/holdTimer\.current = setTimeout\([\s\S]*?\}, (\d+)\)/)
    expect(webDelay, 'the hold timer was not found').not.toBeNull()
    expect(webDelay![1]).toBe(appDelay![1])
  })
})

describe('the control a member actually touches', () => {
  it('is a spin button, not a text field', () => {
    // A box that counts on click cannot also be a field you type free text
    // into — and `role="spinbutton"` is what tells a screen reader the value
    // has an up and a down, which is the only way the decrement is reachable
    // without a mouse.
    expect(formCode).toContain('role="spinbutton"')
    expect(formCode).not.toContain('<input')
  })

  it('decrements only from a real mouse', () => {
    // Android Chrome fires `contextmenu` on a touch long-press as well, so
    // without this check one long finger would decrement AND clear.
    expect(formCode).toMatch(/pointerTypeRef\.current === 'mouse'/)
    expect(formCode).toContain('e.preventDefault()')
  })

  it('says out loud what it does, once', () => {
    // CLAUDE.md's bar: a mechanic that shapes how a member plays has to
    // survive being written in a one-sentence tooltip. Neither the right-click
    // nor the hold has any visible affordance, so the sentence is not optional.
    expect(formCode).toContain('Tap a box to add a goal')
    expect(formCode.match(/Tap a box to add a goal/g)).toHaveLength(1)
  })
})

describe('a league scoreline is saved whole or not at all', () => {
  it('skips a half-typed pick instead of filling the gap with a zero', () => {
    // `homeScore: scores.home ?? 0` turned "typed 2, has not reached the away
    // box" into a saved 2-0 — a scoreline the member never made, on a fixture
    // the completion ring was still counting as unpicked.
    expect(flowCode).toContain(
      'if (isMatchweekRound && (scores.home == null || scores.away == null)) continue',
    )
  })

  it('keeps isMatchweekRound in the save callback deps', () => {
    // Without it the callback never rebuilds and the ref keeps pointing at the
    // first closure — the same trap the Results map hit and the reason
    // `outcomes` and `isResults` are already listed there.
    const deps = flowCode.match(/\}, \[saving, isReadOnly[^\]]*\]\)/)
    expect(deps, 'savePredictions deps not found').not.toBeNull()
    expect(deps![0]).toContain('isMatchweekRound')
  })
})
