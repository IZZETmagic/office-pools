'use client'

// =============================================================
// THE LEAGUE TABLE — the real one, as the competition has it
// =============================================================
// Plan §0.3. Every number here is INGESTED from api-football `/standings`
// (migration 075) and simply displayed. Nothing on this screen is computed in
// the browser, and that is deliberate twice over:
//
//   1. The architecture rule — the backend writes the answer down once, the
//      front end renders it.
//   2. A table computed from our own fixtures cannot see POINTS DEDUCTIONS.
//      Everton were docked ten points and then eight in 2023/24. A derived
//      table would have shown them ten places too high all season, visibly
//      wrong to anybody who had watched the football.
//
// Even the band shading and the movement arrows come from the feed:
// `description` names the Champions League and relegation places, `movement` is
// up / down / same. Hardcoding 1-4 and 18-20 would be wrong the first season a
// competition changed its qualification places, which they do.
//
// ============================================================
// ONE THING IS ORDERED HERE, AND ONLY ONE
// ============================================================
// Clubs the feed leaves genuinely level are sorted alphabetically —
// `orderStandings`, applied below. Everything else is the feed's.
//
// Raised 2026-08-25: after matchweek 1, Manchester City sat above Ipswich on
// identical figures (3 points, +1, two scored, one conceded). The Premier
// League's COMPETITIVE tiebreak has no alphabetical step — it goes points →
// goal difference → goals scored → head-to-head → away goals → a playoff — but
// that decides who wins a contested place. A published table still has to print
// a deterministic order for clubs the rulebook considers level, and the official
// Premier League app uses alphabetical there. Ours now agrees with the table
// members are checking on their phones.
//
// It cannot reach a deducted club: a tie group requires equal points, and a
// deduction changes points by definition. That is why this is safe to run on
// top of an ingested table rather than a contradiction of it. The one case it
// gets wrong — a head-to-head separation we do not ingest — is written up in
// lib/league/standingsOrder.ts.
//
// ⚠ What moves is the CLUBS. The place keeps its number AND its `description`,
// because the band text is a fact about finishing 18th rather than about the
// club standing there. Letting the band ride along with the club is what drew
// the relegation bar on 17, 19 and 20 on 2026-08-28 — Coventry sorted ahead of
// a level Tottenham and carried the red stripe up a place with it.
// =============================================================

import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { LocalTime } from '@/components/LocalTime'
import type { NextFixture } from '@/lib/league/read'
import { shortClubName } from '@/lib/league/clubName'
import { orderStandings } from '@/lib/league/standingsOrder'

export type LeagueStandingRow = {
  club_id: string
  club_name: string
  crest_url: string | null
  rank: number
  points: number
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goals_diff: number
  form: string | null
  description: string | null
  movement: 'up' | 'down' | 'same' | null
}

type Props = {
  rows: LeagueStandingRow[]
  /**
   * club_id -> next unplayed fixture. Read from `league_fixtures` rather than
   * from the standings feed, which has no notion of what comes next.
   */
  nextByClub?: Map<string, NextFixture>
  /** When the feed was last read. Shown so nobody wonders if it is stale. */
  fetchedAt: string | null
}

/**
 * The feed's `description` is free text and varies by competition — "Promotion -
 * Champions League (League phase)", "Relegation", and so on. Matching on a
 * couple of keywords is deliberately loose: an unrecognised band simply gets no
 * stripe, which is a missing decoration rather than a wrong one.
 */
function bandOf(description: string | null): 'champions' | 'europa' | 'conference' | 'relegation' | null {
  if (!description) return null
  const d = description.toLowerCase()
  if (d.includes('relegation')) return 'relegation'
  if (d.includes('champions league')) return 'champions'
  // ⚠ CONFERENCE BEFORE EUROPA. The 2023/24 vintage of this feed reads
  // "Promotion - Europa Conference League (Qualification: )", which contains
  // both words; testing Conference first is what keeps it out of the Europa
  // band. The phrases match migration 113's SQL exactly, so a row shaded as
  // Europa here is a row the engine counts as Europa.
  if (d.includes('conference league')) return 'conference'
  if (d.includes('europa league')) return 'europa'
  return null
}

/**
 * ⚠ This shades the REAL table, so it can disagree with the scoring band on
 * purpose. A cup winner sitting 15th carries a Europa tag from the feed and
 * gets the stripe, because they did qualify — but migration 113's band is the
 * contiguous run of LEAGUE positions and stops well above them. The table shows
 * what happened; the band pays for where a club finished.
 */

