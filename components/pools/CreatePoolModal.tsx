'use client'

import React, { useState, useEffect } from 'react'
import { Icon } from '@/components/ui/Icon'
import { createClient } from '@/lib/supabase/client'
import { hasCompetitionEnded } from '@/lib/competitionFormat'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'

type CreatePoolModalProps = {
  onClose: () => void
  onSuccess?: () => void
}

type PoolMode = 'full_tournament' | 'progressive' | 'bracket_picker' | 'league_pickem'

/** All four league modes from Decision 9. */
const LEAGUE_MODES = [
  {
    value: 'pickem' as const,
    label: 'Matchweek Pick\u2019em',
    desc: 'Members predict each matchweek\u2019s fixtures. Picks lock at the first kick-off, and the next matchweek opens as that one closes.',
    icon: 'stairs' as const,
  },
  {
    value: 'showdown' as const,
    label: 'Showdown',
    desc: 'The same weekly picks, plus a head-to-head duel against one other member. Three points for beating them, one for a tie. The fixture list is drawn up front, so you can see your rival coming.',
    icon: 'arrow.triangle.merge' as const,
  },
  {
    value: 'last_man_standing' as const,
    label: 'Last Man Standing',
    desc: 'Pick one club a week to win. Get it wrong and you\u2019re out — and you can\u2019t use the same club twice. When one player is left the round ends and a new one starts, so nobody is watching from the sidelines in March.',
    icon: 'flame.fill' as const,
  },
  {
    value: 'table' as const,
    label: 'Predict the Table',
    desc: 'One decision before the season: put all twenty clubs in finishing order. Scored live against the real table all the way to May \u2014 good for people who don\u2019t follow every match.',
    icon: 'list.bullet' as const,
  },
]

/**
 * Level 2, and only for Pick'em. Results is the default on purpose: 380 taps
 * across a season is something people finish, where 760 numbers is not.
 */
const LEAGUE_DEPTHS = [
  {
    value: 'results' as const,
    label: 'Pick a winner',
    desc: 'Home, draw or away. One tap per match.',
  },
  {
    value: 'scores' as const,
    label: 'Predict the score',
    desc: 'Exact goals for both sides. Two numbers per match.',
  },
]

type Tournament = {
  tournament_id: string
  name: string
  short_name: string
  tournament_type: string
  year: number
  host_countries: string | null
  start_date: string
  end_date: string
  status: string
  description: string | null
  /** 'league' | 'groups_knockout'. Null on rows predating migration 024. */
  format: string | null
  /** Set only for a league: the `league_seasons` row this entry actually plays. */
  league_season_id: string | null
}

const SCORING_DEFAULTS = {
  group_exact_score: 100,
  group_correct_difference: 75,
  group_correct_result: 50,
  knockout_exact_score: 200,
  knockout_correct_difference: 150,
  knockout_correct_result: 100,
  round_16_multiplier: 2,
  quarter_final_multiplier: 3,
  semi_final_multiplier: 4,
  third_place_multiplier: 4,
  final_multiplier: 8,
  pso_enabled: true,
  pso_exact_score: 100,
  pso_correct_difference: 75,
  pso_correct_result: 50,
  bonus_group_winner_and_runnerup: 150,
  bonus_group_winner_only: 100,
  bonus_group_runnerup_only: 50,
  bonus_both_qualify_swapped: 75,
  bonus_one_qualifies_wrong_position: 25,
  bonus_all_16_qualified: 75,
  bonus_12_15_qualified: 50,
  bonus_8_11_qualified: 25,
  bonus_correct_bracket_pairing: 50,
  bonus_match_winner_correct: 50,
  bonus_champion_correct: 1000,
  bonus_second_place_correct: 25,
  bonus_third_place_correct: 25,
  bonus_best_player_correct: 100,
  bonus_top_scorer_correct: 100,
}

