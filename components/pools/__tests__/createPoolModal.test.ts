// =============================================================
// The create-pool wizard's first step
// =============================================================
// Two small things, one of which is easy to get subtly wrong.
//
// The tournament card drops the season from the name — "Premier League 2026/27"
// reads as "Premier League" — because only one active competition is ever
// offered here, so the year distinguishes nothing, and the exact dates are
// printed two lines below it on the same card.
//
// The trap is doing that anywhere other than at render. `tournaments.name` is
// what every other surface, every email and every export uses, and there the
// season is doing real work; and `short_name` is a CODE, not a shorter display
// name — it reads "Premier League" for the league but "WC2026" for the World
// Cup, so swapping to it would fix one card and break the other.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Source with whole-line comments stripped.
 *
 * Needed for every "must not contain" assertion, because this codebase explains
 * a change by QUOTING what it replaced — the scroll-lock comment names
 * CommunityTab's `scrollTo(0, 0)` precisely to say why this does not do that.
 * Matching the raw file fails on the explanation.
 */
const codeOnly = (text: string) =>
  text.split('\n').filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  }).join('\n')

const src = readFileSync(
  resolve(process.cwd(), 'components/pools/CreatePoolModal.tsx'),
  'utf8',
)

/**
 * The helper, lifted out of the component so it can be exercised directly.
 *
 * ⚠ Read from the source rather than re-typed, so this cannot drift into
 * testing a copy that agrees with itself while the screen does something else.
 */
