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
import { DatePicker } from '@/components/ui/DatePicker'
import { TimePicker } from '@/components/ui/TimePicker'

type CreatePoolModalProps = {
  onClose: () => void
  onSuccess?: () => void
}

type PoolMode = 'full_tournament' | 'progressive' | 'bracket_picker' | 'league_pickem'

/**
 * All four league modes from Decision 9.
 *
 * `desc` is a FUNCTION of the club count rather than a string, because Predict
 * the Table's copy names it — and "put all twenty clubs in finishing order" is
 * wrong for every league that is not England, Spain or Italy. Bundesliga and
 * Ligue 1 are eighteen; the Championship is twenty-four; the Scottish
 * Premiership is twelve.
 *
 * Three of the four ignore the argument. That is deliberately uniform: a mix of
 * strings and functions would need a `typeof` at the render site, and the next
 * mode whose copy needs a count would have to change the shape again.
 */
const LEAGUE_MODES = [
  {
    value: 'pickem' as const,
    label: 'Matchweek Pick\u2019em',
    desc: () => 'Members predict each matchweek\u2019s fixtures. Picks lock at the first kick-off, and the next matchweek opens as that one closes.',
    icon: 'stairs' as const,
  },
  {
    value: 'showdown' as const,
    label: 'Showdown',
    desc: () => 'The same weekly picks, plus a head-to-head duel against one other member. Three points for beating them, one for a tie. The fixture list is drawn up front, so you can see your rival coming.',
    icon: 'arrow.triangle.merge' as const,
  },
  {
    value: 'last_man_standing' as const,
    label: 'Last Man Standing',
    desc: () => 'Pick one club a week to win. Get it wrong and you\u2019re out — and you can\u2019t use the same club twice. When one player is left the round ends and a new one starts, so nobody is watching from the sidelines in March.',
    icon: 'flame.fill' as const,
  },
  {
    value: 'table' as const,
    label: 'Predict the Table',
    desc: (clubs: number | null) =>
      `One decision before the season: put ${clubs ? `all ${clubs} clubs` : 'every club'} in finishing order. ` +
      'Scored live against the real table all season \u2014 good for people who don\u2019t follow every match.',
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
  /**
   * The competition's crest, served by the fixtures provider.
   *
   * ⚠ NULL is the common case and a real answer, not a missing one. The
   * provider has a genuine crest for the Premier League and a generic grey
   * shield for the World Cup, so the column is filled only where the image is
   * actually the competition's own.
   */
  logo_url: string | null
  /** Set only for a league: the `league_seasons` row this entry actually plays. */
  league_season_id: string | null
  /**
   * Clubs in this league's season. Null for a bracket competition, and null for
   * a league whose season row is missing — such a league is dropped from the
   * list below anyway, so the null branch is only ever reached mid-load.
   *
   * Read from `league_seasons`, not from `tournaments.num_teams`: the season row
   * is written by the importer from the feed, where `num_teams` on the
   * placeholder is a copy of it. One source, and it is the league's own.
   */
  league_club_count: number | null
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

/**
 * The tournament name without its season.
 *
 * "Premier League 2026/27" -> "Premier League"
 * "FIFA World Cup 2026"    -> "FIFA World Cup"
 *
 * Only ever one active competition is offered here, so the year distinguishes
 * nothing — and the exact dates are printed two lines below it on the same card,
 * which is where somebody actually checks which season they are joining.
 *
 * ⚠ DISPLAY ONLY. `tournaments.name` is unchanged, because it is what every
 * other surface, every email and every export uses, and there the season is
 * doing real work. `short_name` is not usable for this either: it reads
 * "Premier League" for the league but "WC2026" for the World Cup, so it is a
 * code, not a display name.
 *
 * Anchored to the END of the string, so a name that legitimately contains a year
 * ("Copa America 2024 Qualifiers") keeps it.
 */
function withoutSeason(name: string): string {
  return name.replace(/\s+\d{4}(\s*\/\s*\d{2,4})?$/, '')
}

/**
 * One titled block of the wizard's last step.
 *
 * The step was four unrelated groups separated by `<hr>`, with headings set at
 * the same weight as the field labels inside them — so nothing read as a
 * boundary and the whole thing scrolled as one list. A bordered block per group
 * is what makes it scannable; the rules are gone.
 */
function Section({
  title, description, children,
}: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 p-4">
      <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
      {description && (
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{description}</p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/**
 * An instant -> the local `YYYY-MM-DD` / `HH:MM` pair the pickers speak.
 *
 * ⚠ LOCAL GETTERS, never `toISOString()`. A matchweek locks at 19:00 UTC; in
 * Bermuda that is 15:00 the same day, and `toISOString().split('T')[0]` would be
 * right there but wrong for a lock just after midnight UTC — which is the shape
 * of every date bug fixed in this file today.
 */
function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  }
}

/** Today, local, as `YYYY-MM-DD` — the floor for every deadline. */
function todayLocal(): string {
  return localParts(new Date().toISOString()).date
}

/**
 * Competitions shown as "coming soon" — a PREVIEW, not a capability.
 *
 * ⚠ These are NOT rows in `tournaments` and must not become them until each has
 * actually been imported. `scripts/import-league-season.ts` puts it well of its
 * own catalogue: "an entry that has never been run is a claim, not a
 * capability." A selectable card for a league with no fixtures, clubs or
 * matchweeks would create a pool that scores nothing.
 *
 * Crests come from the fixtures provider by league id, the same source and the
 * same path as the live one — so this row previews the real thing rather than
 * a mock of it.
 */
const COMING_SOON = [
  { id: 61, name: 'Ligue 1', country: 'France' },
  { id: 2, name: 'Champions League', country: 'Europe' },
] as const

const providerCrest = (leagueId: number) =>
  `https://media.api-sports.io/football/leagues/${leagueId}.png`

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

  /**
   * Hold the page still while the wizard is open.
   *
   * ⚠ The modal never did this. Anything the browser could not scroll inside
   * the dialog — a wheel over a picker column that had reached its end, a
   * trackpad flick anywhere outside it — scrolled the pool list behind instead,
   * which is how this surfaced: "the page in the background scrolls instead of
   * the time options".
   *
   * ⚠ `overflow: hidden` ALONE IS NOT ENOUGH, and looks fine until you try it
   * on a page that is already scrolled. The scroll offset is retained in
   * `window.scrollY` but the clamped scrollport paints from the top, so opening
   * the modal 400px down the pool list visibly threw the background 400px out
   * of place behind it.
   *
   * So the body is pinned with `position: fixed` at `top: -scrollY`, which
   * holds the page exactly where it was, and the offset is scrolled back on
   * close. Same technique CommunityTab uses for the mobile keyboard, minus its
   * `window.scrollTo(0, 0)` — that one is a full-screen chat and can afford to
   * start at the top; this must come back to wherever the admin was.
   *
   * The padding compensates for the scrollbar the lock removes; without it the
   * whole page shifts sideways as the modal opens. It is 0 on overlay-scrollbar
   * platforms, which is why it is conditional rather than assumed.
   */
  useEffect(() => {
    const { body } = document
    const scrollY = window.scrollY
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    }
    const scrollbar = window.innerWidth - document.documentElement.clientWidth

    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`

    return () => {
      body.style.overflow = prev.overflow
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.width = prev.width
      body.style.paddingRight = prev.paddingRight
      window.scrollTo(0, scrollY)
    }
  }, [])

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
  // ⚠ NO `maxParticipants` STATE, and its absence is deliberate.
  //
  // The wizard used to ask for a member limit. Migration 075 records why it
  // should not: `pools.max_participants` is "stored, displayed and editable but
  // enforced NOWHERE" — an admin could set 20 and 50 people would still join.
  // It was a control that had never done anything, sitting in the three-question
  // step where every question is meant to matter.
  //
  // The limit that IS real is the tier ceiling, enforced by a BEFORE INSERT
  // trigger from the same migration precisely so no route or client can miss it.
  // New pools are created uncapped by the admin and capped by their tier.
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
        .select('tournament_id, name, short_name, tournament_type, year, host_countries, start_date, end_date, status, description, format, external_provider, external_league_id, external_season, logo_url')
        .or('format.is.null,format.eq.groups_knockout,format.eq.league')
        .order('start_date', { ascending: false })

      // A league's identity is its `league_seasons` row, not the placeholder
      // `tournaments` row that carries its dates. Resolve the pairing here so
      // the wizard submits the season id and the route does not have to trust a
      // client-supplied pair. A league with no season row is DROPPED rather than
      // offered — creating a pool on it would 409 at submit.
      const { data: seasons } = await supabase
        .from('league_seasons')
        .select('season_id, club_count, external_provider, external_league_id, external_season')
      const seasonByTriple = new Map<string, { seasonId: string; clubCount: number | null }>()
      for (const sn of seasons ?? []) {
        seasonByTriple.set(
          `${sn.external_provider ?? 'api_football'}|${sn.external_league_id}|${sn.external_season}`,
          { seasonId: sn.season_id, clubCount: sn.club_count ?? null },
        )
      }

      const withSeason = ((data ?? []) as Array<Tournament & {
        external_provider?: string | null
        external_league_id?: number | null
        external_season?: number | null
      }>).map((t) => {
        if (t.format !== 'league') return { ...t, league_season_id: null, league_club_count: null }
        const key = `${t.external_provider ?? 'api_football'}|${t.external_league_id}|${t.external_season}`
        const season = seasonByTriple.get(key)
        return {
          ...t,
          league_season_id: season?.seasonId ?? null,
          league_club_count: season?.clubCount ?? null,
        }
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

  /**
   * The next few matchweek locks, for the shortcut chips.
   *
   * ⚠ Only meaningful once a season is UNDER WAY. "Tournament Start (Aug 21)"
   * is a useful shortcut in July and a dead one in September — the date is
   * behind us and the button sets something the form then rejects. Mid-season
   * the shortcut somebody actually wants is the next matchweek's deadline, so
   * that is what replaces it.
   */
  const [upcomingLocks, setUpcomingLocks] = useState<
    Array<{ number: number; label: string | null; lockAt: string }>
  >([])

  const selectedTournament = tournaments.find((t) => t.tournament_id === selectedTournamentId)

  // Fetch the next matchweek locks whenever the chosen competition changes.
  // Only the ones still ahead of us — a lock in the past is not a shortcut.
  useEffect(() => {
    const seasonId = selectedTournament?.league_season_id
    if (!seasonId) { setUpcomingLocks([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('league_matchweeks')
        .select('matchweek_number, label, lock_at')
        .eq('season_id', seasonId)
        .not('lock_at', 'is', null)
        .gt('lock_at', new Date().toISOString())
        .order('lock_at', { ascending: true })
        .limit(3)
      if (cancelled) return
      setUpcomingLocks(
        (data ?? []).map((r) => ({
          number: r.matchweek_number as number,
          label: r.label as string | null,
          lockAt: r.lock_at as string,
        })),
      )
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournament?.league_season_id])

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

  // When tournament changes, update deadline to tournament start date.
  //
  // ⚠ Unless that date has already gone. A competition already under way — a
  // Premier League season somebody is joining in October — would otherwise
  // pre-fill a deadline months in the past, and for a table pool that date is
  // the real lock (migration 098), not decoration. A week out is the honest
  // default for a pool starting mid-season: long enough for the group to file
  // a table, and the admin can move it either way before creating.
  useEffect(() => {
    if (!selectedTournament) return
    // ⚠ Both halves were the UTC bug again. `new Date('2026-08-21')` parses as
    // UTC, so `hasStarted` flipped a day early west of Greenwich; and
    // `inAWeek.toISOString().split('T')[0]` reads the UTC date off a LOCAL Date,
    // so after 20:00 in Bermuda the prefilled deadline landed a day late.
    const start = new Date(selectedTournament.start_date + 'T00:00:00')
    const hasStarted = !Number.isNaN(start.getTime()) && start.getTime() <= Date.now()

    if (hasStarted) {
      const inAWeek = new Date()
      inAWeek.setDate(inAWeek.getDate() + 7)
      setDeadlineDate(localParts(inAWeek.toISOString()).date)
    } else {
      setDeadlineDate(selectedTournament.start_date)
    }
    setDeadlineTime('13:00')
  }, [selectedTournamentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreatePool = async () => {
    setLoading(true)
    setError(null)

    if (!selectedTournamentId) {
      setError('Please select a tournament.')
      setLoading(false)
      return
    }

    const maxE = Math.max(1, Math.min(10, parseInt(maxEntries) || 1))
    const deadline = new Date(`${deadlineDate}T${deadlineTime}:00`)

    // ⚠ There was NO past-date check here at all. The calendar greys out earlier
    // days, but a day-level floor cannot catch "today at 09:00" chosen at noon —
    // and the wizard submitted it. A deadline already gone closes nothing, and
    // for a table pool it is the real lock, so the pool would be created shut.
    if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) {
      setError('The deadline has to be in the future.')
      setLoading(false)
      return
    }

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
          // 0 means "no admin-set limit", which the create route turns into
          // NULL. The real ceiling is the tier one, enforced by a trigger.
          max_participants: 0,
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
  /**
   * "Aug 2026" — the month a season starts or ends, without the day.
   *
   * A competition is picked by which one it is and roughly when it runs; the
   * exact 21st is noise here, and dropping it takes a third off the widest line
   * on the card, which is what lets the list run two-up on desktop.
   *
   * ⚠ KEEP THE `T00:00:00`. A bare 'YYYY-MM-DD' is parsed as UTC, so a season
   * starting on the 1st renders as the previous month for anyone west of
   * Greenwich. That mattered less when the day was shown beside it; now it
   * would silently change the only part of the date left.
   */
  function formatMonthYear(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })
  }

  // Quick deadline button label with formatted date
  /**
   * The shortcut chips, which depend on whether the competition has started.
   *
   * BEFORE IT STARTS — the three that have always been here: kick-off, and the
   * day and week before it. They are what somebody setting up in advance wants.
   *
   * ONCE IT HAS STARTED — those three are all in the past. "Tournament Start
   * (Aug 21)" in September is not a shortcut, it is a button that sets a date
   * the form immediately rejects. They are replaced by the next matchweek
   * deadlines, which is the thing a mid-season pool is actually being set to.
   *
   * NEITHER — a competition that has started and has no matchweeks we can read
   * (any World Cup, or a league whose fixtures have not been imported) gets no
   * chips at all. An empty row is honest; a row of dead buttons is not.
   */
  const quickPicks: Array<{ key: string; label: string; date: string; time: string }> = (() => {
    if (!selectedTournament) return []
    const started = new Date(selectedTournament.start_date + 'T00:00:00') <= new Date()

    if (!started) {
      const start = new Date(selectedTournament.start_date + 'T00:00:00')
      const shift = (days: number) => {
        const d = new Date(start)
        d.setDate(d.getDate() - days)
        return d
      }
      const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return [
        { key: 'start', days: 0 },
        { key: 'day', days: 1 },
        { key: 'week', days: 7 },
      ].map(({ key, days }) => {
        const d = shift(days)
        const prefix = days === 0 ? 'Tournament Start' : days === 1 ? '1 Day Before' : '1 Week Before'
        return {
          key,
          label: `${prefix} (${fmt(d)})`,
          date: localParts(d.toISOString()).date,
          time: '13:00',
        }
      })
    }

    // Under way: the next matchweek locks, at their real lock TIME rather than
    // a made-up 13:00 — the point of the shortcut is to match the competition.
    return upcomingLocks.map((mw) => {
      const { date, time } = localParts(mw.lockAt)
      const when = new Date(mw.lockAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return {
        key: `mw${mw.number}`,
        label: `${mw.label ?? `Matchweek ${mw.number}`} (${when})`,
        date,
        time,
      }
    })
  })()

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
      <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-2xl w-full sm:mx-4 flex flex-col max-h-[90vh] dark:shadow-none dark:border dark:border-border-default modal-panel animate-modal-slide-up">
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
                  {/* nowrap on both: "Pool Type" was breaking onto a second
                      line and shoving the row out of alignment. The wider panel
                      above is what gives it room on desktop.
                      ⚠ On MOBILE nowrap alone made it worse, not better — four
                      labels plus three connectors overflow 375px, so "Settings"
                      was simply clipped off the right edge instead of wrapping.
                      Below `sm` only the CURRENT step is labelled and the rest
                      are numbers, which fits at any width. `sr-only` rather than
                      `hidden`, so the row still reads as four named steps to a
                      screen reader. */}
                  <span className="hidden sm:inline whitespace-nowrap">{step.label}</span>
                  <span
                    className={`sm:hidden whitespace-nowrap ${
                      step.key === currentStep ? '' : 'sr-only'
                    }`}
                  >
                    {step.mobileLabel}
                  </span>
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
                    /* Two across from `sm`, one below it. The modal is
                       max-w-2xl, so a half-width card is about 294px — roomy
                       for a crest and two short lines, and far too narrow for
                       the third one to sit out to the right (see below). On a
                       phone the panel is a full-width sheet, where two columns
                       would be ~170px each and the names would wrap. */
                    <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {tournaments.map((t) => {
                        const dateRange = `${formatMonthYear(t.start_date)} \u2013 ${formatMonthYear(t.end_date)}`
                        return (
                        <button
                          key={t.tournament_id}
                          onClick={() => setSelectedTournamentId(t.tournament_id)}
                          // ⚠ The tick that used to sit on the right was the only
                          // non-colour signal of which card is chosen, so removing
                          // it left selection conveyed by border and tint alone.
                          // aria-pressed carries it for anyone who cannot see
                          // either — a screen reader now reads "selected" rather
                          // than four identical buttons.
                          aria-pressed={selectedTournamentId === t.tournament_id}
                          className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                            selectedTournamentId === t.tournament_id
                              ? 'border-primary-600 bg-primary-600/8 ring-1 ring-primary-600/25'
                              : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                          }`}
                        >
                          {/* items-CENTER, not items-start. The crest used to be
                              pinned to the top of a four-line block and floated
                              well above its optical middle. With the format blurb
                              gone the block is two or three short lines, which a
                              centred crest sits against cleanly at any of them. */}
                          <div className="flex items-center gap-3.5">
                            {/* ⚠ Rendered only when there IS one, and the column
                                is NULL more often than not on purpose. The
                                provider serves a real crest for the Premier
                                League and a generic grey shield for the World
                                Cup — so a card with no logo is a deliberate
                                state, not a loading one, and must not get a
                                placeholder box. */}
                            {t.logo_url && (
                              // ⚠ The white plate is DARK MODE ONLY, and the
                              // asymmetry is the point. Several league marks are
                              // dark on transparent — the Premier League lion is
                              // near-black purple, Ligue 1 is monochrome black —
                              // and on the dark surface they all but vanish. The
                              // house rule already says why the answer is a plate
                              // rather than a filter: a brand lockup sits on its
                              // own ground and is not UI chrome that follows the
                              // theme (see the Coming soon chips below).
                              //
                              // In LIGHT mode the page is already that ground, so
                              // a plate buys nothing and costs something — it has
                              // to inset the mark to make room for itself, and
                              // measured side by side that reads as a shrunken
                              // logo for no reason. So light mode keeps the crest
                              // at full size, exactly as before.
                              <span className="w-11 h-11 rounded-xl grid place-items-center shrink-0 dark:bg-white">
                                <img
                                  src={t.logo_url}
                                  alt=""
                                  className="w-11 h-11 dark:w-8 dark:h-8 object-contain"
                                />
                              </span>
                            )}
                            {/* space-y rather than per-line margins, so the lines
                                cannot drift apart as any one of them is added or
                                removed — `host_countries` is nullable. */}
                            <div className="min-w-0 space-y-0.5">
                              <h3 className="text-base font-bold text-neutral-900 leading-tight">
                                {withoutSeason(t.name)}
                              </h3>
                              {t.host_countries && (
                                <p className="text-xs text-neutral-500">{t.host_countries}</p>
                              )}
                              {/* ⚠ The dates USED TO SPLIT — stacked here on a
                                  phone, moved out to the right of the card from
                                  `sm` up, where a full-width card had dead
                                  space. Two columns removed that space: the
                                  card is now ~294px at every width above the
                                  breakpoint, which is narrower than the 390px
                                  screen the right-hand placement already did
                                  not fit on. So there is one placement again,
                                  and it is this one. */}
                              <p className="text-xs text-neutral-500">{dateRange}</p>
                              {/* ⚠ `t.description` is deliberately NOT rendered.
                                  "20 clubs, 38 matchweeks, 380 fixtures. Flat
                                  round-robin: no groups, no knockout." is format
                                  detail for a step where the only decision is
                                  WHICH competition — and with one option on
                                  screen it was the longest line on the card
                                  while carrying the least. The column is still
                                  selected and still populated; it just does not
                                  belong here. */}
                            </div>
                          </div>
                        </button>
                        )
                      })}
                    </div>

                      {/* ⚠ OUTSIDE the grid, and that is the whole point of the
                          fragment. While this sat inside it, "Coming soon" was
                          a GRID CELL: it landed beside the third competition
                          and stretched that card to its own height, because a
                          grid row is as tall as its tallest item. It is a
                          full-width footer to the choice, not one of the
                          choices.

                          Coming soon. Named competitions with their real crests
                          rather than one dashed box reading "and more" — the
                          question this step answers is "is my league here", and
                          a list you can scan answers it faster than a promise. */}
                      <div className="pt-1">
                        <p className="t-caption text-muted mb-2">Coming soon</p>
                        <div className="grid grid-cols-2 gap-2">
                          {COMING_SOON.map((c) => (
                            <div
                              key={c.id}
                              aria-disabled="true"
                              className="flex items-center gap-2.5 p-2.5 rounded-xl border border-dashed border-border-default"
                            >
                              {/* ⚠ A white plate, deliberately NOT a token. Several
                                  league marks are monochrome black on transparent —
                                  Ligue 1 is — and would disappear entirely on the
                                  dark surface. A brand lockup sits on its own
                                  ground; this is not UI chrome following the theme. */}
                              <span className="w-8 h-8 rounded-chip bg-white grid place-items-center shrink-0">
                                <img
                                  src={providerCrest(c.id)}
                                  alt=""
                                  className="w-6 h-6 object-contain opacity-70"
                                />
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-muted truncate">{c.name}</p>
                                <p className="t-detail text-muted/70 truncate">{c.country}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
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
                          <p className="text-xs text-neutral-500 mt-1.5">
                            {opt.desc(selectedTournament?.league_club_count ?? null)}
                          </p>
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

              {/* STEP 4: Settings
                  ============================================================
                  Four groups, each in its own bordered block. It used to be the
                  same four separated by `<hr>` with headings at the same weight
                  as the labels inside them, so nothing read as a boundary — and
                  two competing label systems ran down it at once: sentence-case
                  section headings against ALL-CAPS FormField labels, plus a
                  third lowercase style on the Date/Time inputs.

                  Now: the block title names the setting, and a label only
                  appears where a block holds more than one control. */}
              {currentStep === 'settings' && (
                <div className="space-y-4">

                  <Section
                    title={
                      isLeagueTournament && leagueMode === 'table'
                        ? 'Table deadline'
                        : effectiveMode === 'progressive'
                          ? 'Group stage deadline'
                          : effectiveMode === 'league_pickem'
                            ? 'First matchweek deadline'
                            : 'Prediction deadline'
                    }
                    description={
                      isLeagueTournament && leagueMode === 'table'
                        ? 'When the table locks. Every member’s order is shown to the pool at this moment, and the date is fixed once it passes.'
                        : 'When picks close. You can move this later from the pool’s settings.'
                    }
                  >
                    <div className="flex gap-3 flex-wrap">
                      {/* The last two native controls on this screen. The
                          browser drew them in its own greys and its own type,
                          with a panel that ignored dark mode entirely — see
                          components/ui/DatePicker for the whole note. */}
                      <FormField label="Date">
                        {/* A deadline in the past closes nothing. The calendar
                            greys out everything before today; the combined
                            date+time is re-checked on save, because "today at
                            09:00" is still in the past at noon. */}
                        <DatePicker
                          value={deadlineDate}
                          onChange={setDeadlineDate}
                          min={todayLocal()}
                          ariaLabel="Deadline date"
                        />
                      </FormField>
                      <FormField label="Time">
                        <TimePicker
                          value={deadlineTime}
                          onChange={setDeadlineTime}
                          ariaLabel="Deadline time"
                        />
                      </FormField>
                    </div>
                    {quickPicks.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {quickPicks.map((q) => (
                          <button
                            key={q.key}
                            type="button"
                            onClick={() => { setDeadlineDate(q.date); setDeadlineTime(q.time) }}
                            className="text-xs px-3 py-1.5 rounded-pill bg-mist text-ink hover:bg-silver transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40"
                          >
                            {q.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </Section>

                  <Section
                    title="Who can join"
                    description="Everyone needs the pool code either way. Private also keeps it out of Discover."
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: false, label: 'Public', desc: 'Listed in Discover' },
                        { value: true, label: 'Private', desc: 'Code only' },
                      ] as const).map((opt) => (
                        <button
                          key={String(opt.value)}
                          type="button"
                          onClick={() => setIsPrivate(opt.value)}
                          aria-pressed={isPrivate === opt.value}
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
                  </Section>

                  {/* The heading names the control, so the FormField label that
                      used to sit above the 1–10 strip has gone — it was the third
                      time the same words appeared in one block. */}
                  <Section
                    title="Entries per member"
                    description="More than one lets somebody enter several predictions. Each is scored and ranked on the leaderboard by itself."
                  >
                    <div className="flex">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setMaxEntries(String(n))}
                          aria-pressed={parseInt(maxEntries) === n}
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
                  </Section>

                  {/* Not a Section: it is not a setting, and giving it the same
                      chrome as the three above would imply there is something
                      here to decide. */}
                  <div className="flex gap-3 p-3 bg-primary-50 border border-primary-200 rounded-xl">
                    <Icon name="info.circle.fill" size={20} className="text-primary-800 shrink-0 mt-0.5" />
                    <p className="text-xs text-primary-800 leading-relaxed">
                      <span className="font-medium">Scoring uses the defaults.</span>{' '}
                      Every rule, multiplier and bonus can be changed from the pool’s
                      admin settings once it exists.
                    </p>
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
