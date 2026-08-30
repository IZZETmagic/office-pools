'use client'

// =============================================================
// SCORES DEPTH — a scoreline per fixture
// =============================================================
// The twin of MatchweekResultsForm, and a SIBLING of KnockoutStageForm for the
// same reason that one is: KnockoutStageForm is the World Cup's, and it carries
// knockout concerns — penalty shootouts, a winner picker for a drawn tie, a
// match number, a group letter under each country, section headers that split
// the third-place match from the final. None of those exist in a league
// matchweek, and a league pool was rendering all of them.
//
// The one that mattered: `pso_enabled` defaults to TRUE (app/pools/[pool_id]/
// page.tsx), so predicting 1-1 in a Premier League matchweek opened a "Penalty
// Shootout Score" panel and told the member, in amber, that a PSO score was
// REQUIRED. There are no penalties in a league draw. Nothing downstream reads
// those columns for a league fixture — `league_score_fixture` scores
// home/away only — so the panel demanded a number that could never count.
//
// Everything else here is MatchweekResultsForm's layout, unchanged on purpose:
// the same three columns, the same capped and centred control, the same crests
// and three-letter codes on a phone. A member moving between a Scores pool and
// a Results pool should see the same fixture list with a different control in
// the middle, not a different screen — and until this file existed, they saw a
// different screen.
// =============================================================

import { useCallback, useEffect, useRef } from 'react'
import { Match, GroupStanding, PredictionMap, ScoreEntry, shortTeamName } from '@/lib/tournament'
import { Card } from '@/components/ui/Card'

/**
 * 0 to 15, and round again — the modulus `TapScoreField` counts on, lifted
 * unchanged from mobile/components/pool-detail/TapScoreField.tsx so the two
 * surfaces cannot drift into counting differently.
 */
export const GOAL_WRAP = 16

/**
 * The next value for one step.
 *
 * ⚠ An unpicked box lands on 0 whichever way it is stepped, up or down. The app
 * does `((value ?? -1) + 1) % 16`, which is the same thing in the up direction;
 * spelling it out is what lets the down direction share the rule instead of
 * arriving at 15, which is a very strange thing for a first click to produce.
 */
export function stepGoals(value: number | null, delta: 1 | -1): number {
  if (value == null) return 0
  return (value + delta + GOAL_WRAP) % GOAL_WRAP
}

type ResolvedMatch = {
  match: Match
  homeTeam: GroupStanding | null
  awayTeam: GroupStanding | null
}

type Props = {
  resolvedMatches: ResolvedMatch[]
  predictions: PredictionMap
  onUpdatePrediction?: (matchId: string, score: ScoreEntry) => void
  readOnly?: boolean
}

