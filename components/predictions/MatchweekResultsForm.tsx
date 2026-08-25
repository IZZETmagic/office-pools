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
import { Badge } from '@/components/ui/Badge'
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
  const total = resolvedMatches.length
  const picked = resolvedMatches.filter((rm) => outcomes.has(rm.match.match_id)).length

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          <span className="font-bold text-neutral-900">{picked}</span> of{' '}
          <span className="font-bold text-neutral-900">{total}</span> matches predicted
        </p>
        {picked === total && total > 0 && <Badge variant="green">All matches predicted</Badge>}
      </div>

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
  const disabled = !bothResolved || readOnly

  // Rendered in the viewer's own timezone — `match_date` is a UTC instant, and
  // showing the zone means nobody has to guess which clock a deadline is on.
  const matchDate = new Date(match.match_date)
  const dateStr = matchDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  const timeStr = matchDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })

  const pick = (value: LeagueOutcome) => {
    if (disabled || !onUpdate) return
    onUpdate(match.match_id, value)
  }

  return (
    <Card padding="md">
      <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap">
        <span className="text-[10px] sm:text-xs text-neutral-400 shrink-0 mr-0.5 sm:mr-2">#{match.match_number}</span>
        <div className="hidden sm:block shrink-0 w-[108px] text-xs text-neutral-500 leading-tight">
          <span className="font-medium text-neutral-700">{dateStr}</span>
          <br />
          <span>{timeStr}</span>
        </div>

        {/* Home */}
        <div className="flex-1 basis-0 text-right min-w-0 flex items-center justify-end gap-1.5">
          <p className={`text-[11px] sm:text-sm font-semibold truncate ${outcome === 'home' ? 'text-neutral-900' : bothResolved ? 'text-neutral-700' : 'text-neutral-500'}`}>
            {homeName}
          </p>
          {homeTeam?.flag_url && (
            <img src={homeTeam.flag_url} alt="" className="hidden sm:block w-6 h-4 rounded-[2px] object-cover shrink-0" />
          )}
        </div>

        {/* The tap. A real radio group, not three buttons that look like one:
            screen readers announce it as one control with three options, and
            arrow keys move between them the way people expect. */}
        <div
          role="radiogroup"
          aria-label={`Result for ${homeName} against ${awayName}`}
          className="flex items-center shrink-0 rounded-md border border-neutral-300 overflow-hidden"
        >
          {(
            [
              ['home', 'Home', homeName],
              ['draw', 'Draw', 'a draw'],
              ['away', 'Away', awayName],
            ] as const
          ).map(([value, label, spoken], i) => {
            const selected = outcome === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={value === 'draw' ? 'Draw' : `${spoken} to win`}
                disabled={disabled}
                onClick={() => pick(value)}
                className={[
                  'h-8 sm:h-9 px-2 sm:px-3 text-[11px] sm:text-xs font-bold transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset',
                  i > 0 ? 'border-l border-neutral-300' : '',
                  selected
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface text-neutral-600 hover:bg-neutral-50',
                  disabled ? 'opacity-50 cursor-not-allowed hover:bg-surface' : '',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Away */}
        <div className="flex-1 basis-0 text-left min-w-0 flex items-center gap-1.5">
          {awayTeam?.flag_url && (
            <img src={awayTeam.flag_url} alt="" className="hidden sm:block w-6 h-4 rounded-[2px] object-cover shrink-0" />
          )}
          <p className={`text-[11px] sm:text-sm font-semibold truncate ${outcome === 'away' ? 'text-neutral-900' : bothResolved ? 'text-neutral-700' : 'text-neutral-500'}`}>
            {awayName}
          </p>
        </div>
      </div>
    </Card>
  )
}