const STEPS = [
  { key: 'tournament', label: 'Tournament', mobileLabel: 'Tournament' },
  { key: 'pool_type', label: 'Pool Type', mobileLabel: 'Type' },
  { key: 'details', label: 'Details', mobileLabel: 'Details' },
  { key: 'settings', label: 'Settings', mobileLabel: 'Settings' },
] as const

type Step = typeof STEPS[number]['key']

export function CreatePoolModal({ onClose, onSuccess }: CreatePoolModalProps) {
  const supabase = createClient()
  const router = useRouter()
  const { showToast } = useToast()

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('tournament')
  const [slideDirection, setSlideDirection] = useState<'forward' | 'back'>('forward')
  const [slideKey, setSlideKey] = useState(0)

  // Step 1: Tournament
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [tournamentsLoading, setTournamentsLoading] = useState(true)
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)

  // Step 2: Pool Details
  const [poolName, setPoolName] = useState('')
  const [description, setDescription] = useState('')

  // Step 3: Pool Settings
  const [predictionMode, setPredictionMode] = useState<PoolMode>('full_tournament')
  // Level 1 and level 2 of the league mode structure (plan §0.1). Held
  // separately from `predictionMode` because they are a different axis: EVERY
  // league pool is `prediction_mode = 'league_pickem'` — that is the column all
  // the league plumbing keys on — and `league_mode` is what decides whether it
  // is played by picking fixtures or by ordering the table.
  const [leagueMode, setLeagueMode] = useState<'pickem' | 'showdown' | 'last_man_standing' | 'table'>('pickem')
  const [leagueDepth, setLeagueDepth] = useState<'results' | 'scores'>('results')
  const [isPrivate, setIsPrivate] = useState(false)
  const [maxParticipants, setMaxParticipants] = useState('0')
  const [maxEntries, setMaxEntries] = useState('1')
  const [deadlineDate, setDeadlineDate] = useState('2026-06-11')
  const [deadlineTime, setDeadlineTime] = useState('13:00')

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch tournaments on mount
  useEffect(() => {
    async function fetchTournaments() {
      // Bracket AND league competitions. Leagues were off the wizard until
      // 2026-08-16 and could not score even once reinstated, because they ran on
      // World Cup furniture. That is no longer true: the league has its own
      // tables and its own engine (migrations 050-082), and a league pool now
      // scores, ranks, notifies and — in Table mode — pays out.
      //
      // `format` is null on rows predating migration 024; those are brackets.
      const { data } = await supabase
        .from('tournaments')
        .select('tournament_id, name, short_name, tournament_type, year, host_countries, start_date, end_date, status, description, format, external_provider, external_league_id, external_season')
        .or('format.is.null,format.eq.groups_knockout,format.eq.league')
        .order('start_date', { ascending: false })

      // A league's identity is its `league_seasons` row, not the placeholder
      // `tournaments` row that carries its dates. Resolve the pairing here so
      // the wizard submits the season id and the route does not have to trust a
      // client-supplied pair. A league with no season row is DROPPED rather than
      // offered — creating a pool on it would 409 at submit.
      const { data: seasons } = await supabase
        .from('league_seasons')
        .select('season_id, external_provider, external_league_id, external_season')
      const seasonByTriple = new Map<string, string>()
      for (const sn of seasons ?? []) {
        seasonByTriple.set(
          `${sn.external_provider ?? 'api_football'}|${sn.external_league_id}|${sn.external_season}`,
          sn.season_id,
        )
      }

      const withSeason = ((data ?? []) as Array<Tournament & {
        external_provider?: string | null
        external_league_id?: number | null
        external_season?: number | null
      }>).map((t) => {
        if (t.format !== 'league') return { ...t, league_season_id: null }
        const key = `${t.external_provider ?? 'api_football'}|${t.external_league_id}|${t.external_season}`
        return { ...t, league_season_id: seasonByTriple.get(key) ?? null }
      })

      // Drop competitions that have already finished. Creating a pool for a
      // tournament whose last match was played is never what someone means, and
      // the World Cup would otherwise sit at the top of this list forever.
      const list = withSeason.filter(
        (t) => !hasCompetitionEnded(t.end_date) && (t.format !== 'league' || t.league_season_id),
      ) as Tournament[]
      setTournaments(list)
      if (list.length === 1) {
        setSelectedTournamentId(list[0].tournament_id)
      }
      setTournamentsLoading(false)
    }
    fetchTournaments()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTournament = tournaments.find((t) => t.tournament_id === selectedTournamentId)

  // A league has no bracket, so the three World Cup modes cannot score it —
  // `full_tournament` in particular would score ZERO for every fixture,
  // silently, because the scoring gate compares predicted teams against a
  // bracket that does not exist. The competition decides which modes are on
  // offer; format is null on rows predating migration 024, which are brackets.
  const isLeagueTournament = selectedTournament?.format === 'league'

  // The mode that will actually be submitted, DERIVED from the competition
  // rather than synced into state by an effect.
  //
  // This matters beyond tidiness: a member can pick Full Tournament for the
  // World Cup, step back, switch to the Premier League, and step forward again.
  // Held in state, that stale mode rides along and creates a league pool that
  // scores zero. Derived, it cannot — the competition always wins, and there is
  // no render in which the two disagree.
  const effectiveMode: PoolMode = isLeagueTournament
    ? 'league_pickem'
    : predictionMode === 'league_pickem'
      ? 'full_tournament'
      : predictionMode

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep)

  function goNext() {
    if (currentStepIndex < STEPS.length - 1) {
      setSlideDirection('forward')
      setSlideKey((k) => k + 1)
      setCurrentStep(STEPS[currentStepIndex + 1].key)
    }
  }

  function goBack() {
    if (currentStepIndex > 0) {
      setSlideDirection('back')
      setSlideKey((k) => k + 1)
      setCurrentStep(STEPS[currentStepIndex - 1].key)
    }
  }

  function setQuickDeadline(option: string) {
    if (!selectedTournament) return
    const start = new Date(selectedTournament.start_date)
    switch (option) {
      case 'tournament_start': {
        setDeadlineDate(selectedTournament.start_date)
        setDeadlineTime('13:00')
        break
      }
      case 'one_day_before': {
        const d = new Date(start)
        d.setDate(d.getDate() - 1)
        setDeadlineDate(d.toISOString().split('T')[0])
        setDeadlineTime('13:00')
        break
      }
      case 'one_week_before': {
        const d = new Date(start)
        d.setDate(d.getDate() - 7)
        setDeadlineDate(d.toISOString().split('T')[0])
        setDeadlineTime('13:00')
        break
      }
    }
  }

  // When tournament changes, update deadline to tournament start date
  useEffect(() => {
    if (selectedTournament) {
      setDeadlineDate(selectedTournament.start_date)
      setDeadlineTime('13:00')
    }
  }, [selectedTournamentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreatePool = async () => {
    setLoading(true)
    setError(null)

    if (!selectedTournamentId) {
      setError('Please select a tournament.')
      setLoading(false)
      return
    }

    const maxP = parseInt(maxParticipants) || 0
    const maxE = Math.max(1, Math.min(10, parseInt(maxEntries) || 1))
    const deadline = new Date(`${deadlineDate}T${deadlineTime}:00`)

    try {
      const res = await fetch('/api/pools/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_name: poolName.trim(),
          description: description.trim() || null,
          tournament_id: selectedTournamentId,
          // Present only for a league. The route resolves the placeholder
          // tournament from it server-side and forces the mode, so the two can
          // never drift apart via a crafted request.
          league_season_id: selectedTournament?.league_season_id ?? null,
          prediction_deadline: deadline.toISOString(),
          prediction_mode: effectiveMode,
          // Ignored by the route for a bracket pool, which resolves them to
          // NULL — sent unconditionally so there is no branch here to drift
          // out of step with the one the route already has.
          league_mode: isLeagueTournament ? leagueMode : null,
          // Showdown carries a depth as well (Decision 9: it scores differently
          // at each), and the database CHECK refuses the pair without one.
          league_depth:
            isLeagueTournament && (leagueMode === 'pickem' || leagueMode === 'showdown')
              ? leagueDepth
              : null,
          is_private: isPrivate,
          max_participants: maxP,
          max_entries_per_user: maxE,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create pool.')
        setLoading(false)
        return
      }

      setLoading(false)
      showToast(`Pool "${data.pool_name}" created! Code: ${data.pool_code}`, 'success')
      onSuccess?.()
      onClose()
      router.push(`/pools/${data.pool_id}?tab=settings`)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const canProceedFromTournament = !!selectedTournamentId
  const canProceedFromDetails = poolName.trim().length > 0

  function canProceed() {
    if (currentStep === 'tournament') return canProceedFromTournament
    if (currentStep === 'pool_type') return true // always has a default selection
    if (currentStep === 'details') return canProceedFromDetails
    return true
  }

  // Format date for display
  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Quick deadline button label with formatted date
  function quickDeadlineLabel(option: string) {
    if (!selectedTournament) return ''
    const start = new Date(selectedTournament.start_date)
    switch (option) {
      case 'tournament_start': {
        const formatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return `Tournament Start (${formatted})`
      }
      case 'one_day_before': {
        const d = new Date(start)
        d.setDate(d.getDate() - 1)
        const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return `1 Day Before (${formatted})`
      }
      case 'one_week_before': {
        const d = new Date(start)
        d.setDate(d.getDate() - 7)
        const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return `1 Week Before (${formatted})`
      }
      default:
        return ''
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 modal-overlay animate-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-pool-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-lg w-full sm:mx-4 flex flex-col max-h-[90vh] dark:shadow-none dark:border dark:border-border-default modal-panel animate-modal-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-neutral-100 shrink-0">
          <h2 id="create-pool-title" className="text-lg font-bold text-neutral-900">Create a Pool</h2>
          <button
            onClick={() => !loading && onClose()}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
            aria-label="Close"
          >
            <Icon name="xmark" size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 px-4 sm:px-6 pt-3 pb-2 shrink-0">
            {STEPS.map((step, idx) => (
              <React.Fragment key={step.key}>
                <button
                  onClick={() => {
                    let canGo = false
                    if (idx <= currentStepIndex) canGo = true
                    else if (idx === 1 && canProceedFromTournament) canGo = true
                    else if (idx === 2 && canProceedFromTournament) canGo = true
                    else if (idx === 3 && canProceedFromTournament && canProceedFromDetails) canGo = true
                    if (canGo && idx !== currentStepIndex) {
                      setSlideDirection(idx > currentStepIndex ? 'forward' : 'back')
                      setSlideKey((k) => k + 1)
                      setCurrentStep(step.key)
                    }
                  }}
                  className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                    step.key === currentStep
                      ? 'text-primary-600'
                      : idx < currentStepIndex
                        ? 'text-neutral-700'
                        : 'text-neutral-400'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      step.key === currentStep
                        ? 'bg-primary-600 text-white'
                        : idx < currentStepIndex
                          ? 'bg-neutral-200 text-neutral-700'
                          : 'bg-neutral-100 text-neutral-400'
                    }`}
                  >
                    {idx < currentStepIndex ? (
                      <Icon name="checkmark" size={12} />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{step.mobileLabel}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`w-6 sm:w-12 h-0.5 rounded ${idx < currentStepIndex ? 'bg-neutral-300' : 'bg-neutral-100'}`} />
                )}
              </React.Fragment>
            ))}
          </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto overflow-x-hidden flex-1 px-4 sm:px-6 py-4">
          {error && <Alert variant="error" className="mb-4">{error}</Alert>}

          <div key={slideKey} className={slideDirection === 'forward' ? 'step-slide-forward' : 'step-slide-back'}>
              {/* STEP 1: Tournament */}
              {currentStep === 'tournament' && (
                <div className="space-y-4">
                  <p className="text-sm text-neutral-600">Choose the tournament for your prediction pool.</p>

                  {tournamentsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : tournaments.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-neutral-500">No tournaments available at this time.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tournaments.map((t) => (
                        <button
                          key={t.tournament_id}
                          onClick={() => setSelectedTournamentId(t.tournament_id)}
                          className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                            selectedTournamentId === t.tournament_id
                              ? 'border-primary-600 bg-primary-600/8 ring-1 ring-primary-600/25'
                              : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-neutral-900">{t.name}</h3>
                              {t.host_countries && (
                                <p className="text-xs text-neutral-500 mt-0.5">{t.host_countries}</p>
                              )}
                              <p className="text-xs text-neutral-500 mt-1">
                                {formatDate(t.start_date)} &ndash; {formatDate(t.end_date)}
                              </p>
                              {t.description && (
                                <p className="text-xs text-neutral-400 mt-1">{t.description}</p>
                              )}
                            </div>
                            <div className="shrink-0 mt-0.5">
                              {selectedTournamentId === t.tournament_id ? (
                                <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
                                  <Icon name="checkmark" size={12} className="text-white" />
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-neutral-300" />
                              )}
                            </div>
                          </div>
                        </button>
                      ))}

                      {/* Coming soon placeholders */}
                      <div className="w-full text-left p-4 rounded-2xl border-2 border-dashed border-neutral-200 opacity-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-neutral-400">More tournaments coming soon</h3>
                            <p className="text-xs text-neutral-400 mt-0.5">UEFA EURO, Super Bowl Squares, and more</p>
                          </div>
                          <span className="text-xs bg-neutral-100 text-neutral-400 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Pool Type */}
              {currentStep === 'pool_type' && (
                <div className="space-y-4">
                  <p className="text-sm text-neutral-600">How will members make their predictions?</p>

                  {/* A league offers its own two modes. They are the free tier
                      (plan §0.11) and the two ways into the product: the person
                      who follows football, and the person who does not.
                      Showdown and Last Man Standing are deliberately absent —
                      they are not built, and offering them would promise a pool
                      that cannot be played. */}
                  {isLeagueTournament && (
                    <div className="space-y-3">
                      {LEAGUE_MODES.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setLeagueMode(opt.value)}
                          className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                            leagueMode === opt.value
                              ? 'border-primary-600 bg-primary-600/8 ring-1 ring-primary-600/25'
                              : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={leagueMode === opt.value ? 'text-primary-600' : 'text-neutral-400'}>
                              <Icon name={opt.icon} size={20} />
                            </span>
                            <h3 className="text-sm font-semibold text-neutral-900">{opt.label}</h3>
                          </div>
                          <p className="text-xs text-neutral-500 mt-1.5">{opt.desc}</p>
                        </button>
                      ))}

                      {/* Depth is level 2, and it is asked ONLY of Pick'em —
                          there is no "predict the scoreline" version of
                          ordering twenty clubs, and the database CHECK refuses
                          the pairing outright. */}
                      {(leagueMode === 'pickem' || leagueMode === 'showdown') && (
                        <div className="pt-1">
                          <p className="text-xs font-semibold text-neutral-700 mb-2">
                            How much do members predict each match?
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {LEAGUE_DEPTHS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setLeagueDepth(opt.value)}
                                className={`text-left p-3 rounded-xl border-2 transition-all ${
                                  leagueDepth === opt.value
                                    ? 'border-primary-600 bg-primary-600/8'
                                    : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                                }`}
                              >
                                <h4 className="text-sm font-semibold text-neutral-900">{opt.label}</h4>
                                <p className="text-[11px] text-neutral-500 mt-1 leading-snug">{opt.desc}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={isLeagueTournament ? 'hidden' : 'space-y-3'}>
                    {(isLeagueTournament ? [] : [
                      {
                        value: 'full_tournament' as const,
                        label: 'Full Tournament',
                        desc: 'Members predict all matches upfront before the tournament starts. They must predict which teams qualify for the knockout rounds based on their group stage predictions.',
                        // A ticked-off list: every match filled in before a ball
                        // is kicked. A plain bullet list said "a list" and nothing
                        // about predicting them.
                        icon: (
                          <Icon name="checklist" size={20} />
                        ),
                      },
                      {
                        value: 'progressive' as const,
                        label: 'Progressive',
                        desc: 'Members predict round-by-round as teams advance. After each round completes, the next round opens with actual qualified teams and matchups.',
                        // Steps: one round opens, then the next. This was
                        // paperplane.fill, which resolves to Hugeicons'
                        // SendingOrder glyph — a mail/cloud blob that says
                        // nothing about rounds.
                        icon: (
                          <Icon name="stairs" size={20} />
                        ),
                      },
                      {
                        value: 'bracket_picker' as const,
                        label: 'Bracket Picker',
                        desc: 'Members rank groups and pick knockout winners only — no score predictions needed. Quick & simple (~10 min).',
                        // Two feeding into one — the knockout tree itself.
                        // square.grid.2x2 resolves to Grid02, which reads as a
                        // crop tool.
                        icon: (
                          <Icon name="arrow.triangle.merge" size={20} />
                        ),
                      },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPredictionMode(opt.value)}
                        className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                          effectiveMode === opt.value
                            ? 'border-primary-600 bg-primary-600/8 ring-1 ring-primary-600/25'
                            : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={effectiveMode === opt.value ? 'text-primary-600' : 'text-neutral-400'}>{opt.icon}</span>
                          <h3 className="text-sm font-semibold text-neutral-900">{opt.label}</h3>
                        </div>
                        <p className="text-xs text-neutral-500 mt-1.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <Icon name="exclamationmark.triangle.fill" size={16} className="text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-800">
                      This cannot be changed after your pool is created.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 3: Details */}
              {currentStep === 'details' && (
                <div className="space-y-4">
                  <p className="text-sm text-neutral-600">Give your pool a name and optional description.</p>

                  <FormField label="Pool Name *">
                    <Input
                      type="text"
                      value={poolName}
                      onChange={(e) => setPoolName(e.target.value)}
                      placeholder={selectedTournament ? `e.g. Office ${selectedTournament.name}` : 'e.g. Office World Cup 2026'}
                    />
                  </FormField>

                  <FormField label="Description (optional)">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Tell people about your pool..."
                      rows={2}
                      className="w-full px-4 py-3 rounded-control bg-mist text-ink border border-transparent focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-colors"
                    />
                  </FormField>
                </div>
              )}

              {/* STEP 4: Settings */}
              {currentStep === 'settings' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-3">
                      {effectiveMode === 'progressive' ? 'Group Stage Deadline' : effectiveMode === 'league_pickem' ? 'Matchweek 1 Deadline' : 'Prediction Deadline'}
                    </h3>
                    <div className="flex gap-3 mb-3 flex-wrap">
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Date</label>
                        <input
                          type="date"
                          value={deadlineDate}
                          onChange={(e) => setDeadlineDate(e.target.value)}
                          className="px-4 py-3 rounded-control text-sm bg-mist text-ink border border-transparent focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Time</label>
                        <input
                          type="time"
                          value={deadlineTime}
                          onChange={(e) => setDeadlineTime(e.target.value)}
                          className="px-4 py-3 rounded-control text-sm bg-mist text-ink border border-transparent focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition-colors"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setQuickDeadline('tournament_start')}
                        className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
                      >
                        {quickDeadlineLabel('tournament_start')}
                      </button>
                      <button
                        onClick={() => setQuickDeadline('one_day_before')}
                        className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
                      >
                        {quickDeadlineLabel('one_day_before')}
                      </button>
                      <button
                        onClick={() => setQuickDeadline('one_week_before')}
                        className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
                      >
                        {quickDeadlineLabel('one_week_before')}
                      </button>
                    </div>
                  </div>

                  <hr className="border-neutral-100" />

                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-3">Privacy Settings</h3>
                    <div className="space-y-4">
                      <FormField label="Pool Visibility">
                        <div className="inline-grid grid-cols-2 gap-2">
                          {([
                            { value: false, label: 'Public', desc: 'Anyone with code can join' },
                            { value: true, label: 'Private', desc: 'Requires pool code to join' },
                          ] as const).map((opt) => (
                            <button
                              key={String(opt.value)}
                              type="button"
                              onClick={() => setIsPrivate(opt.value)}
                              className={`p-3 rounded-xl border cursor-pointer transition text-left ${
                                isPrivate === opt.value
                                  ? 'border-primary-500 bg-primary-50'
                                  : 'border-neutral-200 hover:border-neutral-300'
                              }`}
                            >
                              <p className="text-sm font-medium text-neutral-900">{opt.label}</p>
                              <p className="text-xs text-neutral-500">{opt.desc}</p>
                            </button>
                          ))}
                        </div>
                      </FormField>

                      <FormField label="Maximum Members" helperText="Set to 0 for unlimited">
                        <div className="w-[10.3125rem]">
                          <Input
                            type="number"
                            min="0"
                            value={maxParticipants}
                            onChange={(e) => setMaxParticipants(e.target.value)}
                          />
                        </div>
                      </FormField>
                    </div>
                  </div>

                  <hr className="border-neutral-100" />

                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-3">Prediction Entries</h3>
                    <p className="text-sm text-neutral-600 mb-4">
                      Allow members to submit multiple sets of predictions. Each entry is scored and ranked independently on the leaderboard.
                    </p>
                    <div className="space-y-4">
                      <FormField label="Max Entries Per Member">
                        <div className="flex">
                          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setMaxEntries(String(n))}
                              className={`w-9 h-9 text-sm font-medium border -ml-px first:ml-0 first:rounded-l-xl last:rounded-r-xl transition ${
                                parseInt(maxEntries) === n
                                  ? 'bg-primary-500 text-white border-primary-500 z-10'
                                  : 'bg-surface text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </FormField>

                    </div>
                  </div>

                  <hr className="border-neutral-100" />

                  {/* Scoring info note */}
                  <div className="flex gap-3 p-3 bg-primary-50 border border-primary-200 rounded-xl">
                    <Icon name="info.circle.fill" size={20} className="text-primary-800 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-primary-800">Scoring & Bonus Points</p>
                      <p className="text-xs text-primary-800 mt-0.5">
                        Your pool will be created with default scoring settings. You can customize all scoring rules, multipliers, and bonus points from the pool admin settings after creation.
                      </p>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-4 sm:px-6 py-4 border-t border-neutral-100 shrink-0">
              {currentStepIndex > 0 ? (
                <Button variant="gray" onClick={goBack} disabled={loading} className="flex-1">
                  Back
                </Button>
              ) : (
                <Button variant="gray" onClick={onClose} disabled={loading} className="flex-1">
                  Cancel
                </Button>
              )}

              {currentStepIndex < STEPS.length - 1 ? (
                <Button
                  variant="primary"
                  onClick={goNext}
                  disabled={!canProceed()}
                  className="flex-1"
                >
                  Next
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleCreatePool}
                  disabled={loading || !poolName.trim() || !selectedTournamentId}
                  loading={loading}
                  loadingText="Creating..."
                  className="flex-1"
                >
                  Create Pool
                </Button>
              )}
        </div>
      </div>
    </div>
  )
}