export function MatchweekScoresForm({ resolvedMatches, predictions, onUpdatePrediction, readOnly }: Props) {
  return (
    <div>
      {/* ⚠ THE ONE PLACE THE CONTROL EXPLAINS ITSELF, and it has to exist.
          A box that counts up when you click it is not a convention a member
          arrives already knowing, and the two ways back — right-click, hold —
          have no visible affordance at all. Said once above the list rather
          than twenty times inside it, and only while the matchweek is still
          open, because after the lock there is nothing to act on.

          It states the actual mechanism in one sentence, which is the bar
          CLAUDE.md sets for anything that shapes how a member plays. */}
      {!readOnly && (
        <p className="mb-3 text-xs text-muted">
          Tap a box to add a goal. Hold to clear it, or right-click to take one back.
        </p>
      )}

      {/* No "N of N matches predicted" line and no "all predicted" badge — both
          sit in the matchweek strip above as a single completion ring. Printing
          the same fact twice on one screen reads as a bug rather than as
          reassurance. KnockoutStageForm keeps its counter; it has no strip. */}
      <div className="space-y-3">
        {resolvedMatches.map(({ match, homeTeam, awayTeam }) => (
          <ScoresMatchCard
            key={match.match_id}
            match={match}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            prediction={predictions.get(match.match_id)}
            onUpdate={onUpdatePrediction}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  )
}

// =============================================================

function ScoresMatchCard({
  match,
  homeTeam,
  awayTeam,
  prediction,
  onUpdate,
  readOnly,
}: {
  match: Match
  homeTeam: GroupStanding | null
  awayTeam: GroupStanding | null
  prediction: ScoreEntry | undefined
  onUpdate?: (matchId: string, score: ScoreEntry) => void
  readOnly?: boolean
}) {
  const homeName = shortTeamName(homeTeam?.country_name || match.home_team_placeholder || 'TBD')
  const awayName = shortTeamName(awayTeam?.country_name || match.away_team_placeholder || 'TBD')
  const bothResolved = homeTeam !== null && awayTeam !== null
  const disabled = !bothResolved || readOnly === true

  const home = prediction?.home ?? null
  const away = prediction?.away ?? null

  // Which club this scoreline backs. The Results form highlights the club you
  // picked; here the numbers already say it, and this carries the same fact in
  // the same place so the two depths read alike. Null until BOTH halves are in
  // — 2 with an empty box beside it is not yet a prediction of anything.
  const backed: 'home' | 'draw' | 'away' | null =
    home == null || away == null ? null : home > away ? 'home' : home < away ? 'away' : 'draw'

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

  /**
   * ⚠ Nothing to validate any more, and that is the point.
   *
   * The knockout card took free text and ran `parseInt` over it, which let "07"
   * through as 7, "1e2" through as 1 and a pasted "12345" through as a
   * five-figure scoreline the database would have stored. A control that can
   * only ever hand back a number in 0..15 or null has no bad input to reject.
   *
   * `null` is a state the app's own field cannot reach — it resets to 0 — and
   * it is kept here deliberately. At this depth "no pick" and "0 goals" are
   * different claims: the first is not scored and the second predicts a clean
   * sheet, and since a half-filled scoreline is no longer saved at all
   * (ProgressivePredictionsFlow), a member needs a way back to unpicked.
   */
  const setGoal = (side: 'home' | 'away', next: number | null) => {
    if (disabled || !onUpdate) return
    const current: ScoreEntry = prediction ?? { home: null, away: null }
    onUpdate(match.match_id, { ...current, [side]: next })
  }

  return (
    <Card padding="md">
      {/* Two layouts, one markup — identical to the Results card.

          Desktop reads left to right like a fixture list: WHEN on the left, the
          scoreline centred, WHERE on the right. A three-column GRID rather than
          flex, so the "v" lands on the same x down the whole matchweek — sized
          by content it drifts a few pixels a row and the list reads crooked.

          A phone has no room for a third column, so the venue is dropped (it is
          the least useful of the three while you are picking) and the date moves
          above the scoreline, which then takes the full width. */}
      <div className="sm:hidden text-xs text-muted mb-2.5">
        {dateStr} · {timeStr}
      </div>

      <div className="sm:grid sm:grid-cols-[6.25rem_1fr_6.5rem] lg:grid-cols-[7.5rem_1fr_10.5rem] sm:items-center sm:gap-2 lg:gap-3">
        <div className="hidden sm:block text-xs text-muted leading-tight">
          <span className="font-medium text-ink">{dateStr}</span>
          <br />
          <span>{timeStr}</span>
        </div>

        {/* Capped and centred, for the reason the Results control is: left to
            fill a 1fr column the club names kept growing with the viewport
            while the two boxes stayed fixed, so on a wide monitor the scoreline
            — the only thing on this screen a member can change — sat marooned
            between two enormous labels.

            ⚠ 34rem, where the Results control is capped at 30rem. NOT a drift.
            That row is three things; this one is seven — name, crest, box, v,
            box, crest, name — in the same width, which is why it needed the air
            and why the air had to come from somewhere. At 30rem the gaps below
            would have been paid for out of the club columns: each falls to
            ~162px against the ~158px that "Manchester United" plus its crest
            actually needs, so the longest name in the competition would have
            spent the season four pixels from an ellipsis. 34rem gives both
            columns their full 12rem cap with slack to spare.

            The three grid COLUMNS are untouched, so a member switching between
            a Scores pool and a Results pool still finds the date, the control
            and the venue on the same three x positions.

            ⚠ `sm:w-full` is load-bearing next to `sm:mx-auto`. This div is a
            GRID ITEM, and an auto horizontal margin on a grid item switches its
            used width from stretch to fit-content, so `mx-auto` alone makes the
            group shrink-wrap and `max-w` never engages. */}
        <div
          role="group"
          aria-label={`Score for ${homeName} against ${awayName}`}
          className="flex items-center gap-2.5 lg:gap-3 sm:w-full sm:max-w-[34rem] sm:mx-auto"
        >
          <ClubLabel
            side="home"
            name={homeName}
            abbr={homeTeam?.country_code ?? null}
            crestUrl={homeTeam?.flag_url ?? null}
            backed={backed === 'home'}
            dimmed={!bothResolved}
          />

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <GoalsField
              value={home}
              label={`Goals for ${homeName}`}
              disabled={disabled}
              onChange={(v) => setGoal('home', v)}
            />
            <span aria-hidden="true" className="text-[11px] font-bold text-muted px-1">v</span>
            <GoalsField
              value={away}
              label={`Goals for ${awayName}`}
              disabled={disabled}
              onChange={(v) => setGoal('away', v)}
            />
          </div>

          <ClubLabel
            side="away"
            name={awayName}
            abbr={awayTeam?.country_code ?? null}
            crestUrl={awayTeam?.flag_url ?? null}
            backed={backed === 'away'}
            dimmed={!bothResolved}
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
 * One goal count, as a tap target.
 *
 * ⚠ NOT A TEXT FIELD ANY MORE. This is `TapScoreField` from the app
 * (mobile/components/pool-detail/TapScoreField.tsx) brought across: the box IS
 * the control, a click adds a goal, and it counts 0..15 and comes round again.
 * Ryan's call, and the two surfaces should not ask for the same prediction in
 * two different ways.
 *
 * What the web adds, because a browser has inputs the phone does not:
 *
 *  - RIGHT-CLICK takes a goal back. Only from a real mouse — `pointerType` is
 *    recorded on pointerdown, because Android Chrome fires `contextmenu` on a
 *    touch long-press too, and without the check a single long finger would
 *    both decrement and clear.
 *  - HOLD (400ms, the app's `delayLongPress`) clears the box. The app resets to
 *    0; this clears to unpicked, for the reason given at `setGoal`. It is also
 *    the only way back on a touchscreen, where there is no right-click.
 *  - ARROW KEYS and a typed DIGIT, so this is not mouse-only. `role="spinbutton"`
 *    is what makes a screen reader announce the value and expect Up and Down —
 *    the alternative was a control whose entire decrement was invisible to
 *    assistive tech.
 *
 * The context menu is suppressed on this 44px box and nowhere else.
 *
 * ⚠ Deliberately NOT pulsing. The app breathes its empty dot because a phone
 * shows two or three fixtures at once; a matchweek on a monitor shows twenty
 * boxes, and twenty things breathing in unison is not an invitation, it is a
 * fault indicator.
 */
function GoalsField({
  value, label, disabled, onChange,
}: {
  value: number | null
  label: string
  disabled: boolean
  onChange: (next: number | null) => void
}) {
  const filled = value !== null

  // Long-press bookkeeping. `heldRef` suppresses the click that a mouse fires
  // after the hold has already cleared the box.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heldRef = useRef(false)
  const pointerTypeRef = useRef<string>('mouse')

  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }, [])

  // A hold that outlives its own card would clear a pick on a matchweek the
  // member has already navigated away from — 400ms is short, but switching
  // matchweek mid-press is one tap away on this screen.
  useEffect(() => cancelHold, [cancelHold])

  const step = (delta: 1 | -1) => {
    if (disabled) return
    onChange(stepGoals(value, delta))
  }

  return (
    <button
      type="button"
      role="spinbutton"
      aria-label={label}
      // `aria-valuenow` is omitted rather than faked when the box is empty:
      // there is no value, and 0 is a real prediction that would be a lie here.
      aria-valuenow={filled ? value : undefined}
      aria-valuemin={0}
      aria-valuemax={GOAL_WRAP - 1}
      aria-valuetext={filled ? String(value) : 'No score'}
      title="Click to add a goal · right-click to take one back · hold to clear"
      disabled={disabled}
      onPointerDown={(e) => {
        pointerTypeRef.current = e.pointerType
        if (e.button !== 0) return
        heldRef.current = false
        cancelHold()
        holdTimer.current = setTimeout(() => {
          heldRef.current = true
          onChange(null)
        }, 400)
      }}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onClick={() => {
        if (heldRef.current) {
          heldRef.current = false
          return
        }
        step(1)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        if (pointerTypeRef.current === 'mouse') step(-1)
      }}
      onKeyDown={(e) => {
        // Enter and Space already reach onClick through the button itself.
        if (e.key === 'ArrowUp') { e.preventDefault(); step(1) }
        else if (e.key === 'ArrowDown') { e.preventDefault(); step(-1) }
        else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); onChange(null) }
        else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); onChange(Number(e.key)) }
      }}
      // Stops a phone offering "copy / look up" on the hold, and stops a run of
      // fast clicks selecting the number or zooming the page.
      style={{ WebkitTouchCallout: 'none' }}
      className={[
        // 44px is the smallest comfortable tap target; the app draws 48x44 and
        // this matches it from `sm` up.
        'w-11 h-11 sm:w-12 sm:h-11 shrink-0 select-none touch-manipulation',
        'flex items-center justify-center rounded-control border transition-colors',
        'text-lg t-num t-num-extrabold text-ink',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1',
        // The app's own two states: mist and borderless when empty, a primary
        // wash at 18% behind a 35% primary border once it holds a number.
        filled
          ? 'bg-primary-600/[0.18] border-primary-500/[0.35]'
          : 'bg-mist border-transparent hover:border-border-strong',
        disabled ? 'opacity-50 cursor-not-allowed hover:border-transparent' : 'active:opacity-70',
      ].join(' ')}
    >
      {filled ? (
        value
      ) : (
        // The app's empty dot, held still. `muted` IS slate — globals.css
        // exposes the palette's slate under that name so a bare `text-slate`
        // cannot be misread as a typo for Tailwind's own `slate-500`.
        <span className="w-2 h-2 rounded-pill bg-muted/70" aria-hidden="true" />
      )}
    </button>
  )
}