/**
 * The qualification bands — a bar at the row's left edge, and the legend swatch.
 *
 * It has been four things. A short pill floating beside the position number,
 * which never read as a band. A `border-l` on the cell, which ran the full
 * height and welded rows 1-4 into one unbroken stripe. A rounded pill at the
 * cell edge, which broke correctly but still looked parked beside the table
 * rather than part of it. Now: square, three pixels, sitting ON the table's
 * own left edge, inset top and bottom so each row's mark is its own.
 *
 * ⚠ Absolutely positioned inside the first cell, NOT a border on the `<tr>`. A
 * row border is unreliable under `border-collapse` — the browser resolves
 * conflicting cell and row borders and can drop it — and a border cannot be
 * inset from its own edges, which is the whole point here. Positioning also
 * means unbanded rows need no transparent placeholder to stay aligned.
 */
/** The band as a real left border on the row's first cell. */
const BAND_BORDER: Record<string, string> = {
  champions: 'border-l-primary-500',
  europa: 'border-l-success-500',
  conference: 'border-l-success-300',
  relegation: 'border-l-danger-500',
}

/**
 * The same three as a FILL, for the legend swatches.
 *
 * A separate literal map rather than the border one with its prefix swapped:
 * `border-l-primary-500` → `bg-primary-500` built at runtime is a string
 * Tailwind's scanner never sees, so the class would be missing from the served
 * stylesheet and the swatch would render invisible.
 */
const BAND_SWATCH: Record<string, string> = {
  champions: 'bg-primary-500',
  europa: 'bg-success-500',
  // A lighter step of the Europa green rather than a fourth hue — the third
  // European competition, shaded as the rung below the second.
  conference: 'bg-success-300',
  relegation: 'bg-danger-500',
}

const BAND_LABEL: Record<string, string> = {
  champions: 'Champions League',
  europa: 'Europa League',
  conference: 'Conference League',
  relegation: 'Relegation',
}

