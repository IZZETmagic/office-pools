'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useStickyState, hasStickyState } from '@/hooks/useStickyState'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { RoundStatusCard } from './RoundStatusCard'
import { GroupStageForm } from './GroupStageForm'
import { KnockoutStageForm } from './KnockoutStageForm'
import { MatchweekResultsForm, type LeagueOutcome } from './MatchweekResultsForm'
import { MatchweekScoresForm } from './MatchweekScoresForm'
import {
  type Match,
  type Team,
  type Prediction,
  type PredictionMap,
  type ScoreEntry,
  isPredictionComplete,
  GROUP_LETTERS,
  calculateGroupStandings,
  type GroupStanding,
  type RoundKey as BracketRoundKey,
} from '@/lib/tournament'
// Round identity comes from the competition, not from lib/tournament's seven
// hardcoded World Cup keys — a league pool's rounds are its matchweeks.
import { isMatchweekKey, isRoundNotYetOpen, matchesInRound, roundLabel, roundShortLabel, sortRoundKeys } from '@/lib/competitionRounds'
import { earlyKickoff } from '@/lib/league/earlyKickoff'
import { resolveMatchesFromActual } from '@/lib/bracketResolver'
import type { PoolRoundState, EntryRoundSubmission, RoundStateValue } from '@/app/pools/[pool_id]/types'
import type { SaveStatus } from './PredictionsFlow'

type Props = {
  matches: Match[]
  teams: Team[]
  entryId: string
  poolId: string
  existingPredictions: Prediction[]
  psoEnabled: boolean
  predictionsLocked: boolean
  roundStates: PoolRoundState[]
  roundSubmissions: EntryRoundSubmission[]
  /**
   * League pools only. 'results' swaps the two score steppers for one tap per
   * fixture. NULL/undefined is every World Cup pool and every league pool
   * created before migration 064, all of which are Scores.
   */
  leagueDepth?: 'results' | 'scores' | null
  /** Saved Results picks, keyed by fixture id. Ignored unless depth is 'results'. */
  existingOutcomes?: Map<string, LeagueOutcome>
  onUnsavedChangesRef?: React.RefObject<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>
  onStatusChange?: (status: { saveStatus: SaveStatus; lastSavedAt: string | null; predictedCount: number }) => void
  /**
   * Draw the round header — the matchweek selector, the state badge and the
   * lock countdown.
   *
   * ⚠ FALSE FOR THE ONE-PAGE SHOWDOWN, where a persistent band above already
   * names the matchweek, and a Showdown member picks for exactly ONE week, so
   * a selector with arrows offers to move somewhere there is nothing to see.
   * Everywhere else it is the only thing carrying that information and stays.
   */
  chrome?: boolean
}