/**
 * One club, as a label.
 *
 * Mirrored, but the OTHER WAY UP from the Results form — the crests sit on the
 * inside, bracketing the scoreline:
 *
 *     Arsenal 🔴 [2] v [1] 🔵 Chelsea
 *
 * ⚠ Deliberate, and Ryan's call. The Results form puts each crest at the OUTER
 * edge because there the crest is the affordance — it is the thing you tap, so
 * it leads its button. Nothing is tapped here, and the pair of boxes in the
 * middle is the only place a member looks; a crest against the box it belongs
 * to says which number is whose without reading a word, which is the whole job
 * a crest has on this screen. It is also the shape every scoreboard uses.
 *
 * Mechanically this is one flipped condition: `flex-row-reverse` moves from the
 * away side to the home side. With the label content sized by content rather
 * than grown, reversing the axis also flips which edge it packs against, so the
 * crest lands beside the scoreline and the name runs outwards from it.
 *
 * ⚠ Deliberately NOT a bordered tile like the Results form's. There the club IS
 * the control, and the border is what says so; here the control is the pair of
 * boxes, and a club drawn to look identically tappable would be a promise the
 * card cannot keep. The selection cue that survives is the weight shift, which
 * is the same one the Results form uses — and for the same reason the name is
 * never re-COLOURED to show it: `text-primary-800` is brighter but less luminant
 * than `text-ink` in dark mode, so the club you had backed would read softer
 * than the one you had not.
 */