/** Both client-only — see the LocalTime notes at the call sites. */
function formatFetchedAt(d: Date): string {
  return d.toLocaleString('en-US', {
    weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

function formatKickoff(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function LeagueTableTab({ rows, fetchedAt, nextByClub }: Props) {
  // Alphabetical among clubs the feed left genuinely level — see
  // lib/league/standingsOrder.ts for what it is allowed to move and why the
  // deduction case cannot reach it.
  const ordered = orderStandings(rows)
  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center py-8">
          <Icon name="list.bullet" size={40} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-sm text-neutral-600 font-medium">The table isn&apos;t in yet</p>
          <p className="text-xs text-neutral-400 mt-1">
            It appears once the season&apos;s first matches have been played.
          </p>
        </div>
      </Card>
    )
  }

  // Which bands are actually present, so the key never advertises a band this
  // competition does not have.
  const bandsPresent = [...new Set(rows.map((r) => bandOf(r.description)).filter(Boolean))] as string[]

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-neutral-900">League Table</h2>
        {fetchedAt && (
          <p className="text-xs text-neutral-400">
            {/* Client-only. Pinning 'en-US' is NOT enough — Node and the
                browser ship different ICU versions and disagree on the
                separator, and on Vercel the server runtime is UTC so a
                server-formatted time is somebody else's clock. */}
            Updated <LocalTime iso={fetchedAt} format={formatFetchedAt} />
          </p>
        )}
      </div>

      {/* ⚠ The 560px minimum is `sm:` only. On a phone W, D, L, Form and Next
          are already hidden, so the five columns that remain — position, club,
          played, goal difference, points — fit 375px comfortably; the minimum
          was forcing a sideways scroll to reach nothing. It still applies from
          `sm` up, where W/D/L come back and the table genuinely needs the room,
          and the container keeps its own scroll for that case so the page body
          never scrolls sideways. */}
      <Card padding="none" className="overflow-hidden">
        {/* ⚠ `pb-6` is not decoration. The card is `rounded-card` (24px) with
            `overflow-hidden`, so its bottom-left curve clips whatever reaches
            the corner — and the band bar sits at x=0, exactly where the curve
            bites deepest. The relegation bar on the last row was being cut in
            half. 24px of bottom padding lifts the final row clear of the
            radius; anything less and the corner still eats into it. */}
        <div className="overflow-x-auto pb-6">
          {/* `border-separate` with a 2px vertical gap, so each row's LEFT BORDER is
              its own segment. Under the default `border-collapse` a border runs
              the full height of the column and the qualification bands weld into
              one unbroken stripe; separating the rows is what puts a break
              between them.

              ⚠ `-mt-[2px]` is part of that, not a nudge. `border-spacing` also
              applies between the table's own edge and the OUTERMOST cells, so
              the 2px meant for the row gaps opened a strip of card surface above
              the header — which, against the card's rounded corner, read as an
              outline drawn around the top of the table. The negative margin
              pulls the header back flush; the gap the rule exists for, between
              rows, is untouched. */}
          <table
            className="w-full sm:min-w-[560px] text-xs sm:text-sm tabular-nums border-separate -mt-[2px]"
            style={{ borderSpacing: '0 2px' }}
          >
            <thead>
              <tr className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500">
                {/* ⚠ Column padding is `px-1` on a phone and `px-2` from `sm`.
                    Eight numeric columns plus the club will not fit 375px at
                    the desktop rhythm; Ryan's call was to crunch the numbers
                    rather than drop any, so the gutters shrink and the type
                    steps down one size — the figures stay tabular either way,
                    so the columns still line up. */}
                <th className="py-2.5 pl-2 pr-0.5 sm:pl-3 sm:pr-1 text-left font-bold w-7 sm:w-10">#</th>
                <th className="py-2.5 px-1 sm:px-2 text-left font-bold">Club</th>
                {/* ⚠ Sized for the values these REACH, not the ones on screen
                    in August. P hits 38 and W/D/L reach two digits well before
                    May, so `w-5` (20px) is the floor — 14px of tabular digits
                    plus the 4px gutter. Anything narrower reflows the whole
                    table the first time a club wins ten. */}
                <th className="py-2.5 px-0.5 sm:px-3 text-right font-bold w-5 sm:w-11">P</th>
                <th className="py-2.5 px-0.5 sm:px-3 text-right font-bold w-5 sm:w-11">W</th>
                <th className="py-2.5 px-0.5 sm:px-3 text-right font-bold w-5 sm:w-11">D</th>
                <th className="py-2.5 px-0.5 sm:px-3 text-right font-bold w-5 sm:w-11">L</th>
                {/* Goals for and against in ONE column. Two columns cost the
                    width that W needs, and the pair is read together anyway —
                    nobody looks up goals-for without goals-against. */}
                <th className="py-2.5 px-0.5 sm:px-3 text-right font-bold w-9 sm:w-16">+/-</th>
                <th className="py-2.5 px-0.5 sm:px-3 text-right font-bold w-7 sm:w-14">GD</th>
                <th className="py-2.5 pl-0.5 pr-2 sm:px-3 text-right font-bold w-6 sm:w-12">Pts</th>
                {/* Right-aligned with the numbers. Left-aligned, `Next` also
                    absorbed all the table's leftover width and parked its crest
                    at the far LEFT of a very wide cell — which is where the
                    empty gutter down the right of the desktop table came
                    from. */}
                <th className="py-2.5 px-3 text-right font-bold hidden md:table-cell w-24">Form</th>
                <th className="py-2.5 pl-3 pr-4 text-right font-bold hidden md:table-cell w-16">Next</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((r) => {
                const band = bandOf(r.description)
                return (
                  <tr key={r.club_id}>
                    <td className="relative py-2 pl-2 pr-0.5 sm:pl-3 sm:pr-1">
                      {/* ⚠ A positioned bar, not `border-l`, and the reason is
                          the rounding. `border-radius` curves a border's OUTER
                          corners only — the inner edge of a left border is
                          straight by definition, so the one side we want
                          softened is the one side a border cannot soften.
                          Square and flush against the table's edge, rounded on
                          the inner side.

                          It still breaks between rows: `border-separate` with
                          2px spacing means each cell is its own box, and
                          `inset-y-0` fills that box rather than bridging the
                          gap. */}
                      {band && (
                        <span
                          className={`absolute left-0 inset-y-0 w-[3px] rounded-r-full ${BAND_SWATCH[band]}`}
                          aria-hidden="true"
                        />
                      )}
                      <div className="flex items-center gap-0.5 sm:gap-1.5">
                        <span className="font-bold text-neutral-900">{r.rank}</span>
                        <Movement direction={r.movement} />
                      </div>
                    </td>
                    {/* ⚠ Keep this in step with the header's padding. The
                        header was tightened to `px-1` on mobile and this was
                        left at `px-2`, which is half of why the crest sat so
                        far from the position number. */}
                    <td className="py-2 px-1 sm:px-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        {r.crest_url && (
                          <img src={r.crest_url} alt="" className="w-5 h-5 object-contain shrink-0" />
                        )}
                        {/* Full name where there is room, a shortened one on a
                            phone. Truncation is the alternative and it is worse
                            here: "Manchester Unit…" and "Manchester Cit…" lose
                            precisely the word that tells them apart. */}
                        <span className="font-semibold text-neutral-900 truncate">
                          <span className="hidden sm:inline">{r.club_name}</span>
                          <span className="sm:hidden">{shortClubName(r.club_name)}</span>
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-0.5 sm:px-3 text-right text-neutral-600">{r.played}</td>
                    <td className="py-2 px-0.5 sm:px-3 text-right text-neutral-600">{r.won}</td>
                    <td className="py-2 px-0.5 sm:px-3 text-right text-neutral-600">{r.drawn}</td>
                    <td className="py-2 px-0.5 sm:px-3 text-right text-neutral-600">{r.lost}</td>
                    <td className="py-2 px-0.5 sm:px-3 text-right text-neutral-600 whitespace-nowrap">
                      {r.goals_for}<span className="text-neutral-400">/</span>{r.goals_against}
                      <span className="sr-only"> goals for and against</span>
                    </td>
                    <td className="py-2 px-0.5 sm:px-3 text-right text-neutral-600">
                      {r.goals_diff > 0 ? `+${r.goals_diff}` : r.goals_diff}
                    </td>
                    <td className="py-2 pl-0.5 pr-2 sm:px-3 text-right font-bold text-neutral-900">{r.points}</td>
                    <td className="py-2 px-3 hidden md:table-cell">
                      <Form form={r.form} />
                    </td>
                    <td className="py-2 pl-3 pr-4 hidden md:table-cell">
                      <Next fixture={nextByClub?.get(r.club_id)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {bandsPresent.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {bandsPresent.map((b) => (
            <span key={b} className="flex items-center gap-1.5 text-xs text-neutral-500">
              <span className={`w-1 h-3 rounded-full ${BAND_SWATCH[b]}`} aria-hidden="true" />
              {BAND_LABEL[b]}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-neutral-400">
        Positions, points and form come from the official feed, so deductions and
        tiebreakers match the real table.
      </p>
    </div>
  )
}

function Movement({ direction }: { direction: 'up' | 'down' | 'same' | null }) {
  if (direction === 'up') {
    return <span className="text-success-600 text-[9px] leading-none" aria-label="up">▲</span>
  }
  if (direction === 'down') {
    return <span className="text-danger-600 text-[9px] leading-none" aria-label="down">▼</span>
  }
  // `same` and unknown both render an empty slot of the SAME WIDTH, so the
  // position column does not jitter between clubs.
  return <span className="w-[7px] inline-block" aria-hidden="true" />
}

/** Most recent LAST, matching how the feed sends it and how tables print it. */
function Form({ form }: { form: string | null }) {
  if (!form) return <span className="text-neutral-300 text-xs">—</span>
  const letters = form.slice(-5).split('')
  return (
    <span className="flex items-center justify-end gap-1" aria-label={`Recent form: ${letters.join(', ')}`}>
      {letters.map((c, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`w-4 h-4 rounded-[3px] text-[9px] font-bold flex items-center justify-center ${
            c === 'W' ? 'bg-success-100 text-success-700'
              : c === 'L' ? 'bg-danger-100 text-danger-700'
              : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          {c}
        </span>
      ))}
    </span>
  )
}


/**
 * Who this club plays next — the opponent's crest, and nothing else.
 *
 * A first pass carried `v`/`@`, the three-letter code and the crest. Ryan cut
 * it to the badge alone: in a table already holding eight numeric columns, the
 * crest is recognised faster than any of them and the rest was detail nobody
 * had asked the table for.
 *
 * ⚠ The detail survives for anyone who cannot see the badge. Home or away, the
 * opponent's full name and the kickoff stay in the `title` and in a
 * screen-reader-only string — a column of unlabelled images would otherwise be
 * a column of nothing to a screen reader. Costs no pixels.
 *
 * Hidden below `md` with Form, which is where the table runs out of width — on
 * a phone the standings themselves are the point.
 */
function Next({ fixture }: { fixture?: NextFixture }) {
  if (!fixture) {
    // No fixture left is a real answer in May, not an error.
    return <span className="text-neutral-300 text-xs">—</span>
  }
  /* ⚠ No date in `title` or in the server-rendered text. A `title` attribute
     mismatches at hydration exactly like visible text does, and this one would:
     the kickoff formats differently on Node and in the browser. The date is
     genuinely useful, so it renders through LocalTime below — client-only,
     therefore agreeing with itself — while the tooltip keeps the half that is
     timezone-free. */
  const spoken = `${fixture.isHome ? 'At home to' : 'Away to'} ${fixture.opponentName}`

  return (
    <span className="flex items-center justify-end" title={spoken}>
      {fixture.opponentCrest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fixture.opponentCrest} alt="" className="w-5 h-5 object-contain shrink-0" />
      ) : (
        // A club with no crest still has to say who it is.
        <span className="text-neutral-600 text-xs font-semibold">
          {fixture.opponentAbbr ?? fixture.opponentName}
        </span>
      )}
      <span className="sr-only">
        {spoken}, <LocalTime iso={fixture.kickoffAt} format={formatKickoff} />
      </span>
    </span>
  )
}