export default function ProgressivePredictionsFlow({
  matches,
  teams,
  entryId,
  poolId,
  existingPredictions,
  psoEnabled,
  predictionsLocked,
  roundStates,
  roundSubmissions,
  leagueDepth,
  existingOutcomes,
  onUnsavedChangesRef,
  onStatusChange,
  chrome = true,
}: Props) {
  const { showToast } = useToast()
  const router = useRouter()

  // Round state maps for quick lookup
  const roundStateMap = useMemo(() => {
    const map = new Map<string, PoolRoundState>()
    for (const rs of roundStates) map.set(rs.round_key, rs)
    return map
  }, [roundStates])

  const roundSubmissionMap = useMemo(() => {
    const map = new Map<string, EntryRoundSubmission>()
    for (const sub of roundSubmissions) map.set(sub.round_key, sub)
    return map
  }, [roundSubmissions])

  // The rounds this pool actually has, in competition order. Read from
  // pool_round_states rather than a constant: a World Cup pool has seven, a
  // Premier League pool has thirty-eight, a Bundesliga pool thirty-four.
  // sortRoundKeys orders matchweeks numerically — lexically, mw_10 precedes mw_2.
  const orderedRoundKeys = useMemo(
    () => sortRoundKeys(roundStates.map(rs => rs.round_key)),
    [roundStates],
  )

  // Find the current active round (first open round, or first non-completed round)
  const initialRound = useMemo(() => {
    const openRound = roundStates.find(rs => rs.state === 'open')
    if (openRound) return openRound.round_key
    const inProgressRound = roundStates.find(rs => rs.state === 'in_progress')
    if (inProgressRound) return inProgressRound.round_key
    // Otherwise the most recent completed round, else the season's first.
    const completed = orderedRoundKeys.filter(
      k => roundStates.find(rs => rs.round_key === k)?.state === 'completed',
    )
    if (completed.length > 0) return completed[completed.length - 1]
    return orderedRoundKeys[0] ?? ''
  }, [roundStates, orderedRoundKeys])

  const [selectedRound, setSelectedRound] = useState<string>(initialRound)

  // Prediction state
  const pendingChanges = useRef(false)

  // Results-depth picks live in their OWN map, not folded into PredictionMap.
  // A tap has no scoreline, and `ScoreEntry` is the World Cup's type — widening
  // it to carry an outcome would put a league concept into shared World Cup
  // code for no gain, since the two depths never render the same control.
  const isResults = leagueDepth === 'results'
  // Sticky — this whole flow unmounts when the member switches tabs, and both
  // maps would otherwise re-seed from the page-load props. Proven, not assumed:
  // tapping a Draw and returning to the tab put the old pick back on screen
  // while the database held the new one.
  const [outcomes, setOutcomes] = useStickyState<Map<string, LeagueOutcome>>(
    `outcomes:${poolId}:${entryId}`,
    new Map(existingOutcomes ?? []),
  )

  const [predictions, setPredictions] = useStickyState<PredictionMap>(
    `predictions:${poolId}:${entryId}`,
    (() => {
      const map = new Map<string, ScoreEntry>()
      for (const p of existingPredictions) {
        map.set(p.match_id, {
          home: p.predicted_home_score,
          away: p.predicted_away_score,
          homePso: p.predicted_home_pso,
          awayPso: p.predicted_away_pso,
          winnerTeamId: p.predicted_winner_team_id,
        })
      }
      return map
    })(),
  )

  // Sync predictions state when existingPredictions prop changes (e.g., after
  // async re-fetch on tab return).
  //
  // ⚠ THE STICKY VALUE WINS FOR THE WHOLE LIFE OF THIS MOUNT, not just its
  // first run. That is `useStickyState`'s stated contract — "the sticky value
  // wins until the page is reloaded" — and this effect used to break it.
  //
  // The guard was `didInitialSync`, a first-run-only check, which held exactly
  // as long as the prop's identity never changed again. It changes on every
  // return to this tab: PoolDetail refetches on `activeTab`, and a new array
  // arrives a moment later. On THAT run the flag was already spent and
  // `pendingChanges` reads false because the autosave had finished — so the
  // fetched snapshot replaced the member's picks. When the fetch was also
  // reading the wrong table for a league pool, the snapshot was empty and the
  // board simply cleared.
  //
  // It must still run on a genuine FIRST mount, because `existingPredictions`
  // can arrive empty and populate from an async fetch and skipping that leaves
  // the screen blank. `hasStickyState` tells the two apart on its own: a cache
  // entry exists only once something has been written from a previous mount —
  // which is to say, only once the member has actually touched a pick.
  useEffect(() => {
    if (hasStickyState(`predictions:${poolId}:${entryId}`)) return
    if (pendingChanges.current) return // Don't overwrite unsaved local edits
    const map = new Map<string, ScoreEntry>()
    for (const p of existingPredictions) {
      map.set(p.match_id, {
        home: p.predicted_home_score,
        away: p.predicted_away_score,
        homePso: p.predicted_home_pso,
        awayPso: p.predicted_away_pso,
        winnerTeamId: p.predicted_winner_team_id,
      })
    }
    setPredictions(map)
  }, [existingPredictions])

  // Track existing prediction IDs for upsert
  const existingPredictionIds = useRef(new Map<string, string>())
  useEffect(() => {
    const map = new Map<string, string>()
    for (const p of existingPredictions) {
      if (p.prediction_id) map.set(p.match_id, p.prediction_id)
    }
    existingPredictionIds.current = map
  }, [existingPredictions])

  // Save state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saving = saveStatus === 'saving'
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const periodicSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const savePredictionsRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Selected round state
  const currentRoundState = roundStateMap.get(selectedRound)
  const currentSubmission = roundSubmissionMap.get(selectedRound)
  const roundMatches = useMemo(() => matchesInRound(matches, selectedRound), [matches, selectedRound])

  const isRoundOpen = currentRoundState?.state === 'open'
  const isRoundPastDeadline = currentRoundState?.deadline
    ? new Date(currentRoundState.deadline) < new Date()
    : false
  // ⚠ NO `isRoundSubmitted` HERE ANY MORE. Nothing in this component may branch
  // on submission state: it gated the form's editability and the save bar's
  // visibility, and both now key on the deadline alone. `currentSubmission` is
  // still read below, but only so RoundStatusCard can DISPLAY the state — never
  // to decide what the member is allowed to do.

  /**
   * ⚠ SUBMITTING DOES NOT LOCK ANYTHING. Only the deadline does.
   *
   * This used to carry an exemption — a league matchweek stayed editable while
   * a World Cup round froze on submit — and 2026-08-29 turned the exemption
   * into the rule for every mode. There is no submit button any longer, so
   * there is no act left to lock on.
   *
   * The league half of that exemption is worth keeping in view, because it is
   * why the rule is the right way round. `has_submitted` is DERIVED there, not
   * pressed — `deriveRoundSubmissions` (lib/league/read.ts) returns true as
   * soon as `done >= total`. A member's TENTH tap silently froze all ten, days
   * before the matchweek locked, with the database still willing to accept a
   * change and no way to reopen it: the admin unlock writes
   * `entry_round_submissions`, which the league path deliberately never writes.
   *
   * The product promises the opposite in three places — Scoring Rules ("locks
   * at the first kickoff"), lib/league/lms ("changing your mind before the lock
   * is allowed and expected"), and migration 058, whose trigger is the real and
   * only gate.
   *
   * What remains says exactly what the database says: it must be the OPEN
   * round, and its lock must not have passed.
   */
  const isMatchweekRound = isMatchweekKey(selectedRound)
  const isReadOnly = predictionsLocked || !isRoundOpen || isRoundPastDeadline

  // Match & round stats
  /**
   * Does THIS round lock long before most of it is played?
   *
   * Computed from the round's own kickoffs rather than passed down, because the
   * fixtures are already here and the alternative is threading a derived fact
   * through the page, the pool payload and the props. Null for all 38 Premier
   * League rounds and 35 of 38 La Liga ones — see lib/league/earlyKickoff.ts.
   */
  const roundEarlyKickoff = useMemo(
    () => earlyKickoff(roundMatches.map((m) => m.match_date)),
    [roundMatches],
  )

  const roundMatchCount = roundMatches.length
  const completedRoundMatchCount = roundMatches.filter(m => (m as any).is_completed).length
  const predictedRoundCount = isResults
    ? roundMatches.filter((m) => outcomes.has(m.match_id)).length
    : roundMatches.filter((m) => isPredictionComplete(predictions.get(m.match_id))).length

  // Bracket resolution for group stage (needed by GroupStageForm for standings display)
  const allGroupStandings = useMemo(() => {
    if (selectedRound !== 'group') return new Map()
    const standings = new Map()
    for (const letter of GROUP_LETTERS) {
      const gMatches = matches.filter(m => m.stage === 'group' && m.group_letter === letter)
      standings.set(letter, calculateGroupStandings(letter, gMatches, predictions, teams))
    }
    return standings
  }, [selectedRound, matches, predictions, teams])

  // Resolved knockout matches for progressive mode (from actual match data).
  //
  // Skipped for any round whose fixtures already name their own teams: the
  // group stage (the draw is published up front) and every league matchweek
  // (Arsenal v Coventry is Arsenal v Coventry from the day the season is
  // released). Those rounds render straight from the fixture, and there is no
  // bracket to resolve them against — resolveMatchesFromActual only understands
  // the seven World Cup rounds.
  const resolvedKnockoutMatches = useMemo(() => {
    if (selectedRound === 'group') return []

    // A league matchweek needs no bracket resolution — its fixtures carry real
    // team ids from the day the season is published. Build the same shape
    // directly from the fixture so the fixture-list form can render it.
    if (isMatchweekKey(selectedRound)) {
      const byId = new Map(teams.map(t => [t.team_id, t]))
      // The card wants a GroupStanding. A league club has no group and no
      // table position at pick time, so the standings fields are zeroed and
      // group_letter is left empty — the card omits its "Group X" caption when
      // there is no group rather than rendering "Group null".
      const asStanding = (t: Team | undefined): GroupStanding | null =>
        t
          ? {
              team_id: t.team_id,
              country_name: t.country_name,
              country_code: t.country_code,
              flag_url: t.flag_url ?? null,
              group_letter: '',
              fifa_ranking_points: 0,
              played: 0, wins: 0, draws: 0, losses: 0,
              goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
            }
          : null
      return roundMatches
        .slice()
        .sort((a, b) => a.match_date.localeCompare(b.match_date) || a.match_number - b.match_number)
        .map(match => ({
          match,
          homeTeam: asStanding(match.home_team_id ? byId.get(match.home_team_id) : undefined),
          awayTeam: asStanding(match.away_team_id ? byId.get(match.away_team_id) : undefined),
        }))
    }

    const resolved = resolveMatchesFromActual(matches, teams, selectedRound as BracketRoundKey)
    return roundMatches
      .sort((a, b) => a.match_number - b.match_number)
      .map(match => ({
        match,
        homeTeam: resolved.get(match.match_number)?.home ?? null,
        awayTeam: resolved.get(match.match_number)?.away ?? null,
      }))
  }, [selectedRound, matches, teams, roundMatches])

  // Total predicted count across all rounds
  const totalPredictedCount = useMemo(() => {
    let count = 0
    for (const m of matches) {
      if (isPredictionComplete(predictions.get(m.match_id))) count++
    }
    return count
  }, [matches, predictions])

  // =====================
  // SAVE LOGIC
  // =====================
  const backupKey = `predictions_progressive_${poolId}_${entryId}`

  const savePredictions = useCallback(async () => {
    if (saving || isReadOnly) return
    pendingChanges.current = false
    setSaveStatus('saving')
    setError(null)

    // Build payload for current round's predictions only.
    //
    // A Results pool sends `outcome` and NOTHING ELSE. The route refuses a
    // payload whose shape disagrees with the pool's depth, and the database
    // refuses a row carrying both — so sending a placeholder scoreline
    // alongside would fail, which is the point: there is no scoreline to send.
    const predictionsPayload: any[] = []
    if (isResults) {
      for (const match of roundMatches) {
        const outcome = outcomes.get(match.match_id)
        if (!outcome) continue
        predictionsPayload.push({ matchId: match.match_id, outcome })
      }
    } else {
      for (const match of roundMatches) {
        const scores = predictions.get(match.match_id)
        if (!scores || (scores.home == null && scores.away == null)) continue
        /**
         * ⚠ A LEAGUE SCORELINE IS SENT WHOLE OR NOT AT ALL.
         *
         * The payload below fills a missing half with `?? 0`, so a member who
         * typed 2 and had not yet reached the away box autosaved a 2-0 — a
         * scoreline they never made, against a fixture the completion ring was
         * still counting as unpicked. The ring and the database disagreed, and
         * the database was the one that gets scored.
         *
         * Scoped to a matchweek because that is where it bites: `league_score_
         * fixture` scores whatever row is there the moment the fixture ends,
         * and there is no submit step left to catch it. The World Cup path is
         * untouched — its pools are complete, and its half-picks have already
         * been scored as they were.
         */
        if (isMatchweekRound && (scores.home == null || scores.away == null)) continue
        const existingId = existingPredictionIds.current.get(match.match_id)
        predictionsPayload.push({
          matchId: match.match_id,
          predictionId: existingId,
          homeScore: scores.home ?? 0,
          awayScore: scores.away ?? 0,
          homePso: scores.homePso ?? null,
          awayPso: scores.awayPso ?? null,
          winnerTeamId: scores.winnerTeamId ?? null,
        })
      }
    }

    if (predictionsPayload.length === 0) {
      setSaveStatus('idle')
      return
    }

    // Check offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const backup: Record<string, ScoreEntry> = {}
        for (const [k, v] of predictions) backup[k] = v
        localStorage.setItem(backupKey, JSON.stringify({ predictions: backup, timestamp: Date.now() }))
        showToast('Saved locally. Will sync when online.', 'warning')
      } catch {}
      setSaveStatus('idle')
      return
    }

    try {
      const res = await fetch(`/api/pools/${poolId}/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId,
          roundKey: selectedRound,
          predictions: predictionsPayload,
        }),
      })

      if (res.status === 401) {
        // Session expired - backup and redirect
        try {
          const backup: Record<string, ScoreEntry> = {}
          for (const [k, v] of predictions) backup[k] = v
          localStorage.setItem(backupKey, JSON.stringify({ predictions: backup, timestamp: Date.now() }))
        } catch {}
        router.push('/login?reason=session_expired')
        return
      }

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save')
      }

      if (data.insertedIds) {
        for (const { match_id, prediction_id } of data.insertedIds) {
          existingPredictionIds.current.set(match_id, prediction_id)
        }
      }

      setLastSavedAt(data.lastSaved)
      setSaveStatus('saved')

      // Clear backup
      try { localStorage.removeItem(backupKey) } catch {}
    } catch (err: any) {
      setSaveStatus('error')
      setError(err.message || 'Failed to save predictions')
    }
    // `outcomes` and `isResults` are dependencies for the same reason
    // `predictions` is: without them useCallback never rebuilds, the ref below
    // keeps pointing at the first closure, and every save would post the map as
    // it was on mount — so a Results pool would silently save nothing.
  }, [saving, isReadOnly, roundMatches, predictions, outcomes, isResults, isMatchweekRound, poolId, entryId, selectedRound, backupKey, showToast])

  // Keep ref in sync
  savePredictionsRef.current = savePredictions

  // =====================
  // AUTO-SAVE TIMERS
  // =====================
  // Same debounce and same dirty flag as updatePrediction, so a Results pool
  // autosaves on exactly the rhythm a Scores pool does.
  const updateOutcome = useCallback((matchId: string, outcome: LeagueOutcome) => {
    setOutcomes((prev) => {
      const next = new Map(prev)
      next.set(matchId, outcome)
      return next
    })
    pendingChanges.current = true
    setSaveStatus('idle')

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      if (pendingChanges.current) savePredictionsRef.current()
    }, 500)
  }, [])

  const updatePrediction = useCallback((matchId: string, score: ScoreEntry) => {
    setPredictions(prev => {
      const next = new Map(prev)
      next.set(matchId, score)
      return next
    })
    pendingChanges.current = true
    setSaveStatus('idle')

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      if (pendingChanges.current) savePredictionsRef.current()
    }, 500)
  }, [])

  // Periodic save (60s safety net)
  useEffect(() => {
    periodicSaveTimer.current = setInterval(() => {
      if (pendingChanges.current && !saving) savePredictionsRef.current()
    }, 60000)
    return () => { if (periodicSaveTimer.current) clearInterval(periodicSaveTimer.current) }
  }, [saving])

  // beforeunload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingChanges.current) {
        e.preventDefault()
        savePredictionsRef.current()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Expose unsaved changes ref to parent
  useEffect(() => {
    if (onUnsavedChangesRef) {
      (onUnsavedChangesRef as React.MutableRefObject<any>).current = {
        hasUnsaved: () => pendingChanges.current,
        save: () => savePredictionsRef.current(),
      }
    }
  })

  // Report status to parent
  useEffect(() => {
    onStatusChange?.({ saveStatus, lastSavedAt, predictedCount: totalPredictedCount })
  }, [saveStatus, lastSavedAt, totalPredictedCount, onStatusChange])

  // =====================
  // RENDER
  // =====================
  // ⚠ THERE IS NO SUBMIT STEP. `submitRound` and its confirmation modal were
  // deleted 2026-08-29 — picks save as they are made and the deadline is the
  // only switch. What the button used to communicate is already on screen and
  // better placed: RoundStatusCard carries the completion ring and a live
  // "Locks in 3d 7h 59m", and the bar below carries the save state. Adding a
  // "locks at" line here would be the third telling of the same fact.
  const roundName = roundLabel(selectedRound)
  const isAllRoundPredicted = predictedRoundCount === roundMatchCount && roundMatchCount > 0

  return (
    <div className="space-y-4">
      {/* Round selector pills.

          ⚠ NOT for a league. A 38-week season is not a pill strip: it scrolled
          off both edges, and 36 of those pills could never be picked anyway
          because only the open matchweek accepts a pick (migration 058). The
          matchweek header carries a stepper and a jump list instead — one
          control, and it scales to the Championship's 46 without the layout
          caring. The World Cup's seven rounds are fine as pills and keep them. */}
      {!isMatchweekRound && (
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
        {orderedRoundKeys.map(key => {
          const rs = roundStateMap.get(key)
          const state = rs?.state ?? 'locked'
          const isSelected = key === selectedRound
          const sub = roundSubmissionMap.get(key)

          let pillColor = 'bg-neutral-100 text-neutral-400'
          if (state === 'open') pillColor = 'bg-blue-50 text-blue-700 border-blue-200'
          if (state === 'in_progress') pillColor = 'bg-amber-50 text-amber-700 border-amber-200'
          if (state === 'completed') pillColor = 'bg-green-50 text-green-700 border-green-200'

          if (isSelected) {
            pillColor = 'bg-primary-600 text-white border-primary-600'
          }

          return (
            <button
              key={key}
              onClick={() => setSelectedRound(key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${pillColor} ${
                state === 'locked' && !isSelected ? 'opacity-50 cursor-default' : 'cursor-pointer'
              }`}
            >
              {roundShortLabel(key)}
              {sub?.has_submitted && !isSelected && (
                <Icon name="checkmark" size={12} className="inline-block ml-1 -mt-0.5" />
              )}
            </button>
          )
        })}
      </div>
      )}

      {/* Round status card */}
      {chrome && (
      <RoundStatusCard
        roundState={currentRoundState ?? {
          id: '', pool_id: poolId, round_key: selectedRound,
          state: 'locked' as RoundStateValue, deadline: null,
          opened_at: null, closed_at: null, completed_at: null,
          opened_by: null, created_at: '', updated_at: '',
        }}
        submission={currentSubmission ?? null}
        matchCount={roundMatchCount}
        completedMatchCount={completedRoundMatchCount}
        predictedCount={predictedRoundCount}
        earlyKickoff={roundEarlyKickoff}
        nav={
          isMatchweekRound
            ? { keys: orderedRoundKeys, selected: selectedRound, onSelect: setSelectedRound }
            : undefined
        }
      />
      )}

      {/* Error */}
      {error && <Alert variant="error">{error}</Alert>}

      {/* Save status bar.

          ⚠ NO LONGER HIDDEN ONCE THE ROUND IS COMPLETE. It used to carry
          `!isRoundSubmitted`, which for a league pool meant it vanished on the
          member's last pick — the exact moment they most want to be told the
          thing is saved. With the submit button gone this bar IS the
          confirmation, so it has to survive completion. */}
      {/* ⚠ `chrome` TAKES THIS TOO — Ryan, on the one-page Showdown. The line is
          the autosave confirmation everywhere else and stays there; on this
          surface the band above is the only header, and a count of picks plus a
          save clock under a sheet that saves itself is chrome about chrome. */}
      {chrome && isRoundOpen && !isRoundPastDeadline && (
        <div className="flex items-center justify-between text-xs text-neutral-500 px-1">
          <span>
            {isAllRoundPredicted
              ? `All ${roundMatchCount} picked`
              : `${predictedRoundCount} / ${roundMatchCount} matches predicted`}
          </span>
          <span>
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && lastSavedAt && `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`}
            {saveStatus === 'error' && <span className="text-red-600">Save failed</span>}
          </span>
        </div>
      )}

      {/* Prediction form for current round.

          ⚠ LOCKED IS NOT ONE STATE. A matchweek reads `'locked'` both before
          its turn and after it has been played, and this branch used to send
          both to the same lock screen — so the week actually being played, the
          one a member most wants to look at on a Saturday, answered "not yet
          available" and showed them nothing. Their picks were in the database
          the whole time.

          A played round now falls through to the form, which `isReadOnly`
          already closes: every control renders disabled with the picks in it,
          the save bar is hidden, and the strip above it still says Locked. */}
      {isRoundNotYetOpen(currentRoundState) ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">
            <Icon name="lock.fill" size={48} className="mx-auto text-neutral-300" />
          </div>
          <p className="text-neutral-500 text-sm">
            {roundName} predictions are not yet available.
          </p>
          <p className="text-neutral-400 text-xs mt-1">
            {isMatchweekKey(selectedRound)
              ? 'Opens as soon as the previous matchweek locks, at its first kickoff.'
              : 'Available after the previous round completes.'}
          </p>
        </div>
      ) : (
        <>
          {/* Group Stage Form */}
          {selectedRound === 'group' && (
            <GroupStageForm
              matches={matches}
              teams={teams}
              predictions={predictions}
              allGroupStandings={allGroupStandings}
              onUpdatePrediction={isReadOnly ? undefined : updatePrediction}
              readOnly={isReadOnly}
            />
          )}

          {/* Results depth: one tap per fixture, instead of two steppers. */}
          {selectedRound !== 'group' && isResults && (
            <MatchweekResultsForm
              resolvedMatches={resolvedKnockoutMatches}
              outcomes={outcomes}
              onUpdateOutcome={isReadOnly ? undefined : updateOutcome}
              readOnly={isReadOnly}
            />
          )}

          {/* Scores depth: the same fixture list as Results, with a scoreline
              where the tap goes.

              ⚠ Keyed on the ROUND being a matchweek, not on `leagueDepth ===
              'scores'`. Depth is NULL for every league pool created before
              migration 064 and all of those are Scores — so a depth test would
              have sent the oldest league pools in the product back to the World
              Cup form, which is the one case this is meant to catch. A World
              Cup round is never a matchweek, so it never reaches here. */}
          {isMatchweekRound && !isResults && (
            <MatchweekScoresForm
              resolvedMatches={resolvedKnockoutMatches}
              predictions={predictions}
              onUpdatePrediction={isReadOnly ? undefined : updatePrediction}
              readOnly={isReadOnly}
            />
          )}

          {/* Knockout Stage Forms — the World Cup's, and only the World Cup's. */}
          {selectedRound !== 'group' && !isResults && !isMatchweekRound && (
            <KnockoutStageForm
              stage={selectedRound}
              resolvedMatches={resolvedKnockoutMatches}
              predictions={predictions}
              onUpdatePrediction={isReadOnly ? undefined : updatePrediction}
              psoEnabled={psoEnabled}
              readOnly={isReadOnly}
            />
          )}

        </>
      )}

    </div>
  )
}
