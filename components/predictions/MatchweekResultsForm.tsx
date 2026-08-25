'use client'

// =============================================================
// RESULTS DEPTH — one tap per fixture
// =============================================================
// Decision 9's pre-selected recommendation, and the reason it matters: a season
// is 380 fixtures. At Scores depth that is 760 numbers typed between August and
// May. Here it is 380 taps.
//
// This is deliberately a SIBLING of KnockoutStageForm rather than a `depth`
// branch inside it. That component is the World Cup's, and it carries knockout
// concerns — penalty shootouts, a winner picker for drawn ties, bracket
// resolution — none of which exist in a league matchweek. Threading a second
// input mode through all of that would have made both harder to read.
//
// The row layout is copied from KnockoutMatchCard on purpose: a member moving
// between a Scores pool and a Results pool should see the same fixture list with
// a different control in the middle, not a different screen.
// =============================================================

import { Match, GroupStanding, shortTeamName } from '@/lib/tournament'
import { Card } from '@/components/ui/Card'

export type LeagueOutcome = 'home' | 'draw' | 'away'

type ResolvedMatch = {
  match: Match
  homeTeam: GroupStanding | null
  awayTeam: GroupStanding | null
}

type Props = {
  resolvedMatches: ResolvedMatch[]
  /** Keyed by fixture id. Absent means not yet picked. */
  outcomes: Map<string, LeagueOutcome>
  onUpdateOutcome?: (matchId: string, outcome: LeagueOutcome) => void
  readOnly?: boolean
}