const withoutSeason: (name: string) => string = (() => {
  const m = src.match(/function withoutSeason\(name: string\): string \{\s*return name\.replace\((\/.+\/), ''\)/)
  if (!m) throw new Error('withoutSeason not found in CreatePoolModal.tsx')
  const [, body] = m[1].match(/^\/(.*)\/$/) ?? []
  const re = new RegExp(body)
  return (name: string) => name.replace(re, '')
})()

describe('withoutSeason', () => {
  it('drops a slashed season', () => {
    // The one on screen today.
    expect(withoutSeason('Premier League 2026/27')).toBe('Premier League')
    expect(withoutSeason('Premier League 2026/2027')).toBe('Premier League')
  })

  it('drops a plain year', () => {
    // The other row in `tournaments` right now.
    expect(withoutSeason('FIFA World Cup 2026')).toBe('FIFA World Cup')
  })

  it('leaves a year that is not the season alone', () => {
    // Anchored to the END of the string, so a year doing real work survives.
    expect(withoutSeason('Copa America 2024 Qualifiers')).toBe('Copa America 2024 Qualifiers')
  })

  it('leaves a name with no season alone', () => {
    expect(withoutSeason('Premier League')).toBe('Premier League')
    expect(withoutSeason('UEFA EURO')).toBe('UEFA EURO')
  })

  it('does not eat a number that is part of the name', () => {
    // Four digits are required, so nothing shorter is touched.
    expect(withoutSeason('Big Bash 20')).toBe('Big Bash 20')
  })
})

describe('the wizard chrome', () => {
  it('renders the trimmed name, and only at render', () => {
    expect(src).toMatch(/\{withoutSeason\(t\.name\)\}/)
    // The row itself is untouched — every other surface still reads the season.
    expect(src).not.toMatch(/t\.short_name/)
  })

  it('previews other competitions WITHOUT making them selectable', () => {
    // ⚠ These must never become rows in `tournaments`. The importer's own
    // catalogue puts it best — "an entry that has never been run is a claim, not
    // a capability" — and a selectable card for a league with no fixtures,
    // clubs or matchweeks would create a pool that scores nothing.
    expect(src).toMatch(/const COMING_SOON = \[/)
    // Rendered as plain divs, never buttons, and never wired to selection.
    const block = src.slice(src.indexOf('COMING_SOON.map'))
    expect(block.slice(0, 1400)).toMatch(/aria-disabled="true"/)
    expect(block.slice(0, 1400)).not.toMatch(/onClick/)
    expect(block.slice(0, 1400)).not.toMatch(/setSelectedTournamentId/)
  })

  it('gives the four steps room on desktop', () => {
    // "Pool Type" was wrapping to a second line at max-w-lg and shoving the
    // step row out of alignment.
    expect(src).toMatch(/sm:max-w-2xl/)
    expect(src).not.toMatch(/sm:max-w-lg/)
  })

  it('marks the chosen tournament without a tick', () => {
    // The tick came off the card — the border and tint already say which one is
    // chosen. But it was the only NON-COLOUR signal, so aria-pressed has to
    // carry it or the choice becomes invisible to anyone who cannot see either.
    expect(src).toMatch(/aria-pressed=\{selectedTournamentId === t\.tournament_id\}/)
    expect(src).not.toMatch(/rounded-full bg-primary-600 flex items-center justify-center/)
    expect(src).not.toMatch(/w-5 h-5 rounded-full border-2 border-neutral-300/)
  })

  it('shows the competition crest, and tolerates not having one', () => {
    // ⚠ NULL logo_url is a REAL answer, not a missing one. The provider serves a
    // genuine crest for the Premier League (league 39) and a generic grey shield
    // for the World Cup (league 1), so the column is filled only where the image
    // is actually the competition's own — and a card without one must render
    // without one, never a placeholder box.
    expect(src).toMatch(/\{t\.logo_url && \(/)
    expect(src).toMatch(/src=\{t\.logo_url\}/)
    // Decorative: the competition name sits right beside it, so announcing the
    // image too would just repeat. Same call the club crests already make.
    expect(src).toMatch(/src=\{t\.logo_url\}\s*\n\s*alt=""/)
    // It has to be selected, or the field is undefined and the crest silently
    // never appears — the failure mode this repo has shipped before.
    expect(src).toMatch(/\.select\('[^']*\blogo_url\b/)
  })

  it('leads with the competition name', () => {
    // It is the only thing on the card the reader is actually choosing between,
    // and at text-sm semibold it was the same weight as the metadata under it.
    expect(src).toMatch(/text-base font-bold text-neutral-900 leading-tight/)
  })

  it('does not print the format blurb', () => {
    // "20 clubs, 38 matchweeks, 380 fixtures. Flat round-robin: no groups, no
    // knockout." was the longest line on the card and the least useful at a step
    // whose only decision is WHICH competition. The column is untouched — every
    // other reader of `description` still gets it.
    expect(src).not.toMatch(/\{t\.description\}/)
  })

  it('centres the crest against the text instead of pinning it to the top', () => {
    // It used to sit at the top of a four-line block, well above its optical
    // middle. Verified in the browser at offBy: 0.
    expect(src).toMatch(/<div className="flex items-center gap-3\.5">/)
    expect(src).not.toMatch(/w-10 h-10 object-contain shrink-0 mt-0\.5/)
  })

  it('spaces the text lines with layout, not per-line margins', () => {
    // Any one of these three lines can be absent — host_countries is nullable —
    // and stacked mt-* values drift when that happens.
    expect(src).toMatch(/<div className="min-w-0 space-y-0\.5">/)
  })

  it('stops the desktop step labels wrapping', () => {
    // "Pool Type" was breaking onto a second line and shoving the row out of
    // alignment. The wider panel gives them room; nowrap stops a longer label
    // doing it again later.
    expect(src).toMatch(/hidden sm:inline whitespace-nowrap">\{step\.label\}/)
  })

  it('labels only the CURRENT step on mobile', () => {
    // ⚠ nowrap alone made mobile WORSE. Four labels plus three connectors
    // overflow 375px, so instead of wrapping, "Settings" was clipped off the
    // right edge — a regression introduced by the desktop fix above. Numbers
    // for the rest fits at any width; measured at 374px in a 375px viewport.
    expect(src).toMatch(/step\.key === currentStep \? '' : 'sr-only'/)
    // sr-only, NOT hidden — the row still reads as four named steps aloud.
    expect(src).not.toMatch(/step\.key === currentStep \? '' : 'hidden'/)
  })

  it('shows the month and year, not the day', () => {
    // A competition is picked by which one it is and roughly when it runs. The
    // 21st is noise, and dropping it takes a third off the widest line — which
    // is what lets the list run two-up on desktop.
    expect(src).toMatch(/function formatMonthYear/)
    const fn = src.slice(src.indexOf('function formatMonthYear'))
    expect(fn.slice(0, 300)).toMatch(/month: 'short'/)
    expect(fn.slice(0, 300)).toMatch(/year: 'numeric'/)
    expect(fn.slice(0, 300)).not.toMatch(/day: 'numeric'/)
  })

  it('parses the date as LOCAL, or the month itself can be wrong', () => {
    // ⚠ A bare 'YYYY-MM-DD' is parsed as UTC, so a season starting on the 1st
    // renders as the previous month for anyone west of Greenwich. That was a
    // cosmetic day-off when the day was shown; now it would change the only
    // part of the date left.
    expect(src).toMatch(/new Date\(dateStr \+ 'T00:00:00'\)/)
  })

  it('puts the competitions two across, and one across on a phone', () => {
    // Ryan asked for a column of two. The modal is max-w-2xl, so a half-width
    // card is ~294px — enough for a crest and three short lines. Below `sm` the
    // panel is a full-width sheet where two columns would be ~170px each and
    // every competition name would wrap, so it stays single there.
    const step = src.slice(src.indexOf('STEP 1: Tournament'))
    expect(step).toMatch(/grid grid-cols-1 sm:grid-cols-2 gap-3/)
    expect(step).not.toMatch(/<div className="space-y-3">\s*\n\s*\{tournaments\.map/)
  })

  it('⚠ keeps "Coming soon" OUT of that grid', () => {
    // The bug this caused, and it only showed up at THREE live competitions:
    // while the block sat inside the grid it was a grid CELL, so it landed
    // beside the odd-one-out card and stretched it to its own height — a grid
    // row is as tall as its tallest item. It is a full-width footer to the
    // choice, not one of the choices.
    const step = src.slice(src.indexOf('STEP 1: Tournament'), src.indexOf('STEP 2: Pool Type'))
    const gridOpen = step.indexOf('grid grid-cols-1 sm:grid-cols-2 gap-3')
    const mapClose = step.indexOf('})}', gridOpen)
    const comingSoon = step.indexOf('Coming soon. Named competitions')
    expect(gridOpen).toBeGreaterThan(-1)
    expect(comingSoon).toBeGreaterThan(mapClose)
    // The grid closes between the map and the block — that closing tag IS the fix.
    expect(step.slice(mapClose, comingSoon)).toMatch(/<\/div>/)
  })

  it('⚠ and therefore has ONE date placement, not two', () => {
    // The dates used to sit out to the right of a full-width card, where there
    // was dead space, and stack under the name only on a phone. Two columns
    // deleted that space: ~294px is narrower than the 375px screen the
    // right-hand placement already did not fit on (measured then: 317px of a
    // 305px row). Both halves of the split have to go together — leaving the
    // `hidden sm:block` copy would put the range back into a card that has no
    // room for it, and the NAME is what gives way.
    expect(src).toMatch(/const dateRange = /)
    expect(src).not.toMatch(/hidden sm:block ml-auto/)
    expect(src).not.toMatch(/sm:hidden">\{dateRange\}/)
    expect(src).toMatch(/text-xs text-neutral-500">\{dateRange\}/)
  })
})

// =============================================================
describe('the settings step', () => {
  it('groups the settings into titled blocks instead of horizontal rules', () => {
    // It was four unrelated groups separated by <hr>, with headings at the same
    // weight as the field labels inside them — so nothing read as a boundary and
    // the whole step scrolled as one list.
    expect(src).toMatch(/function Section\(/)
    expect(src).toMatch(/title="Who can join"/)
    expect(src).toMatch(/title="Entries per member"/)
    // The rules are gone.
    const step = src.slice(src.indexOf('STEP 4: Settings'))
    expect(step).not.toMatch(/<hr className="border-neutral-100" \/>/)
  })

  it('does not label the same control three times', () => {
    // "Prediction Entries" heading, then a two-line explanation, then a
    // "MAX ENTRIES PER MEMBER" FormField label, then a 1-10 strip. The block
    // title names it once.
    const step = src.slice(src.indexOf('STEP 4: Settings'))
    expect(step).not.toMatch(/label="Max Entries Per Member"/)
  })

  it('asks three questions, and no more', () => {
    // Deadline, who can join, entries per member. The member limit is gone:
    // migration 075 records that `pools.max_participants` is "stored, displayed
    // and editable but enforced NOWHERE" — an admin could set 20 and 50 people
    // would still join. It was a dead control in a step where every question is
    // meant to matter, and the real ceiling is the tier one, applied by a
    // BEFORE INSERT trigger no client can miss.
    const step = src.slice(src.indexOf('STEP 4: Settings'))
    expect(step).not.toMatch(/Maximum members/i)
    expect(step).not.toMatch(/maxParticipants/)
    expect(src).not.toMatch(/const \[maxParticipants/)
    // Still sends 0, which the create route stores as NULL — no admin cap.
    expect(src).toMatch(/max_participants: 0/)
  })

  it('holds the page still while the wizard is open', () => {
    // Cause 3 of "the background scrolls": the modal never locked it at all, so
    // anything the browser could not scroll inside the dialog moved the pool
    // list behind instead.
    expect(src).toMatch(/body\.style\.overflow = 'hidden'/)
    // ⚠ overflow alone is NOT enough. The scroll offset survives in scrollY but
    // the clamped scrollport paints from the top, so opening the modal 400px
    // down the list threw the background 400px out of place. Pinning at
    // -scrollY holds it, and the offset is restored on close.
    expect(src).toMatch(/body\.style\.position = 'fixed'/)
    expect(src).toMatch(/body\.style\.top = `-\$\{scrollY\}px`/)
    expect(src).toMatch(/window\.scrollTo\(0, scrollY\)/)
    // Never scrollTo(0, 0) — that is CommunityTab's keyboard lock and would
    // dump the admin at the top of the list on close.
    expect(codeOnly(src)).not.toMatch(/scrollTo\(0, 0\)/)
  })

  it('keeps the scoring note OUT of the section chrome', () => {
    // It is not a setting. Giving it the same border as the three above would
    // imply there is something in it to decide.
    const note = src.slice(src.indexOf('Scoring uses the defaults'))
    expect(note.slice(-400)).not.toMatch(/<Section/)
  })

  it('a chip cannot name a different date from the one it sets', () => {
    // ⚠ A REAL BUG, visible on screen: the season starts 2026-08-21 and the
    // button read "Tournament Start (Aug 20)" while correctly SETTING the 21st.
    // `new Date('2026-08-21')` parses as UTC, so the LABEL rendered a day early
    // west of Greenwich while the VALUE was right — two functions, one date,
    // disagreeing.
    //
    // The fix is structural rather than a corrected parse: `quickPicks` returns
    // { label, date, time } together, so the text and the value come from one
    // object and cannot drift. `quickDeadlineLabel` is gone entirely.
    expect(src).toMatch(/const quickPicks: Array<\{ key: string; label: string; date: string; time: string \}>/)
    expect(src).not.toMatch(/function quickDeadlineLabel/)
    expect(src).toMatch(/onClick=\{\(\) => \{ setDeadlineDate\(q\.date\); setDeadlineTime\(q\.time\) \}\}/)
    // The one place a Date is still built from the season's start string.
    expect(src).toMatch(/new Date\(selectedTournament\.start_date \+ 'T00:00:00'\)/)
    expect(codeOnly(src)).not.toMatch(/new Date\(selectedTournament\.start_date\)/)
  })

  it('swaps the chips for matchweek deadlines once the season is under way', () => {
    // "Tournament Start (Aug 21)" in September is not a shortcut — it is a
    // button that sets a date the form immediately rejects.
    expect(src).toMatch(/const started = new Date\(selectedTournament\.start_date \+ 'T00:00:00'\) <= new Date\(\)/)
    expect(src).toMatch(/upcomingLocks\.map\(/)
    // Only locks still ahead of us are offered.
    expect(src).toMatch(/\.gt\('lock_at', new Date\(\)\.toISOString\(\)\)/)
    // A started competition with no readable matchweeks gets NO chips, rather
    // than a row of dead ones.
    expect(src).toMatch(/\{quickPicks\.length > 0 && \(/)
  })

  it('will not let a deadline be set in the past', () => {
    expect(src).toMatch(/min=\{todayLocal\(\)\}/)
    // ⚠ Date-only is not enough, and there was no other check at all: the
    // calendar greys out earlier DAYS, but "today at 09:00" chosen at noon is
    // still in the past, and the wizard submitted it. A deadline already gone
    // closes nothing — and for a table pool it is the real lock, so the pool
    // would be created shut.
    expect(src).toMatch(/deadline <= new Date\(\)/)
    expect(src).toMatch(/The deadline has to be in the future/)
  })
})