function ClubLabel({
  side, name, abbr, crestUrl, backed, dimmed,
}: {
  side: 'home' | 'away'
  name: string
  /**
   * The club's three-letter code — ARS, MCI, NOT — straight from api-football
   * via `league_clubs.abbreviation`, which the adapter carries in `country_code`
   * (the World Cup field names are wrong for a club; see lib/league/read.ts).
   */
  abbr: string | null
  crestUrl: string | null
  backed: boolean
  dimmed: boolean
}) {
  // ⚠ Square and `object-contain`. The knockout card drew crests in the
  // national-flag box — `w-6 h-4 rounded-[2px] object-cover` — which crops a
  // round club badge top and bottom, and it was `hidden sm:block`, so a phone
  // showed no crests at all.
  const crest = crestUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={crestUrl} alt="" className="w-5 h-5 sm:w-7 sm:h-7 object-contain shrink-0" />
  ) : (
    <span className="w-5 h-5 sm:w-7 sm:h-7 rounded-pill bg-mist shrink-0" aria-hidden="true" />
  )

  return (
    <div
      className={[
        'flex-1 basis-0 min-w-0 flex items-center gap-2 sm:gap-2.5 sm:max-w-[12rem]',
        side === 'home' ? 'flex-row-reverse' : '',
        dimmed ? 'opacity-50' : '',
      ].join(' ')}
    >
      {crest}
      {/* Full name on desktop, three-letter code on a phone. At 375px "Crystal
          Palace" and "Nottingham Forest" truncate to "Crystal P…" and
          "Nottingham…", which is worse than CRY and NOT — an abbreviation is
          read as a whole word, an ellipsis is read as a failure. */}
      <span
        className={[
          'truncate text-ink',
          side === 'away' ? 'text-left' : 'text-right',
          backed ? 'font-bold' : 'font-semibold',
        ].join(' ')}
      >
        <span className="hidden sm:inline text-sm">{name}</span>
        <span className="sm:hidden text-[13px] tracking-wide">{abbr ?? name}</span>
      </span>
    </div>
  )
}