export function MatchweekResultsForm({ resolvedMatches, outcomes, onUpdateOutcome, readOnly }: Props) {
  return (
    <div>
      {/* The "N of N matches predicted" line and its "All matches predicted"
          badge lived here. Both now sit in the matchweek strip above as a
          single completion ring, and printing the same fact twice on one screen
          reads as a bug rather than as reassurance. */}
      <div className="space-y-3">
        {resolvedMatches.map(({ match, homeTeam, awayTeam }) => (
          <ResultsMatchCard
            key={match.match_id}
            match={match}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            outcome={outcomes.get(match.match_id)}
            onUpdate={onUpdateOutcome}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  )
}

// =============================================================

function ResultsMatchCard({
  match,
  homeTeam,
  awayTeam,
  outcome,
  onUpdate,
  readOnly,
}: {
  match: Match
  homeTeam: GroupStanding | null
  awayTeam: GroupStanding | null
  outcome: LeagueOutcome | undefined
  onUpdate?: (matchId: string, outcome: LeagueOutcome) => void
  readOnly?: boolean
}) {
  const homeName = shortTeamName(homeTeam?.country_name || match.home_team_placeholder || 'TBD')
  const awayName = shortTeamName(awayTeam?.country_name || match.away_team_placeholder || 'TBD')
  const bothResolved = homeTeam !== null && awayTeam !== null
  const disabled = !bothResolved || readOnly === true

  // Rendered in the viewer's own timezone — `match_date` is a UTC instant, and
  // showing the zone means nobody has to guess which clock a deadline is on.
  const matchDate = new Date(match.match_date)
  const dateStr = matchDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  const timeStr = matchDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })

  const [venueName, venueCity] = (() => {
    const v = match.venue?.trim()
    if (!v) return [null, null] as const
    const i = v.lastIndexOf(', ')
    return i === -1 ? ([v, null] as const) : ([v.slice(0, i), v.slice(i + 2)] as const)
  })()

  const pick = (value: LeagueOutcome) => {
    if (disabled || !onUpdate) return
    onUpdate(match.match_id, value)
  }

  return (
    <Card padding="md">
      {/* ⚠ THE CLUB IS THE BUTTON.
          This was a Home / Draw / Away segmented control sitting BETWEEN the two
          clubs, which made every pick an act of translation: read "Crystal
          Palace v Manchester City", decide City, then work out that City is
          "Away" and tap a word. Three hundred and eighty times a season.

          Everywhere else the product already speaks in clubs — `outcomeLabel`
          renders "Manchester City win" on the Results tab, Last Man Standing is
          "pick one club to win", the Scoring Rules screen says "you call each
          match". Only the control spoke in positions.

          So the club cards ARE the radios. The crest stops being decoration and
          becomes the affordance, which is also why it now renders on mobile —
          it was `hidden sm:block` when it was only ornament.

          The radiogroup semantics are unchanged: still one control with three
          options, still arrow-key navigable, still spoken as "Manchester City
          to win" rather than "Away". */}
      {/* Two layouts, one markup.

          Desktop reads left to right like a fixture list: WHEN on the left,
          the choice centred, WHERE on the right. A three-column GRID rather
          than flex, so the Draw lands on the same x down the whole matchweek —
          sized by content it drifted a few pixels a row and the list read
          crooked.

          A phone has no room for a third column, so the venue is dropped (it is
          the least useful of the three while you are picking) and the date
          moves above the choice, which then takes the full width.

          The outer columns narrow between sm and lg. Held at their full width
          they squeezed the middle at tablet sizes and clipped the long names —
          and the choice is the reason this screen exists, so it should be the
          last thing to give up space. */}
      <div className="sm:hidden text-xs text-muted mb-2.5">
        {dateStr} · {timeStr}
      </div>

      <div className="sm:grid sm:grid-cols-[6.25rem_1fr_6.5rem] lg:grid-cols-[7.5rem_1fr_10.5rem] sm:items-center sm:gap-2 lg:gap-3">
        <div className="hidden sm:block text-xs text-muted leading-tight">
          <span className="font-medium text-ink">{dateStr}</span>
          <br />
          <span>{timeStr}</span>
        </div>

        {/* ⚠ CAPPED, and centred inside its column.

            Left to fill a 1fr column, the club buttons kept growing with the
            viewport while Draw stayed at its fixed 4rem — so on a wide monitor
            two enormous slabs flanked a small pill, and the control read as
            three things of different importance rather than three options.

            The cap is measured, not guessed: the longest club name in this
            competition is "Manchester United" at 120px, plus a 28px crest, an
            8px gap, 24px of padding and the border — about 182px. 12rem per
            side leaves slack without letting them drift apart.

            ⚠ `sm:w-full` is load-bearing next to `sm:mx-auto`. This div is a
            GRID ITEM, and an auto horizontal margin on a grid item switches its
            used width from stretch to fit-content — so `mx-auto` alone made the
            group shrink-wrap to 401px, `max-w` never engaged, and the flex
            children divided a box far smaller than intended. "Manchester
            United" had 85px for 120px of text. */}
        <div
          role="radiogroup"
          aria-label={`Result for ${homeName} against ${awayName}`}
          className="flex items-stretch gap-1.5 sm:gap-2 sm:w-full sm:max-w-[30rem] sm:mx-auto"
        >
        <ClubChoice
          side="home"
          name={homeName}
          abbr={homeTeam?.country_code ?? null}
          crestUrl={homeTeam?.flag_url ?? null}
          selected={outcome === 'home'}
          disabled={disabled}
          onSelect={() => pick('home')}
        />

        <button
          type="button"
          role="radio"
          aria-checked={outcome === 'draw'}
          aria-label="Draw"
          disabled={disabled}
          onClick={() => pick('draw')}
          className={[
            'shrink-0 w-12 sm:w-16 rounded-control border text-[11px] sm:text-xs font-bold transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
            outcome === 'draw'
              ? 'border-primary-500 bg-primary-600/15 ring-1 ring-primary-500 text-ink'
              : 'border-border-default bg-surface text-muted hover:border-border-strong',
            disabled ? 'opacity-50 cursor-not-allowed hover:border-border-default' : '',
          ].join(' ')}
        >
          Draw
        </button>

        <ClubChoice
          side="away"
          name={awayName}
          abbr={awayTeam?.country_code ?? null}
          crestUrl={awayTeam?.flag_url ?? null}
          selected={outcome === 'away'}
          disabled={disabled}
          onSelect={() => pick('away')}
        />
        </div>

        {/* Where. Desktop only. `league_fixtures.venue` is populated on all 380
            fixtures as "Emirates Stadium, London" — one string, two facts — so
            it is split rather than truncated: the city is the half that
            orients you, and it would have been the half an ellipsis ate. */}
        <div className="hidden sm:block text-right text-xs text-muted leading-tight min-w-0">
          {venueName && (
            <>
              <span className="block truncate">{venueName}</span>
              {venueCity && <span className="block truncate">{venueCity}</span>}
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

/**
 * One club, as a radio.
 *
 * Mirrored rather than duplicated: the home side reads crest-then-name and the
 * away side name-then-crest, so the two crests sit at the outer edges and the
 * eye runs inwards to the Draw between them — the shape of a fixture as it is
 * written everywhere else ("Palace v City").
 */
function ClubChoice({
  side, name, abbr, crestUrl, selected, disabled, onSelect,
}: {
  side: 'home' | 'away'
  name: string
  /**
   * The club's three-letter code — ARS, MCI, NOT — straight from api-football
   * via `league_clubs.abbreviation`, which the adapter already carries in
   * `country_code` (the World Cup field names are wrong for a club; see
   * lib/league/read.ts). Populated for all twenty clubs, so no fallback
   * guesswork is needed — but `name` is used if a competition ever ships
   * without one.
   */
  abbr: string | null
  crestUrl: string | null
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const crest = crestUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={crestUrl} alt="" className="w-5 h-5 sm:w-7 sm:h-7 object-contain shrink-0" />
  ) : (
    <span className="w-5 h-5 sm:w-7 sm:h-7 rounded-pill bg-mist shrink-0" aria-hidden="true" />
  )

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${name} to win`}
      disabled={disabled}
      onClick={onSelect}
      className={[
        'flex-1 basis-0 min-w-0 sm:max-w-[12rem] rounded-control border px-1.5 sm:px-3 py-2 sm:py-2.5 transition-colors',
        'flex items-center gap-1.5 sm:gap-2',
        side === 'away' ? 'flex-row-reverse' : '',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
        // ⚠ The NAME stays at full strength either way. Tinting it
        // `text-primary-800` on selection looked right in light mode and
        // backwards in dark: #A3BEFF is bright but less luminant than
        // `text-ink` (#E8EAF0), so the club you had backed read SOFTER than the
        // one you had not. Selection is carried by the ring and the fill, which
        // gain contrast rather than trading it away.
        selected
          ? 'border-primary-500 bg-primary-600/15 ring-1 ring-primary-500'
          : 'border-border-default bg-surface hover:border-border-strong',
        disabled ? 'opacity-50 cursor-not-allowed hover:border-border-default' : '',
      ].join(' ')}
    >
      {crest}
      {/* Full name on desktop, three-letter code on a phone. At 375px
          "Crystal Palace" and "Nottingham Forest" truncated to "Crystal P…"
          and "Nottingham…", which is worse than CRY and NOT — an abbreviation
          is read as a whole word, an ellipsis is read as a failure. The
          accessible name on the button stays the full "Crystal Palace to win"
          either way, so nothing is lost to a screen reader. */}
      <span
        className={[
          'truncate text-ink',
          side === 'away' ? 'text-left' : 'text-right',
          selected ? 'font-bold' : 'font-semibold',
        ].join(' ')}
      >
        <span className="hidden sm:inline text-sm">{name}</span>
        <span className="sm:hidden text-[13px] tracking-wide">{abbr ?? name}</span>
      </span>
    </button>
  )
}
