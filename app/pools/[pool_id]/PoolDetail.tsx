'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Alert } from '@/components/ui/Alert'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { PoolLiveResponse, LiveEntry } from '@/app/api/pools/[pool_id]/live/route'
import { needsFullRefresh, mergeMatches, mergeMembers, mergeMatchScores, mergeEntryStats } from './liveMerge'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useTheme } from '@/components/ThemeProvider'
import { AppHeader } from '@/components/ui/AppHeader'
import { LeaderboardTab } from './LeaderboardTab'
import { DuelRecapSheet, type DuelRecap } from './DuelRecapSheet'
import { ResultsTab } from './ResultsTab'
import { BracketResultsTab } from './BracketResultsTab'
import { StandingsTab } from './StandingsTab'
import { ScoringRulesTab } from './ScoringRulesTab'
import { LeagueScoringRulesTab, type LeagueScoringMode } from './LeagueScoringRulesTab'
import { CommunityTab } from './CommunityTab'
import { HowToPlayModal } from './HowToPlayModal'
import type { LeagueMode } from '@/lib/leagueModeInfo'
import { AnalyticsTab } from './AnalyticsTab'
import { PoolInfoTab } from './PoolInfoTab'
import PredictionsFlow, { type SaveStatus } from '@/components/predictions/PredictionsFlow'
import ProgressivePredictionsFlow from '@/components/predictions/ProgressivePredictionsFlow'
import LeagueTableTab, { type LeagueStandingRow } from './LeagueTableTab'
import type { NextFixture } from '@/lib/league/read'
import TablePredictionTab from './TablePredictionTab'
import DuelsTab from './DuelsTab'
import SurvivorTab from './SurvivorTab'
import type { LmsRound, LmsSurvivor, LmsPick } from '@/lib/league/lms'
import type { DuelRow } from '@/lib/league/duels'
import type { SeasonClub, TableBreakdownRow } from '@/lib/league/table'
import { usesRounds } from '@/lib/competitionRounds'
import BracketPickerFlow from '@/components/predictions/BracketPickerFlow'
import { EntriesListView } from '@/components/predictions/EntriesListView'
import { EntryDetailView } from '@/components/predictions/EntryDetailView'
import { EveryoneElseSection } from '@/components/predictions/EveryoneElseSection'
import { SpectatorEntryView } from '@/components/predictions/SpectatorEntryView'
import { ProgressiveSpectatorView } from '@/components/predictions/ProgressiveSpectatorView'
import { BracketSpectatorView } from '@/components/predictions/BracketSpectatorView'
import { MembersTab } from './admin/MembersTab'
import { ScoringTab } from './admin/ScoringTab'
import { SettingsTab } from './admin/SettingsTab'
import { FeesTab } from './admin/FeesTab'
import { RoundsTab } from './admin/RoundsTab'
import { DEFAULT_POOL_SETTINGS, type PoolSettings } from './results/points'
import { useUnreadBanter } from '@/hooks/useUnreadBanter'
import type {
  PoolData,
  MemberData,
  EntryData,
  MatchData,
  SettingsData,
  PredictionData,
  TeamData,
  ExistingPrediction,
  MatchScoreData,
  MatchScoreNarrow,
  EntryStatsData,
  MatchdayMVPData,
  MatchAccuracyData,
  BonusScoreData,
  PoolRoundState,
  EntryRoundSubmission,
  BPGroupRanking,
  BPThirdPlaceRanking,
  BPKnockoutPick,
  PodiumResult,
} from './types'
import type { MatchConductData } from '@/lib/tournament'
import { formatTimeAgo } from '@/lib/format'
import { poolStatusDisplay, toneToBadgeVariantSolid } from '@/lib/poolStatus'
import { Badge } from '@/components/ui/Badge'

// =====================
// TAB DEFINITIONS
// =====================
/** Everything SurvivorTab needs, assembled server-side in page.tsx. */
export type LmsData = {
  round: LmsRound | null
  survivors: LmsSurvivor[]
  myPicks: LmsPick[]
  clubs: SeasonClub[]
  entryNames: Map<string, string>
  entryId: string | null
  /**
   * ⚠ The OPEN matchweek, deliberately — an LMS pick is WRITTEN against the week
   * being picked, not the one being played, so this must stay the pickable one.
   * It is the wrong week to NARRATE with: see `inPlayMatchweek`.
   */
  currentMatchweek: number | null
  /**
   * The matchweek being played. NULL between rounds.
   *
   * ⚠ NOT the same week as `currentMatchweek` from Friday kickoff to Monday
   * night — and those are the days a member looks. Collapsing the two is what
   * put next week's club under the words "This week" on a live Saturday, the
   * same mistake `matchweekTile` was built to stop. Showdown has carried both
   * numbers since it shipped; this mode only got one.
   */
  inPlayMatchweek: number | null
  roundsWon: Map<string, number>
  /** Who each club plays in the open matchweek — the picker's grid. */
  fixtures: Map<string, import('@/lib/league/read').NextFixture>
  /**
   * The game behind each of the viewer's own picks, keyed by `lmsPickKey`.
   * Resolved against each pick's OWN matchweek and frozen once settled, so a
   * pick from three weeks ago keeps the opponent it was made against.
   */
  pickFixtures: Map<string, import('@/lib/league/lms').LmsPickFixture>
}

/** One fixture of the live matchweek, whether or not it has been scored. */
export type MatchweekFixture = {
  /** `league_fixtures.fixture_id` — what predictions are keyed on. */
  id: string
  number: number
  homeName: string
  awayName: string
  /** Three-letter code — what a 375px row shows instead of the name. */
  homeAbbr: string
  awayAbbr: string
  /** `league_clubs.crest_url`, carried through the view as `flag_url`. */
  homeCrest: string | null
  awayCrest: string | null
  /** Goals. Null before kickoff; live and moving during the match. */
  homeScore: number | null
  awayScore: number | null
  kickoffAt: string
  isCompleted: boolean
  status: string
  liveMinute: number | null
  livePeriod: string | null
  liveAdded: number | null
}

/** Everything DuelsTab needs, assembled server-side in page.tsx. */
export type ShowdownData = {
  duels: DuelRow[]
  /**
   * The settled duel this viewer has not been shown yet, or null.
   *
   * ⚠ Resolved on the SERVER, not derived here. The test is "my most recently
   * settled duel is newer than `pool_entries.last_recap_seen_at`", and the
   * marker is not in this component's props — deliberately, because deriving it
   * client-side would mean shipping every entry's marker to every member.
   */
  recap: DuelRecap | null
  entryNames: Map<string, string>
  ownEntryIds: string[]
  /** Open for picks. ⚠ During a matchweek this is the week AFTER the one being
   *  played, which is why the tab is given both. */
  openMatchweek: number | null
  /** Being played right now. Null between rounds. */
  inPlayMatchweek: number | null
  /**
   * The first matchweek whose duel is still SEALED, and when it opens.
   *
   * ⚠ There are no duel rows for it in `duels` — migration 116's policy
   * withholds them — so the sealed card cannot derive this and has to be told.
   */
  sealedMatchweek: number | null
  /** The LATEST it can open — 24h before its own lock. The only real instant. */
  sealedOpensAtLatest: string | null
  /** entry_id → the person behind it, for the faces in the corners. */
  entryPeople: Map<string, { user_id: string; full_name: string | null; username: string | null }>
  /**
   * The RUNNING score of the matchweek being played, per entry, and how many of
   * its fixtures have been scored so far.
   *
   * ⚠ `league_duels.accuracy_a/_b` are NULL until the matchweek settles, so they
   * cannot drive a live card. These come from `league_match_scores`.
   */
  livePoints: Map<string, number>
  /** entry_id → fixture_number → points, for the fixture-by-fixture breakdown. */
  perFixture: Map<string, Map<number, number>>
  /** Every fixture of the live matchweek, scored or not. */
  fixtures: MatchweekFixture[]
  /** Season totals per entry — points, rank, duel points. */
  totals: Map<string, { totalPoints: number; rank: number | null; duelPoints: number; correct: number }>
  duelPoints: Map<string, number>
  /**
   * Your points and the pool's MEDIAN, one row per matchweek (migration 124).
   *
   * ⚠ Aggregated in SQL. The raw `league_match_scores` is ~3,800 rows for a
   * 10-member season and is deny-all besides; the function is SECURITY DEFINER
   * and returns two numbers a week, never another member's row.
   */
  series: Array<{ matchweek_number: number; your_points: number; median_points: number }>
}

/** Everything TablePredictionTab needs, assembled server-side in page.tsx. */
export type TableModeData = {
  entryId: string | null
  clubs: SeasonClub[]
  savedOrder: string[]
  savedAt: string | null
  seededOrder: string[]
  breakdown: TableBreakdownRow[]
  lockAt: string | null
  topN: number
  relegationN: number
  europaFrom: number | null
  europaTo: number | null
  conferenceFrom: number | null
  conferenceTo: number | null
  /** The deadline has passed: nobody may edit their table. Gates WRITES. */
  isLocked: boolean
  /**
   * Everybody's table is visible to everybody else. Gates READS.
   *
   * Derived from the same deadline as `isLocked` since migration 110 — one
   * switch, two consequences. Kept as its own field because the question a
   * consumer asks of it is different: `isLocked` is "may I still edit mine",
   * `isRevealed` is "may I open somebody else's".
   */
  isRevealed: boolean
  joinedAfterLock: boolean
  /** 'headline_only' scores the bands alone — no per-position arithmetic. */
  profile: 'full_table' | 'headline_only'
  /**
   * What this pool actually charges, for the Scoring Rules screen. Resolved
   * server-side against `league_pool_settings`' column defaults so the screen
   * and `league_score_table` cannot disagree.
   */
  prices: {
    exactPoints: number
    stepPenalty: number
    championBonus: number
    topFourBonus: number
    relegationBonus: number
    perfectTopFourBonus: number
    europaBonus: number
    conferenceBonus: number
  }
}

type Tab =
  | 'leaderboard'
  | 'predictions'
  | 'results'
  | 'my_bracket'
  /** Showdown only. Its own key rather than borrowing `my_bracket`, which is a World Cup concept. */
  | 'duels'
  | 'analytics'
  | 'standings'
  | 'pool_info'
  | 'scoring_rules'
  | 'community'
  | 'members'
  | 'fees'
  | 'scoring_config'
  | 'settings'
  | 'rounds'

/**
 * Tabs that read the pool-wide predictions and/or match_scores arrays.
 *
 * `analytics` (Form) is deliberately NOT here: it reads the counted crowd
 * aggregate from /api/pools/:id/crowd plus its own entry's rows, so it opens
 * without pulling every prediction in the pool.
 *
 * Everything NOT in this list — leaderboard (the default), standings, pool info,
 * scoring rules, fees, settings — renders without either, which is what makes
 * pool open ~445 kB instead of 7,721 kB on the largest pool.
 *
 * `predictions` is here for the multi-entry list (per-entry progress counts),
 * the post-deadline "everyone else" section and the spectator view; the single
 * active entry's own picks come from their own per-entry fetch.
 */
// `duels` is here for the team sheet: the Showdown breakdown shows BOTH sides'
// picks, and the only reveal-gated source of another member's picks is the bulk
// route. Reusing it rather than reading `league_predictions` from the duel path
// is deliberate — a second read would be a second place to get the gate wrong,
// and getting it wrong means showing picks before lock.
const TABS_NEEDING_BULK: Tab[] = ['community', 'results', 'members', 'duels']

/**
 * Showdown leads with the duel.
 *
 * It used to sit beside the Leaderboard, third in the row, which is the shape
 * the mode was criticised for: pick'em with a duel bolted on. In Showdown the
 * duel IS the competition and the weekly picks are how you play it, so it goes
 * first and everything else keeps its order. Singular — it is YOUR duel, not a
 * fixture list, and since the draw was sealed (migration 116) there is no list
 * to browse anyway.
 */
function withShowdownFirst(
  isShowdown: boolean,
  tabs: { key: Tab; label: string }[],
): { key: Tab; label: string }[] {
  if (!isShowdown) return tabs
  return [{ key: 'duels' as Tab, label: 'Duel' }, ...tabs]
}

const USER_TABS_DEFAULT: { key: Tab; label: string }[] = [
  { key: 'community', label: 'Banter' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'analytics', label: 'Form' },
  { key: 'predictions', label: 'Predictions' },
  { key: 'results', label: 'Results' },
  // { key: 'standings', label: 'Standings' }, // temporarily hidden — duplicate of info in Form
  { key: 'scoring_rules', label: 'Scoring Rules' },
  { key: 'pool_info', label: 'Pool Info' },
]

const USER_TABS_BRACKET_PICKER: { key: Tab; label: string }[] = [
  { key: 'community', label: 'Banter' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'analytics', label: 'Form' },
  { key: 'predictions', label: 'Predictions' },
  { key: 'my_bracket', label: 'My Bracket' },
  { key: 'scoring_rules', label: 'Scoring Rules' },
  { key: 'pool_info', label: 'Pool Info' },
]

const ADMIN_TABS: { key: Tab; label: string }[] = [
  { key: 'members', label: 'Members' },
  { key: 'scoring_config', label: 'Scoring Config' },
  { key: 'settings', label: 'Settings' },
]

// =====================
// PROPS
// =====================
type PoolDetailProps = {
  pool: PoolData
  members: MemberData[]
  matches: MatchData[]
  settings: SettingsData | null
  userPredictions: ExistingPrediction[]
  teams: TeamData[]
  conductData: MatchConductData[]
  bonusScores: BonusScoreData[]
  entryStats: EntryStatsData[]
  matchdayMVP: MatchdayMVPData | null
  matchAccuracy: MatchAccuracyData[]
  memberId: string | null
  currentUserId: string
  isAdmin: boolean
  isPastDeadline: boolean
  psoEnabled: boolean
  userEntries: EntryData[]
  isSuperAdmin?: boolean
  isSuperAdminViewing?: boolean
  hasSeenHowToPlay: boolean
  roundStates?: PoolRoundState[]
  /** League pools only: 'results' swaps the score steppers for one tap per fixture. */
  leagueDepth?: 'results' | 'scores' | null
  /** Saved Results picks, keyed by fixture id. Empty unless depth is 'results'. */
  leagueOutcomes?: Map<string, 'home' | 'draw' | 'away'>
  /** The real league table, from the feed. Empty for every World Cup pool. */
  leagueStandings?: LeagueStandingRow[]
  leagueStandingsAt?: string | null
  /**
   * entry_id -> its last five score_types, oldest first. Read from
   * `league_match_scores`, because `entry_xp_state` — which feeds the form dots
   * for a World Cup pool — is never written for a league entry.
   */
  leagueForm?: Map<string, string[]>
  /** club_id -> who they play next, for the league table's Next column. */
  leagueNextFixture?: Map<string, NextFixture>
  /** Level 1 — what kind of league pool this is (plan §0.1). NULL for the World Cup. */
  leagueMode?: string | null
  /** Table mode's screen: the clubs, the entry's ordering, and the comparison. */
  tableModeData?: TableModeData | null
  showdownData?: ShowdownData | null
  lmsData?: LmsData | null
  roundSubmissions?: EntryRoundSubmission[]
  bpGroupRankings?: BPGroupRanking[]
  bpThirdPlaceRankings?: BPThirdPlaceRanking[]
  bpKnockoutPicks?: BPKnockoutPick[]
  bpEntryProgressMap?: Record<string, number>
  // All entries' BP data for leaderboard scoring
  allBPGroupRankings?: BPGroupRanking[]
  allBPThirdPlaceRankings?: BPThirdPlaceRanking[]
  allBPKnockoutPicks?: BPKnockoutPick[]
  /** Live provisional bracket group scoring flag (sync_settings) — keeps
   * client-side bracket score computations consistent with stored totals. */
  bpProvisionalScoring?: boolean
  /** Final podium (champion/runner-up/third) from tournament_awards; null until
   * finalized. Feeds the pick-vs-actual "Tournament Podium" breakdown section. */
  tournamentAwards?: PodiumResult | null
}

// =====================
// COMPONENT
// =====================
export function PoolDetail({
  pool: initialPool,
  members: initialMembers,
  matches: initialMatches,
  settings: initialSettings,
  userPredictions,
  teams,
  conductData,
  bonusScores,
  entryStats: initialEntryStats,
  matchdayMVP,
  matchAccuracy,
  memberId,
  currentUserId,
  isAdmin,
  isPastDeadline,
  psoEnabled,
  userEntries,
  isSuperAdmin,
  isSuperAdminViewing,
  hasSeenHowToPlay,
  roundStates = [],
  leagueDepth = null,
  leagueOutcomes,
  leagueStandings = [],
  leagueStandingsAt = null,
  leagueForm,
  leagueNextFixture,
  leagueMode = null,
  tableModeData = null,
  showdownData = null,
  lmsData = null,
  roundSubmissions = [],
  bpGroupRankings = [],
  bpThirdPlaceRankings = [],
  bpKnockoutPicks = [],
  bpEntryProgressMap: initialBPEntryProgressMap = {},
  bpProvisionalScoring = false,
  allBPGroupRankings = [],
  allBPThirdPlaceRankings = [],
  allBPKnockoutPicks = [],
  tournamentAwards = null,
}: PoolDetailProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  /**
   * ⚠ THE TABLE PREDICTION, HELD ABOVE THE UNMOUNT.
   *
   * Every tab panel here is conditionally rendered, so switching tabs UNMOUNTS
   * the one you left. TablePredictionTab seeds its `order` from the
   * server-rendered `savedOrder` prop, and that prop is a snapshot from page
   * load — so coming back re-seeded it with the order as it was BEFORE the
   * member dragged anything, and their saved table appeared to have been
   * thrown away until they refreshed.
   *
   * Holding the last successful save here outlives the unmount. Not
   * router.refresh(): that re-runs the whole pool page for a twenty-row list,
   * and autosave fires on every drag.
   *
   * ⚠ Only tracks saves made by THIS page. A save from another device still
   * needs a reload to show up here — acceptable for a once-a-season pick, and
   * the reason this is state and not a cache.
   */
  const [tableSaved, setTableSaved] = useState<{ order: string[]; at: string | null }>(() => ({
    order: tableModeData?.savedOrder ?? [],
    at: tableModeData?.savedAt ?? null,
  }))

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const urlTab = searchParams.get('tab') as Tab
    if (urlTab) return urlTab
    // Showdown opens on the duel. In every other mode the leaderboard is the
    // thing you came to look at; in this one it is who you are playing, and a
    // pool that opens on a totals table reads as pick'em with a duel attached.
    // Read off `initialPool` rather than `isShowdown`, which is derived far
    // below this initialiser.
    if (initialPool.league_mode === 'showdown') return 'duels'
    return 'leaderboard'
  })
  const isDemoPool = initialPool.pool_id === '66b67286-e36e-40fd-8893-2a1fde0d018b'
  const [showHowToPlayModal, setShowHowToPlayModal] = useState(!hasSeenHowToPlay || isDemoPool)

  /**
   * THE DUEL RECAP — pool-wide, so it finds the member who never opens the Duel
   * tab, who is exactly the member it is for. Ryan's call, 2026-08-31.
   *
   * ⚠ IT DOES NOT GATE ANYTHING. The result is already on the duel card, the
   * season table and the leaderboard behind this sheet. Withholding it until
   * the ceremony is seen would be "we hold your score back so you come back" —
   * the disclosure gate's own example of a failure.
   */
  const [recapDismissed, setRecapDismissed] = useState(false)
  const duelRecap = showdownData?.recap ?? null
  const dismissRecap = useCallback(() => {
    // Optimistic: the sheet closes even if the write is slow or fails. A failed
    // write means it reappears next visit — mildly annoying, and far better
    // than the alternative.
    setRecapDismissed(true)
    if (!duelRecap || isDemoPool) return
    const supabase = createClient()
    supabase
      .from('pool_entries')
      .update({ last_recap_seen_at: new Date().toISOString() })
      .eq('entry_id', duelRecap.entryId)
      .then(({ error }) => {
        // ⚠ LOGGED, NOT DISCARDED. `has_seen_how_to_play` throws its result
        // away with a bare `.then()`, and a swallowed PostgREST error is a
        // documented way this codebase has lost hours. If the column ever loses
        // its UPDATE grant this is the only thing that would say so.
        if (error) console.error('[recap] marking seen failed:', error.message)
      })
  }, [duelRecap, isDemoPool])

  // Unread banter badge
  const singlePoolId = useMemo(() => [initialPool.pool_id], [initialPool.pool_id])
  const { unreadCounts, markAsRead, initialLastReadMap } = useUnreadBanter({ userId: currentUserId, poolIds: singlePoolId })
  const banterUnreadCount = unreadCounts.get(initialPool.pool_id) ?? 0
  const hasUnreadBanter = banterUnreadCount > 0 && activeTab !== 'community'
  const banterInitialLastReadAt = initialLastReadMap.get(initialPool.pool_id) ?? null

  useEffect(() => {
    if (activeTab === 'community') {
      markAsRead(initialPool.pool_id)
    }
  }, [activeTab, initialPool.pool_id, markAsRead])

  const isAdminTab = ADMIN_TABS.some(t => t.key === activeTab) || activeTab === 'rounds' || activeTab === 'fees'

  // Mark how-to-play as seen on first visit (non-blocking, skip for super admin non-member)
  useEffect(() => {
    if (!hasSeenHowToPlay && memberId && !isDemoPool) {
      const supabase = createClient()
      supabase
        .from('pool_members')
        .update({ has_seen_how_to_play: true })
        .eq('member_id', memberId)
        .then()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync tab state on browser back/forward (popstate)
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      const tab = (params.get('tab') as Tab) || 'leaderboard'
      setActiveTab(tab)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const [pool, setPool] = useState(initialPool)
  const [members, setMembers] = useState(initialMembers)
  const [matches, setMatches] = useState(initialMatches)
  const [settings, setSettings] = useState(initialSettings)
  // Loaded on demand — see loadBulkData below. Empty until a tab needs them.
  const [allPredictions, setAllPredictions] = useState<PredictionData[]>([])
  /**
   * Everyone's Results-depth taps, reveal-gated by the bulk route — a matchweek
   * that is still open is not in here. Separate from `allPredictions` because
   * `PredictionData` requires non-null scores and a tap has none.
   */
  const [allLeagueOutcomes, setAllLeagueOutcomes] = useState<
    Array<{ entry_id: string; match_id: string; outcome: 'home' | 'draw' | 'away' }>
  >([])
  // Stateful so the live delta can be merged in without a full RSC refresh.
  const [matchScores, setMatchScores] = useState<MatchScoreNarrow[]>([])
  const [bulkState, setBulkState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  // Same: the leaderboard's precomputed stats move as scores land, so the live
  // delta carries them and merges here rather than waiting for a full refresh.
  const [entryStats, setEntryStats] = useState(initialEntryStats)
  const [showNavWarning, setShowNavWarning] = useState(false)

  // Prediction mode flags (defined early so hooks can reference them)
  // Does this pool predict round by round? True for progressive (World Cup
  // knockout rounds) and for league_pickem (matchweeks). Every use below is
  // really asking this, not "is it progressive" — the Rounds tab, the
  // round-based prediction flow, and the all-at-once fallback.
  const usesRoundFlow = usesRounds(pool.prediction_mode)
  const isBracketPicker = pool.prediction_mode === 'bracket_picker'
  const [pendingTab, setPendingTab] = useState<Tab | null>(null)
  const settingsDirtyRef = useRef(false)

  // Entry management
  const [entries, setEntries] = useState<EntryData[]>(userEntries)
  const [activeEntryId, setActiveEntryId] = useState<string>(
    userEntries[0]?.entry_id || ''
  )
  const activeEntry = entries.find(e => e.entry_id === activeEntryId) || entries[0] || null

  // Full 22-column rows for the ACTIVE entry only. The pool-wide `matchScores`
  // carries 8 columns; the results view and the points breakdown need the other
  // 14 (predicted/actual scores, PSO, team ids) but only ever for one entry.
  // Fetching ~104 rows here instead of shipping 13,385 wide rows on every pool
  // open is the difference between 3,698 kB and 8,477 kB of payload.
  const [activeEntryScores, setActiveEntryScores] = useState<MatchScoreData[]>([])
  useEffect(() => {
    const entryId = activeEntry?.entry_id
    if (!entryId) { setActiveEntryScores([]); return }
    let cancelled = false
    fetch(`/api/pools/${pool.pool_id}/entries/${entryId}/match-scores`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { scores: [] }))
      .then(d => { if (!cancelled) setActiveEntryScores(d.scores ?? []) })
      .catch(() => { if (!cancelled) setActiveEntryScores([]) })
    return () => { cancelled = true }
  }, [pool.pool_id, activeEntry?.entry_id])

  // Entry rename state
  const [editingEntryName, setEditingEntryName] = useState(false)
  const [entryNameDraft, setEntryNameDraft] = useState('')
  const [savingEntryName, setSavingEntryName] = useState(false)
  const [addingEntry, setAddingEntry] = useState(false)
  const [showDeleteEntryModal, setShowDeleteEntryModal] = useState(false)
  const [deletingEntry, setDeletingEntry] = useState(false)
  const entryNameInputRef = useRef<HTMLInputElement>(null)
  const [predictionStatus, setPredictionStatus] = useState<{ saveStatus: SaveStatus; lastSavedAt: string | null; predictedCount: number }>({ saveStatus: 'idle', lastSavedAt: null, predictedCount: 0 })

  // Multi-entry view state (list vs detail)
  const [predictionsView, setPredictionsView] = useState<{ mode: 'list' } | { mode: 'detail'; entryId: string }>({ mode: 'list' })
  // Post-lock: viewing ANOTHER member's entry read-only (Phase 3b "stop screen").
  const [spectatingEntry, setSpectatingEntry] = useState<{ entryId: string; ownerName: string; entryName: string } | null>(null)
  const [pendingBackToList, setPendingBackToList] = useState(false)

  // Derive submission state from active entry
  const hasSubmitted = activeEntry?.has_submitted_predictions ?? false
  const submittedAt = activeEntry?.predictions_submitted_at ?? null
  const lastSavedAt = activeEntry?.predictions_last_saved_at ?? null
  const predictionsLocked = activeEntry?.predictions_locked ?? false

  const canAddEntry = !isSuperAdminViewing && pool.max_entries_per_user > entries.length && !isPastDeadline
  const canDeleteEntry = !isSuperAdminViewing && entries.length > 1 && activeEntry && !activeEntry.has_submitted_predictions && !isPastDeadline

  // Rename active entry
  const handleRenameEntry = async () => {
    if (!activeEntry || !entryNameDraft.trim() || savingEntryName) return
    const trimmed = entryNameDraft.trim()
    if (trimmed === activeEntry.entry_name) {
      setEditingEntryName(false)
      return
    }
    setSavingEntryName(true)
    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: activeEntry.entry_id, entryName: trimmed }),
      })
      if (res.ok) {
        setEntries(prev => prev.map(e =>
          e.entry_id === activeEntry.entry_id ? { ...e, entry_name: trimmed } : e
        ))
        setEditingEntryName(false)
      }
    } finally {
      setSavingEntryName(false)
    }
  }

  // Add new entry
  const handleAddEntry = async () => {
    if (addingEntry || !canAddEntry) return
    setAddingEntry(true)
    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        setEntries(prev => [...prev, data.entry as EntryData])
        setActiveEntryId(data.entry.entry_id)
        // Start editing the new entry name
        setEntryNameDraft(data.entry.entry_name)
        setEditingEntryName(true)
      }
    } finally {
      setAddingEntry(false)
    }
  }

  // Delete active entry
  const handleDeleteEntry = async () => {
    if (!activeEntry || deletingEntry || !canDeleteEntry) return
    setDeletingEntry(true)
    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/entries?entryId=${activeEntry.entry_id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const remaining = entries.filter(e => e.entry_id !== activeEntry.entry_id)
        setEntries(remaining)
        setActiveEntryId(remaining[0]?.entry_id || '')
        setShowDeleteEntryModal(false)
        setPredictionsView({ mode: 'list' })
        // Clear cached data for deleted entry
        setLiveEntryPredictions(prev => {
          const next = { ...prev }
          delete next[activeEntry.entry_id]
          return next
        })
        setLiveBPData(prev => {
          const next = { ...prev }
          delete next[activeEntry.entry_id]
          return next
        })
        setBPEntryProgressMap(prev => {
          const next = { ...prev }
          delete next[activeEntry.entry_id]
          return next
        })
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete entry')
      }
    } finally {
      setDeletingEntry(false)
    }
  }

  // Live predictions fetched client-side (overrides server data when available)
  const [liveEntryPredictions, setLiveEntryPredictions] = useState<Record<string, ExistingPrediction[]>>({})
  const [liveRoundSubmissions, setLiveRoundSubmissions] = useState<Record<string, EntryRoundSubmission[]>>({})
  const [loadingPredictions, setLoadingPredictions] = useState(false)

  // Live bracket picker data fetched client-side (overrides server data when available)
  const [liveBPData, setLiveBPData] = useState<Record<string, {
    groupRankings: BPGroupRanking[]
    thirdPlaceRankings: BPThirdPlaceRanking[]
    knockoutPicks: BPKnockoutPick[]
  }>>({})
  const [bpEntryProgressMap, setBPEntryProgressMap] = useState<Record<string, number>>(initialBPEntryProgressMap)

  // Fetch predictions for the active entry from the database
  /**
   * ⚠ A LEAGUE PICK IS NOT IN `predictions`.
   *
   * This read is not cosmetic — it is what the Predictions tab rehydrates from
   * every time a member returns to it (the effect below fires on `activeTab`).
   * Pointed at `predictions`, a league entry has ZERO rows there, so it wrote an
   * EMPTY array into `liveEntryPredictions` — and `activeEntryPredictions`
   * prefers live over server data, so the picks the member had just made were
   * replaced with nothing, on a screen whose database rows were perfectly
   * intact. Reported by Ryan on 30 Aug 2026 as "predictions are not being
   * saved"; they were. Confirmed against production: the two picks made at
   * 16:04 UTC were in `league_predictions` while the screen showed none.
   *
   * `.select()` with no `if (data)` guard is the other half of why it was
   * invisible: an empty array is truthy, so the write happened silently.
   *
   * `readLeaguePredictions` rather than a second hand-rolled mapping — it
   * already pages past the 1,000-row cap, already reports its errors, and
   * already splits the two depths. Results-depth picks come back as `outcomes`
   * and are deliberately dropped here: they never travel as an
   * `ExistingPrediction` (see the note on that return type), and the Results
   * control reads its own sticky map.
   */
  const fetchEntryPredictions = useCallback(async (entryId: string) => {
    setLoadingPredictions(true)
    try {
      const supabase = createClient()

      if (pool.league_season_id) {
        const { readLeaguePredictions } = await import('@/lib/league/read')
        const { predictions, error } = await readLeaguePredictions(supabase, entryId)
        if (error) {
          // Loud, and NO WRITE. Writing `[]` on a failed read is what made the
          // original bug look like data loss rather than a failed fetch.
          console.error('[pool detail] league predictions refetch failed:', error)
          return
        }
        setLiveEntryPredictions(prev => ({ ...prev, [entryId]: predictions }))
        return
      }

      const { data } = await supabase
        .from('predictions')
        .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id, prediction_id')
        .eq('entry_id', entryId)
      if (data) {
        setLiveEntryPredictions(prev => ({
          ...prev,
          [entryId]: data as ExistingPrediction[],
        }))
      }
    } finally {
      setLoadingPredictions(false)
    }
  }, [pool.league_season_id])

  // Fetch round submissions for an entry (progressive pools)
  const fetchEntryRoundSubmissions = useCallback(async (entryId: string) => {
    if (pool.prediction_mode !== 'progressive') return
    const supabase = createClient()
    const { data } = await supabase
      .from('entry_round_submissions')
      .select('*')
      .eq('entry_id', entryId)
    if (data) {
      setLiveRoundSubmissions(prev => ({ ...prev, [entryId]: data as EntryRoundSubmission[] }))
    }
  }, [pool.prediction_mode])

  // Fetch bracket picker data for an entry
  const fetchEntryBPData = useCallback(async (entryId: string) => {
    setLoadingPredictions(true)
    try {
      const supabase = createClient()
      const [grRes, tpRes, kpRes] = await Promise.all([
        supabase.from('bracket_picker_group_rankings').select('*').eq('entry_id', entryId),
        supabase.from('bracket_picker_third_place_rankings').select('*').eq('entry_id', entryId),
        supabase.from('bracket_picker_knockout_picks').select('*').eq('entry_id', entryId),
      ])
      const groupRankings = (grRes.data ?? []) as BPGroupRanking[]
      const thirdPlaceRankings = (tpRes.data ?? []) as BPThirdPlaceRanking[]
      const knockoutPicks = (kpRes.data ?? []) as BPKnockoutPick[]
      setLiveBPData(prev => ({
        ...prev,
        [entryId]: { groupRankings, thirdPlaceRankings, knockoutPicks },
      }))
      // Update progress map
      setBPEntryProgressMap(prev => ({
        ...prev,
        [entryId]: groupRankings.length + thirdPlaceRankings.length + knockoutPicks.length,
      }))
    } finally {
      setLoadingPredictions(false)
    }
  }, [])

  // Navigate into an entry's detail view (multi-entry)
  const handleOpenEntryDetail = useCallback((entry: EntryData) => {
    setActiveEntryId(entry.entry_id)
    // Clear stale cached data so detail view doesn't mount with old data
    setLiveEntryPredictions(prev => {
      const next = { ...prev }
      delete next[entry.entry_id]
      return next
    })
    setLiveBPData(prev => {
      const next = { ...prev }
      delete next[entry.entry_id]
      return next
    })
    setPredictionsView({ mode: 'detail', entryId: entry.entry_id })
    // Fetch fresh data — detail view is gated on loadingPredictions
    if (isBracketPicker) {
      fetchEntryBPData(entry.entry_id)
    } else {
      fetchEntryPredictions(entry.entry_id)
      fetchEntryRoundSubmissions(entry.entry_id)
    }
  }, [fetchEntryPredictions, fetchEntryRoundSubmissions, fetchEntryBPData, isBracketPicker])

  // Navigate back to entries list (silently save any pending changes, refresh list data)
  const handleBackToList = useCallback(async () => {
    if (predictionsRef.current?.hasUnsaved()) {
      await predictionsRef.current.save()
    }

    // Refresh predictions + entry metadata so list view shows up-to-date progress/timestamps
    const entryId = activeEntryId
    if (entryId) {
      const supabase = createClient()

      if (isBracketPicker) {
        // Refresh BP progress counts + entry metadata
        const [grRes, tpRes, kpRes, entryResult] = await Promise.all([
          supabase.from('bracket_picker_group_rankings').select('entry_id').eq('entry_id', entryId),
          supabase.from('bracket_picker_third_place_rankings').select('entry_id').eq('entry_id', entryId),
          supabase.from('bracket_picker_knockout_picks').select('entry_id').eq('entry_id', entryId),
          supabase
            .from('pool_entries')
            .select('has_submitted_predictions, predictions_submitted_at, predictions_last_saved_at')
            .eq('entry_id', entryId)
            .single(),
        ])
        const count = (grRes.data?.length ?? 0) + (tpRes.data?.length ?? 0) + (kpRes.data?.length ?? 0)
        setBPEntryProgressMap(prev => ({ ...prev, [entryId]: count }))
        if (entryResult.data) {
          setEntries(prev => prev.map(e =>
            e.entry_id === entryId
              ? {
                  ...e,
                  predictions_last_saved_at: entryResult.data.predictions_last_saved_at,
                  has_submitted_predictions: entryResult.data.has_submitted_predictions,
                  predictions_submitted_at: entryResult.data.predictions_submitted_at,
                }
              : e
          ))
        }
      } else {
        // Refresh predictions + entry metadata for non-BP modes
        const [predsResult, entryResult] = await Promise.all([
          supabase
            .from('predictions')
            .select('prediction_id, entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
            .eq('entry_id', entryId),
          supabase
            .from('pool_entries')
            .select('has_submitted_predictions, predictions_submitted_at, predictions_last_saved_at')
            .eq('entry_id', entryId)
            .single(),
        ])
        if (predsResult.data) {
          setAllPredictions(prev => [
            ...prev.filter(p => p.entry_id !== entryId),
            ...(predsResult.data as PredictionData[]),
          ])
        }
        if (entryResult.data) {
          setEntries(prev => prev.map(e =>
            e.entry_id === entryId
              ? {
                  ...e,
                  predictions_last_saved_at: entryResult.data.predictions_last_saved_at,
                  has_submitted_predictions: entryResult.data.has_submitted_predictions,
                  predictions_submitted_at: entryResult.data.predictions_submitted_at,
                }
              : e
          ))
        }
      }
    }

    setPredictionsView({ mode: 'list' })
  }, [activeEntryId, isBracketPicker])

  // Delete entry from list view (needs to set active first for handleDeleteEntry)
  const handleDeleteEntryFromList = useCallback((entry: EntryData) => {
    setActiveEntryId(entry.entry_id)
    setShowDeleteEntryModal(true)
  }, [])

  // Rename entry from list view
  const handleRenameEntryFromList = useCallback(async (entry: EntryData, newName: string) => {
    const res = await fetch(`/api/pools/${pool.pool_id}/entries`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.entry_id, entryName: newName }),
    })
    if (res.ok) {
      setEntries(prev => prev.map(e =>
        e.entry_id === entry.entry_id ? { ...e, entry_name: newName } : e
      ))
    }
  }, [pool.pool_id])

  // Focus input when editing starts
  useEffect(() => {
    if (editingEntryName && entryNameInputRef.current) {
      entryNameInputRef.current.focus()
      entryNameInputRef.current.select()
    }
  }, [editingEntryName])

  // Sync server-refreshed props into local state
  useEffect(() => { setPool(initialPool) }, [initialPool])
  useEffect(() => { setMembers(initialMembers) }, [initialMembers])
  useEffect(() => { setMatches(initialMatches) }, [initialMatches])
  useEffect(() => { setSettings(initialSettings) }, [initialSettings])
  // The two pool-wide arrays are no longer props, so a server refresh cannot
  // re-seed them the way it re-seeds everything above. Mark them stale instead:
  // the loader re-fetches if a tab still needs them. Without this, finishing a
  // match would leave an open Analytics tab showing pre-match scores.
  const skipFirstRefresh = useRef(true)
  useEffect(() => {
    if (skipFirstRefresh.current) { skipFirstRefresh.current = false; return }
    setBulkState(prev => (prev === 'ready' ? 'idle' : prev))
  }, [initialMatches])

  // ---------------------------------------------------------------------
  // Live refresh
  //
  // A router.refresh() re-sends the WHOLE server payload — 3.8 MB on the
  // largest pool — even though during a live match only that match's scores
  // can have changed. Predictions can't change at all (locked at kickoff by
  // trg_enforce_prediction_before_kickoff, and page.tsx only ships revealed
  // picks), and completed matches' scores are final. So ~98.6% of a refresh is
  // provably identical to what we already hold.
  //
  // /live returns just the moving parts (~15 kB) and we merge them. Structural
  // changes — a member joining, settings edits — still go through
  // router.refresh(), because those DO change the immutable half.
  // ---------------------------------------------------------------------
  const liveSeq = useRef(0)
  // Read the latest matches without adding them to applyLive's deps — otherwise
  // the 30s interval tears down and re-arms on every score change.
  const matchesRef = useRef(matches)
  useEffect(() => { matchesRef.current = matches }, [matches])

  // ---------------------------------------------------------------------------
  // Per-tab bulk load: the two pool-wide arrays (every member's picks, every
  // score row). They were 95% of pool open and the leaderboard reads neither, so
  // they are fetched only when a tab that needs them is opened.
  //
  // The response is reveal-gated SERVER-SIDE by the route — other members'
  // still-unlocked picks never reach this component.
  // ---------------------------------------------------------------------------
  const loadBulkData = useCallback(async () => {
    setBulkState('loading')
    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/bulk`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`bulk ${res.status}`)
      const data = (await res.json()) as {
        predictions: PredictionData[]
        matchScores: MatchScoreNarrow[]
        outcomes?: Array<{ entry_id: string; match_id: string; outcome: 'home' | 'draw' | 'away' }>
      }
      setAllPredictions(data.predictions ?? [])
      setMatchScores(data.matchScores ?? [])
      setAllLeagueOutcomes(data.outcomes ?? [])
      setBulkState('ready')
    } catch {
      // These tabs render empty rather than wrong on failure, and the banner
      // below offers a retry — silently showing "no picks" would read as data
      // loss to a member who knows they made picks.
      setBulkState('error')
    }
  }, [pool.pool_id])

  const needsBulk =
    TABS_NEEDING_BULK.includes(activeTab) ||
    (activeTab === 'predictions' && (pool.max_entries_per_user > 1 || isPastDeadline))

  useEffect(() => {
    if (!needsBulk || bulkState !== 'idle') return
    loadBulkData()
  }, [needsBulk, bulkState, loadBulkData])

  /**
   * THE DUEL CARD'S LIVE NUMBERS — two halves, two mechanisms.
   *
   * ⚠ `showdownData` is a server prop and nothing updated it, so the duel
   * scoreline sat frozen at page load — 400–200 all afternoon — while the
   * leaderboard beside it moved in realtime. The team sheet's red clock had the
   * same problem: it showed the minute the page loaded and never advanced.
   * Everything was built; none of it moved.
   *
   * FIXTURES now arrive by BROADCAST (migration 125). The score, the flip to
   * live and the minute are IN the message, so the card repaints the moment the
   * database learns them — no fetch, no round trip, nothing to debounce.
   *
   * POINTS still arrive by fetch. What each entry scored is an aggregate across
   * the pool's entries that no single row change expresses, and it moves on the
   * same goal the fixture broadcast already announced — so it can ride the
   * existing debounce a few seconds behind without anybody seeing a gap.
   *
   * Both ride the SAME channel the leaderboard already uses rather than opening
   * a second one: two subscriptions to one topic would double the per-recipient
   * message billing the comment below is about.
   */
  type LiveFixture = {
    number: number; homeScore: number | null; awayScore: number | null
    status: string | null; isCompleted: boolean
    liveMinute: number | null; livePeriod: string | null; liveAdded: number | null
  }
  // ⚠ BOTH CARRY THE MATCHWEEK THEY DESCRIBE, and both are read back through
  // it. `fixture_number` restarts at 1 every matchweek, and `inPlayMatchweek`
  // is a server prop that `router.refresh()` can change WITHOUT remounting this
  // component — so live state cached under week 2 would otherwise be painted
  // onto week 3's fixture 7 the moment the rollover happened. Stamping the week
  // makes stale data unreadable rather than merely unlikely.
  const [duelPoints, setDuelPoints] = useState<{
    mw: number
    points: Record<string, number>
    perFixture: Record<string, Record<string, number>>
  } | null>(null)
  // ⚠ KEYED BY FIXTURE NUMBER, not an array, because a broadcast is a DELTA:
  // migration 125 sends only the fixtures that actually moved. Merging into a
  // map is the whole reason the payload can be that small.
  const [duelFixtures, setDuelFixtures] =
    useState<{ mw: number; byNumber: Record<number, LiveFixture> } | null>(null)

  // ⚠ The instant the last broadcast landed. A fetch that was already in flight
  // when a goal went in returns PRE-goal fixtures, and applying them would
  // flicker the score back for a few seconds. Points are unaffected — they are
  // computed after the fixture write, so a late fetch is stale for neither.
  const lastFixtureBroadcast = useRef(0)

  const inPlayMw = showdownData?.inPlayMatchweek ?? null
  const applyDuelLive = useCallback(async () => {
    if (inPlayMw === null) return
    const startedAt = Date.now()
    try {
      const res = await fetch(
        `/api/pools/${pool.pool_id}/duel-live?matchweek=${inPlayMw}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as {
        points: Record<string, number>
        perFixture: Record<string, Record<string, number>>
        fixtures: LiveFixture[]
      }
      setDuelPoints({ mw: inPlayMw, points: data.points, perFixture: data.perFixture })

      // The fixture half of this response is the FALLBACK, and it matters:
      // Realtime is a pipe, not a log, so a message sent while a socket was
      // down is simply gone. This is how the card recovers.
      if (lastFixtureBroadcast.current <= startedAt) {
        setDuelFixtures(prev => {
          const byNumber = prev?.mw === inPlayMw ? { ...prev.byNumber } : {}
          for (const f of data.fixtures ?? []) byNumber[f.number] = f
          return { mw: inPlayMw, byNumber }
        })
      }
    } catch {
      // A dropped poll leaves the last good numbers on screen, which is the
      // right failure: stale beats blank, and the next tick fixes it.
    }
  }, [pool.pool_id, inPlayMw])

  const applyLive = useCallback(async () => {
    // Guard against out-of-order responses: a slow request that lands after a
    // newer one must not overwrite fresher numbers with staler ones.
    const seq = ++liveSeq.current
    let data: PoolLiveResponse
    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/live`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`live ${res.status}`)
      data = await res.json()
    } catch {
      // Never leave the leaderboard stale on a transient failure — live
      // standings are a product guarantee, so fall back to the full refresh.
      router.refresh()
      return
    }
    if (seq !== liveSeq.current) return

    // A match finished since we loaded: its scores moved into the immutable
    // half, which a delta cannot express. Rebuild instead of merging.
    if (needsFullRefresh(matchesRef.current, data)) {
      router.refresh()
      return
    }

    setMatches(prev => mergeMatches(prev, data))
    setMembers(prev => mergeMembers(prev, data))
    setMatchScores(prev => mergeMatchScores(prev, data))
    setEntryStats(prev => mergeEntryStats(prev, data))
  }, [pool.pool_id, router])

  // Ref to check PredictionsFlow unsaved state
  const predictionsRef = useRef<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>(null)

  // Leave pool state
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [brandedNavOpen, setBrandedNavOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const adminCount = members.filter((m) => m.role === 'admin').length
  const isSoleAdmin = isAdmin && adminCount <= 1

  async function handleLeavePool() {
    setLeaving(true)

    // Funnel through the server endpoint instead of a direct
    // supabase.delete so an audit row lands in pool_membership_events
    // before the membership row is gone. That audit row drives the
    // "Left <pool>" activity card on the user's feed afterwards.
    const res = await fetch(`/api/pools/${pool.pool_id}/leave`, { method: 'POST' })
    if (!res.ok) {
      setLeaving(false)
      setShowLeaveModal(false)
      return
    }

    await fetch(`/api/pools/${pool.pool_id}/recalculate`, { method: 'POST' })

    router.push('/pools')
  }

  // ---------------------------------------------------------------------------
  // Real-time leaderboard: Broadcast-from-database.
  //
  // WHAT THIS REPLACES: a `postgres_changes` subscription on pool_entries.
  // Postgres emits ONE EVENT PER ROW, so a 192-entry pool emitted 192 events per
  // scoring pass, to every subscriber, each billed per recipient — ~9,600
  // messages for one goal with 50 people watching. And the client used none of
  // it: it was a doorbell, and then everyone fetched /live over HTTP anyway.
  //
  // Now: ONE message per pool per scoring pass, carrying only the rows that
  // actually moved (shadow_finalize_totals writes diff-aware, so unchanged rows
  // never reach the trigger's transition table). Same goal, same 50 viewers:
  // 51 messages. The totals and ranks apply straight from the payload — no
  // fetch — so the leaderboard moves as soon as the message lands.
  //
  // Private topic `pool:{id}:leaderboard`, authorized by the same
  // realtime.messages policy banter uses (pool membership). Private channels
  // need the socket to carry the JWT, hence setAuth() before subscribe.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient()
    let active = true
    let scoresTimer: ReturnType<typeof setTimeout> | null = null

    const channel = supabase
      .channel(`pool:${pool.pool_id}:leaderboard`, { config: { private: true } })
      // ⚠ FIXTURES: applied straight from the payload, no fetch. Migration 125
      // puts the score, the status and the minute in the message, so this is
      // the fast path — the card moves on the goal, not on a round trip.
      //
      // NOT debounced, deliberately: the whole point of the leaderboard's
      // debounce is that a message triggers WORK (an HTTP fetch per viewer).
      // This triggers a setState off data already in hand, so spacing it out
      // would only make the score late.
      .on('broadcast', { event: 'fixtures_update' }, (msg) => {
        const fixtures = (msg as { payload?: { fixtures?: (LiveFixture & { matchweek: number })[] } })
          ?.payload?.fixtures
        if (!fixtures?.length || inPlayMw === null) return

        // A season's pools all share one topic per pool, but a pool only ever
        // draws ONE matchweek. Dropping the rest here costs nothing and keeps a
        // rescheduled fixture from another week off this card.
        const mine = fixtures.filter(f => f.matchweek === inPlayMw)
        if (!mine.length) return

        lastFixtureBroadcast.current = Date.now()
        setDuelFixtures(prev => {
          const byNumber = prev?.mw === inPlayMw ? { ...prev.byNumber } : {}
          for (const f of mine) byNumber[f.number] = f
          return { mw: inPlayMw, byNumber }
        })
      })
      .on('broadcast', { event: 'leaderboard_update' }, (msg) => {
        const payload = (msg as { payload?: { entries?: LiveEntry[] } })?.payload
        const entries = payload?.entries
        if (!entries?.length) return

        // Totals and ranks are IN the message — apply immediately.
        setMembers(prev => mergeMembers(prev, { entries }))

        // The rest of a live row (match scores, form dots, hit rate) still comes
        // from /live. Debounced with jitter so one goal doesn't make every
        // connected client fetch in the same second.
        if (scoresTimer) clearTimeout(scoresTimer)
        scoresTimer = setTimeout(() => {
          void applyLive()
          // The duel card's POINTS only — its fixtures came in on the
          // `fixtures_update` handler above with no fetch at all. Same debounce
          // and jitter: one goal must not make every viewer fetch in one second.
          void applyDuelLive()
        }, 1500 + Math.random() * 4000)
      })

    // Without the JWT the private-channel policy won't authorize the topic and
    // no events arrive — silently. Subscribe only after setAuth resolves.
    void Promise.resolve(supabase.realtime.setAuth()).then(() => {
      if (active) channel.subscribe()
    })

    return () => {
      active = false
      if (scoresTimer) clearTimeout(scoresTimer)
      supabase.removeChannel(channel)
    }
  }, [pool.pool_id, applyLive, applyDuelLive, inPlayMw])

  // Fallback poll, in case Realtime drops a message (it is a pipe, not a log —
  // a broadcast sent while the socket is down is gone).
  //
  // The interval is deliberately ADAPTIVE. Every 30s regardless of whether
  // anything could have changed was the single largest source of idle traffic:
  // 50 people sitting on a finished leaderboard generated ~198 MB/hour of "no
  // change". With a match live the guarantee is what matters, so the safety net
  // stays tight; with nothing live nothing CAN move except an admin adjustment,
  // so a slow tick is enough.
  const hasLiveMatch = useMemo(
    () => matches.some(m => m.status === 'live'),
    [matches],
  )
  useEffect(() => {
    const autoRefreshTabs: Tab[] = ['leaderboard', 'results', 'my_bracket', 'standings']
    if (!autoRefreshTabs.includes(activeTab)) return

    const intervalMs = hasLiveMatch ? 30_000 : 300_000
    const interval = setInterval(() => applyLive(), intervalMs)
    return () => clearInterval(interval)
  }, [activeTab, applyLive, hasLiveMatch])

  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab)
    window.scrollTo({ top: 0 })
    // Update URL without full navigation so back/forward works
    const url = new URL(window.location.href)
    if (tab === 'leaderboard') {
      url.searchParams.delete('tab')
    } else {
      url.searchParams.set('tab', tab)
    }
    window.history.pushState({}, '', url.toString())
  }, [])

  const handleTabSwitch = useCallback((tab: Tab) => {
    // If leaving predictions tab with unsaved changes, show warning
    if (activeTab === 'predictions' && tab !== 'predictions' && predictionsRef.current?.hasUnsaved()) {
      setPendingTab(tab)
      setShowNavWarning(true)
      return
    }
    // If leaving settings tab with unsaved changes, show warning
    if (activeTab === 'settings' && tab !== 'settings' && settingsDirtyRef.current) {
      setPendingTab(tab)
      setShowNavWarning(true)
      return
    }
    switchTab(tab)
  }, [activeTab, switchTab])

  const handleSaveAndLeave = async () => {
    if (predictionsRef.current) {
      await predictionsRef.current.save()
    }
    if (pendingBackToList) {
      setPredictionsView({ mode: 'list' })
      setPendingBackToList(false)
    } else if (pendingTab) {
      switchTab(pendingTab)
    }
    setShowNavWarning(false)
    setPendingTab(null)
  }

  const handleLeaveWithoutSaving = () => {
    if (pendingBackToList) {
      setPredictionsView({ mode: 'list' })
      setPendingBackToList(false)
    } else if (pendingTab) {
      switchTab(pendingTab)
    }
    setShowNavWarning(false)
    setPendingTab(null)
  }

  const handleCancelNav = () => {
    setShowNavWarning(false)
    setPendingTab(null)
    setPendingBackToList(false)
  }

  // Build pool settings for points calculation
  const poolSettings: PoolSettings = settings
    ? {
        ...DEFAULT_POOL_SETTINGS,
        ...settings,
        pso_exact_score: settings.pso_exact_score ?? 0,
        pso_correct_difference: settings.pso_correct_difference ?? 0,
        pso_correct_result: settings.pso_correct_result ?? 0,
      }
    : DEFAULT_POOL_SETTINGS

  // =============================================
  // Read stored total points for each entry from pool_entries (single source of truth)
  // =============================================
  const computedEntryTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const member of members) {
      for (const entry of member.entries || []) {
        const matchPts = entry.match_points ?? 0
        const bonusPts = entry.bonus_points ?? 0
        const adjustment = entry.point_adjustment ?? 0
        map.set(entry.entry_id, entry.scored_total_points ?? (matchPts + bonusPts + adjustment))
      }
    }
    return map
  }, [members])

  // Fetch predictions/BP data when switching to predictions/my_bracket tab or changing active entry
  useEffect(() => {
    if ((activeTab === 'predictions' || activeTab === 'my_bracket') && activeEntry) {
      if (isBracketPicker) {
        fetchEntryBPData(activeEntry.entry_id)
      } else {
        fetchEntryPredictions(activeEntry.entry_id)
      }
    }
  }, [activeTab, activeEntry?.entry_id, fetchEntryPredictions, fetchEntryBPData, isBracketPicker])

  // Derive active entry's predictions: prefer live data, fall back to server data
  const activeEntryPredictions: ExistingPrediction[] = useMemo(() => {
    if (!activeEntry) return []
    // Use live-fetched predictions if available
    if (liveEntryPredictions[activeEntry.entry_id]) {
      return liveEntryPredictions[activeEntry.entry_id]
    }
    // Fall back to server-fetched predictions for default entry
    if (activeEntry.entry_id === userEntries[0]?.entry_id) {
      return userPredictions
    }
    // Fall back to allPredictions for other entries
    return allPredictions
      .filter(p => p.entry_id === activeEntry.entry_id)
      .map(p => ({
        match_id: p.match_id,
        predicted_home_score: p.predicted_home_score,
        predicted_away_score: p.predicted_away_score,
        predicted_home_pso: p.predicted_home_pso,
        predicted_away_pso: p.predicted_away_pso,
        predicted_winner_team_id: p.predicted_winner_team_id,
        prediction_id: p.prediction_id,
      }))
  }, [activeEntry, userPredictions, allPredictions, userEntries, liveEntryPredictions])

  // Derive active entry's round submissions: prefer live data, fall back to server props
  const activeRoundSubmissions: EntryRoundSubmission[] = useMemo(() => {
    if (!activeEntry) return []
    if (liveRoundSubmissions[activeEntry.entry_id]) {
      return liveRoundSubmissions[activeEntry.entry_id]
    }
    // Server props now contain all user entries' submissions
    return roundSubmissions.filter(s => s.entry_id === activeEntry.entry_id)
  }, [activeEntry, roundSubmissions, liveRoundSubmissions])

  // Derive active entry's bracket picker data: prefer live data, fall back to server props
  const activeBPGroupRankings: BPGroupRanking[] = useMemo(() => {
    if (!activeEntry) return []
    if (liveBPData[activeEntry.entry_id]) return liveBPData[activeEntry.entry_id].groupRankings
    if (activeEntry.entry_id === userEntries[0]?.entry_id) return bpGroupRankings
    return []
  }, [activeEntry, liveBPData, userEntries, bpGroupRankings])

  const activeBPThirdPlaceRankings: BPThirdPlaceRanking[] = useMemo(() => {
    if (!activeEntry) return []
    if (liveBPData[activeEntry.entry_id]) return liveBPData[activeEntry.entry_id].thirdPlaceRankings
    if (activeEntry.entry_id === userEntries[0]?.entry_id) return bpThirdPlaceRankings
    return []
  }, [activeEntry, liveBPData, userEntries, bpThirdPlaceRankings])

  const activeBPKnockoutPicks: BPKnockoutPick[] = useMemo(() => {
    if (!activeEntry) return []
    if (liveBPData[activeEntry.entry_id]) return liveBPData[activeEntry.entry_id].knockoutPicks
    if (activeEntry.entry_id === userEntries[0]?.entry_id) return bpKnockoutPicks
    return []
  }, [activeEntry, liveBPData, userEntries, bpKnockoutPicks])

  // Total expected bracket picker picks for progress display (12 groups × 4 + 12 third place + 32 knockout)
  const bpTotalExpectedPicks = 92

  // Build user prediction list for results tab
  const userPredictionsList = activeEntryPredictions.map((p) => ({
    match_id: p.match_id,
    predicted_home_score: p.predicted_home_score,
    predicted_away_score: p.predicted_away_score,
    predicted_home_pso: p.predicted_home_pso,
    predicted_away_pso: p.predicted_away_pso,
    predicted_winner_team_id: p.predicted_winner_team_id,
  }))

  // Transform matches for predictions flow (needs home_team/away_team with flag_url)
  const predictionsMatches = matches.map((m) => ({
    ...m,
    home_team: m.home_team ? { country_name: m.home_team.country_name, country_code: m.home_team.country_code, flag_url: m.home_team.flag_url ?? null } : null,
    away_team: m.away_team ? { country_name: m.away_team.country_name, country_code: m.away_team.country_code, flag_url: m.away_team.flag_url ?? null } : null,
  }))

  const isLeaguePool = pool.league_season_id !== null

  const adminTabs = [
    // ⚠ No Rounds tab for a league. That panel opens and closes rounds by
    // writing `pool_round_states`, and a league pool holds ZERO of those rows
    // BY DESIGN — its matchweeks are DERIVED from `league_matchweeks` on every
    // read (page.tsx), and which one is open is enforced in the database by
    // `enforce_league_prediction_before_lock` (migration 058). There is no
    // admin lever here and there must not be one: the rhythm is self-driving,
    // and a screen offering to open matchweek 30 in August would be offering
    // something the database will refuse.
    ...(usesRoundFlow && !isLeaguePool ? [{ key: 'rounds' as Tab, label: 'Rounds' }] : []),
    { key: 'members' as Tab, label: 'Members' },
    ...(pool.entry_fee ? [{ key: 'fees' as Tab, label: 'Fees' }] : []),
    /* ⚠ No Scoring Config for a league either, and this one is hidden because
       it is DANGEROUS rather than merely useless.

       `league_score_fixture` reads its prices from `pool_settings.group_*`
       (migration 066), so three of that panel's sliders are live wires — but
       the panel is labelled for a World Cup. At Results depth the only control
       that does anything is "Exact Score Match", which sets what a correct
       CALL is worth (`px_results`), while "Correct Winner Only" — the one that
       names exactly what members do — is inert. An admin who wants to reprice a
       correct call reaches for the dead slider, watches it save, and changes
       nothing. Everything else on the panel (knockout multipliers, PSO, every
       bonus) writes to columns no league engine reads, under a caption that
       says a Final called exactly is worth 800 points.

       Not replaced with a league version yet, on purpose: migration 079 says
       moving the fixture prices onto `league_pool_settings` — with a real
       `results_correct` column — is the unfinished half of L-D. A config UI
       built against `pool_settings.group_*` today is a UI L-D would move.
       Verified safe to hide 2026-08-24: all nine league pools sit at the
       shipped defaults and `league_pool_settings` holds zero rows, so this
       strands no one. */
    ...(isLeaguePool ? [] : [{ key: 'scoring_config' as Tab, label: 'Scoring Config' }]),
    { key: 'settings' as Tab, label: 'Settings' },
  ]
  // `standings` is commented out of the World Cup lists because there it
  // duplicates the Form tab. For a LEAGUE it is the actual competition table —
  // new information, and the one thing a Premier League pool most obviously
  // ought to show. Inserted after Results, where a football follower looks.
  // Memoised because the league branch builds a NEW array, and this list feeds
  // an effect further down — without this it would be a fresh reference on
  // every render and the effect would re-run for no reason.
  // Table mode has no fixture picks at all, so Results and Form would both be
  // empty screens promising something that never arrives. Its Predictions tab
  // IS the table, renamed to say so.
  const isTableMode = leagueMode === 'table'
  // Showdown keeps every Pick'em tab — it is a LAYER over the same weekly picks
  // — and adds one. That is the difference between a layer and a mode.
  const isShowdown = leagueMode === 'showdown'
  // Last Man Standing has its own pick shape and no depth (Decision 9), so it
  // replaces the Predictions tab rather than adding to it — there are no fixture
  // picks in this mode at all.
  const isLms = leagueMode === 'last_man_standing'
  const USER_TABS = useMemo(
    () =>
      isBracketPicker
        ? USER_TABS_BRACKET_PICKER
        : isTableMode
          ? USER_TABS_DEFAULT.flatMap((t) => {
              if (t.key === 'results' || t.key === 'analytics') return []
              if (t.key === 'predictions') {
                return [
                  { key: 'predictions' as Tab, label: 'My Table' },
                  { key: 'standings' as Tab, label: 'Table' },
                ]
              }
              return [t]
            })
          : isLms
            ? USER_TABS_DEFAULT.flatMap((t) => {
                if (t.key === 'results' || t.key === 'analytics') return []
                if (t.key === 'predictions') {
                  return [
                    { key: 'predictions' as Tab, label: 'Survival' },
                    { key: 'standings' as Tab, label: 'Table' },
                  ]
                }
                return [t]
              })
          : isLeaguePool
            ? withShowdownFirst(isShowdown, USER_TABS_DEFAULT.flatMap((t) => {
                // No Form tab. Table mode and Last Man Standing already dropped
                // it; Pick'em and Showdown kept it and should not have, because
                // it cannot render for ANY league pool — every one of its inputs
                // is missing, and deliberately so.
                //
                // `entryStats` is never written: the league outbox route BLOCKS
                // XP and badges rather than skipping them, because
                // `computePoolEntryAnalytics` reads `readMatchScores`, which has
                // no league arm — running it would compute accuracy and streak
                // from zero rows and store the zeros, "worse than blank"
                // (app/api/cron/league-outbox/route.ts). The deferral is already
                // a recorded decision, plan section 0.5; this finishes it in the
                // one place it had not been applied.
                if (t.key === 'analytics') return []
                if (t.key === 'results') return [t, { key: 'standings' as Tab, label: 'Table' }]
                return [t]
              }))
            : USER_TABS_DEFAULT,
    [isBracketPicker, isLeaguePool, isTableMode, isShowdown, isLms],
  )
  /**
   * An archived pool is readable, not editable. Nothing stopped an admin
   * opening one and changing its settings or scoring config — the page had no
   * concept of archived at all, it just never got linked to. Now that the
   * profile links to it, the admin surface has to come off: no Settings,
   * Scoring Config, Members, Rounds or Fees while archived.
   *
   * Restore is on the profile's archived list, so there is a way back that does
   * not depend on these tabs.
   */
  const isArchived = !!pool.archived_at

  /**
   * Admin rights, as they apply on THIS pool right now.
   *
   * Hiding the tab buttons was not enough: every admin panel below tested
   * `isAdmin` on its own, so ?tab=settings — or tab state left over from before
   * the pool was archived — still rendered the full editable form with no
   * button ever being shown. The strip and the panels have to read the same
   * flag, which is what this is.
   */
  /**
   * ONE-PAGE SHOWDOWN — off by default, reachable at `?layout=onepage`.
   *
   * Plan: drafts/2026-08-31_showdown_one_page_plan.md. The duel becomes the
   * page: the tab strip goes, the band sticks to the top, and Predictions,
   * Leaderboard and Banter render as sections beneath it.
   *
   * ⚠ BEHIND A PARAMETER UNTIL IT IS PROVEN, and only ever for Showdown. Every
   * other mode — Table, LMS, Pick'em, the World Cup, bracket pools — reads this
   * as false and is untouched, which is the whole reason it is a flag and not a
   * rewrite of the tab list.
   */
  const onePage = isShowdown && searchParams.get('layout') === 'onepage'

  const canAdmin = isAdmin && !isArchived
  const tabs = canAdmin ? [...USER_TABS, ...adminTabs] : USER_TABS

  // With the admin panels gated, a tab that is no longer offered renders
  // nothing at all — a blank pane under a strip that does not contain it. That
  // happens on ?tab=settings for an archived pool, or when a pool is archived
  // while someone is sitting on Settings. Fall back to the first real tab.
  useEffect(() => {
    if (!tabs.some(t => t.key === activeTab)) {
      setActiveTab(tabs[0].key)
    }
  }, [tabs, activeTab])

  // ⚠ ONE-PAGE HAS NO TABS, so the machinery that reads `activeTab` needs a
  // no-tabs path rather than an undefined one — the swipe navigation below and
  // the pill-scroll effect both assume a strip exists. Named once here so the
  // guards read as intent rather than as a repeated condition.
  // ⚠ One-page hides the strip on the DUEL and nowhere else. "See your picks"
  // still switches tabs, and landing on a stripless Predictions pane with no
  // way back would be a trap. Slice 4 puts the picks on the page as a card and
  // this goes away with it.
  const showTabStrip = !onePage || activeTab !== 'duels'

  // Swipe navigation for mobile — only swipe between primary tabs
  const allTabKeys = useMemo(() => tabs.map(t => t.key), [tabs])
  // Keep the active pill in view. The strip is one scrollable row at every
  // width now, so on a phone the later tabs (Members, Fees, Settings) start
  // off-screen; landing on one directly — via a deep link or a swipe — would
  // otherwise leave the strip showing a tab you are not on. Mirrors the
  // animated scrollTo in the RN PoolTabBar.
  const tabStripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const strip = tabStripRef.current
    if (!strip) return
    const pill = strip.querySelector<HTMLElement>(`[data-tab-key="${activeTab}"]`)
    if (!pill) return
    const left = pill.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2
    strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [activeTab])

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    const elapsed = Date.now() - touchStartRef.current.time
    touchStartRef.current = null

    // Only trigger on fast, deliberate horizontal swipes
    // Must travel >60px horizontally, be more horizontal than vertical, and complete within 300ms
    if (Math.abs(deltaX) < 60 || Math.abs(deltaY) > Math.abs(deltaX) || elapsed > 300) return

    // Ignore swipes that started on interactive elements (inputs, textareas, selects, scrollable tables)
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable], .overflow-x-auto, .overflow-x-scroll')) return

    // Swipe follows the tab strip, in strip order
    const swipeKeys = allTabKeys
    const currentIndex = swipeKeys.indexOf(activeTab)
    if (currentIndex === -1) return

    const nextIndex = deltaX < 0
      ? Math.min(currentIndex + 1, swipeKeys.length - 1)  // swipe left = next tab
      : Math.max(currentIndex - 1, 0)                       // swipe right = prev tab

    if (nextIndex !== currentIndex) {
      handleTabSwitch(swipeKeys[nextIndex])
    }
  }, [activeTab, allTabKeys, handleTabSwitch])

  const hasBranding = !!(pool.brand_name && (pool.brand_emoji || pool.brand_logo_url) && pool.brand_color)

  /**
   * Pill styling for the tab strips, matching PoolTabBar in the RN app: inactive
   * pills are `mist` with muted text, the active pill is its accent composited at
   * ~12% with that accent as the label colour.
   *
   * This replaced a sliding solid indicator. The app hard-snaps its highlight and
   * tints rather than filling, and a tinted pill also carries onto the branded
   * header, where the solid indicator had to special-case the brand accent.
   */
  const tabPillClass = (isActive: boolean) => {
    if (hasBranding) {
      return isActive
        ? 'bg-white/20 text-white'
        : 'bg-white/10 text-white/60 hover:text-white/85'
    }
    if (isActive) {
      return isAdminTab
        ? 'bg-warning-500/15 text-warning-700'
        : 'bg-primary-600/12 text-primary-700'
    }
    return 'bg-mist text-muted hover:text-ink'
  }
  /**
   * The branded header used to hard-code Dashboard / Pools / Profile in two
   * places, a copy of AppHeader's list frozen at the time it was written. It
   * missed the Admin link a super admin gets everywhere else, so branding a pool
   * quietly removed a capability from the people who need it most.
   *
   * Same shape as AppHeader's navLinks, derived once here.
   */
  // Colour mode was the last control the branded header dropped. It cycles
  // system → light → dark like AppHeader's, but styled white-on-brand: the
  // header paints itself in the customer's colour, so the muted/mist treatment
  // AppHeader uses would be invisible on it.
  const { colorMode, setColorMode } = useTheme()
  const cycleColorMode = () => {
    const next = { system: 'light', light: 'dark', dark: 'system' } as const
    setColorMode(next[colorMode])
  }
  const colorModeIcon =
    colorMode === 'light' ? 'sun.max' : colorMode === 'dark' ? 'moon' : 'desktopcomputer'

  const brandedNavLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/pools', label: 'Pools' },
    { href: '/profile', label: 'Profile' },
    ...(isSuperAdmin ? [{ href: '/admin/super', label: 'Admin' }] : []),
  ]

  const brandLogo = pool.brand_logo_url ? (
    <img src={pool.brand_logo_url} alt={pool.brand_name || ''} className="w-8 h-8 rounded-md object-cover shrink-0" />
  ) : (
    <span className="text-2xl shrink-0">{pool.brand_emoji}</span>
  )

  return (
    <div className="min-h-screen bg-surface-secondary">

      {/* Sticky header + tab bar wrapper */}
      <div
        className={`sticky top-0 z-40 [transform:translateZ(0)] ${
          hasBranding
            ? 'shadow-md'
            : 'bg-surface shadow-sm dark:shadow-none border-b border-neutral-200 dark:border-border-default'
        }`}
        style={hasBranding ? { backgroundColor: pool.brand_color! } : undefined}
      >
        {hasBranding ? (
          /* ── Branded header for partner pools ── */
          <div className="px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
            <div className="flex items-center gap-2.5 min-w-0">
              {brandLogo}
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-white truncate">{pool.pool_name}</h1>
                <p className="text-[11px] font-medium hidden sm:block" style={{ color: 'rgba(255,255,255,0.7)' }}>Powered by SportPool</p>
              </div>
            </div>
            {/* Desktop nav links */}
            <div className="hidden sm:flex items-center gap-4 shrink-0">
              {brandedNavLinks.map((link) => (
                <Link key={link.href} href={link.href} className="text-sm font-medium text-white/50 hover:text-white/80 transition">
                  {link.label}
                </Link>
              ))}
              <button
                onClick={cycleColorMode}
                className="p-2 rounded-control text-white/50 hover:text-white/80 hover:bg-white/10 transition"
                aria-label={`Color mode: ${colorMode}`}
                title={`Theme: ${colorMode}`}
              >
                <Icon name={colorModeIcon} size={16} />
              </button>
              <form action="/auth/signout" method="post">
                <button type="submit" className="text-sm text-white/50 hover:text-white/80 font-medium">Sign Out</button>
              </form>
            </div>

            {/* Mobile hamburger menu */}
            <div className="sm:hidden relative">
              <button
                onClick={() => setBrandedNavOpen(prev => !prev)}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Navigation menu"
              >
                {brandedNavOpen ? (
                  <Icon name="xmark" size={18} weight="semibold" />
                ) : (
                  <Icon name="line.3.horizontal" size={18} weight="semibold" />
                )}
              </button>

              {brandedNavOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl shadow-lg border border-white/10 py-1 z-50 overflow-hidden" style={{ backgroundColor: pool.brand_color! }}>
                  {brandedNavLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                      onClick={() => setBrandedNavOpen(false)}
                    >
                      {link.label}
                    </Link>
                  ))}
                  <button
                    onClick={cycleColorMode}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <Icon name={colorModeIcon} size={15} />
                    <span className="capitalize">{colorMode} theme</span>
                  </button>
                  <div className="my-1 border-t border-white/10" />
                  {/* AppHeader carries these in its menu; the branded copy did not,
                      so a branded pool was the one place with no route to help or
                      the legal pages. */}
                  {[
                    { href: '/faq', label: 'FAQ' },
                    { href: '/contact', label: 'Contact' },
                    { href: '/privacy', label: 'Privacy' },
                    { href: '/terms', label: 'Terms' },
                  ].map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setBrandedNavOpen(false)}
                      className="block px-4 py-2 text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                  <div className="my-1 border-t border-white/10" />
                  <form action="/auth/signout" method="post">
                    <button
                      type="submit"
                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      Sign Out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        ) : onePage ? (
          /* ⚠ ONE-PAGE PUTS THE HEADER INSIDE THE BAND, so nothing renders
             here. The same AppHeader — the same links, the same menu, the same
             sign-out — is handed to DuelsTab and drawn over the gradient with
             `overlay`, which changes its background and nothing else. That is
             what makes the header and the duel one object rather than a bar the
             band scrolls underneath. */
          null
        ) : (
          /* ── Standard SportPool header ── */
          <AppHeader
            sticky={false}
            breadcrumbs={[
              { label: pool.pool_name },
            ]}
            badges={
              <>
                {/* The Badge primitive, not hand-rolled pills. These were
                    `rounded` at 4px with a 10px label, while every other badge
                    in the app is a fully-rounded 11px pill. */}
                <Badge variant={toneToBadgeVariantSolid(poolStatusDisplay(pool).tone)}>
                  {poolStatusDisplay(pool).label}
                </Badge>
                {isAdmin && <Badge variant="outline-gray">Admin</Badge>}
              </>
            }
            isSuperAdmin={isSuperAdmin}
          />
        )}

        {/* Super Admin viewing banner */}
        {isSuperAdminViewing && (
          <div className="bg-warning-500/12 border-b border-warning-500/25">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2">
              <Icon name="exclamationmark.triangle.fill" size={16} weight="semibold" className="text-warning-800 shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-warning-800">
                Viewing as Super Admin — You are not a member of this pool
              </span>
            </div>
          </div>
        )}

        {/* Archived banner — says why the admin tabs are missing, rather than
            leaving an admin to wonder where Settings went. */}
        {isArchived && (
          <div className="bg-mist border-b border-border-default">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2">
              <Icon name="archivebox.fill" size={16} weight="semibold" className="text-muted shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-muted">
                This pool is archived — read only.
                {isAdmin ? ' Restore it from your profile to make changes.' : ''}
              </span>
            </div>
          </div>
        )}

        {/* Tab navigation */}
        <div>
        <div className="relative">
          <div className="max-w-6xl mx-auto px-2 sm:px-6">


            {/* ===== Tab bar — one scrollable strip at every width ===== */}
            {showTabStrip && (
            <div ref={tabStripRef} className="flex relative items-center gap-2 overflow-x-auto scrollbar-hide py-2">
              {USER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  data-tab-key={tab.key}
                  onClick={() => handleTabSwitch(tab.key)}
                  className={`shrink-0 px-4 py-2.5 rounded-pill text-[13px] font-bold whitespace-nowrap transition-colors ${tabPillClass(activeTab === tab.key)}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {tab.label}
                    {tab.key === 'community' && hasUnreadBanter && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-danger-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {banterUnreadCount > 99 ? '99+' : banterUnreadCount}
                      </span>
                    )}
                  </span>
                </button>
              ))}

              {/* Bar landing page link tab */}
              {hasBranding && pool.brand_landing_url && (
                <Link
                  href={pool.brand_landing_url}
                  className="shrink-0 px-4 py-2.5 rounded-pill text-[13px] font-bold whitespace-nowrap transition-colors bg-white/10 text-white/60 hover:text-white/85"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {pool.brand_name}
                    <Icon name="arrow.up.right" size={12} weight="semibold" />
                  </span>
                </Link>
              )}

              {/* canAdmin, not isAdmin — this is the strip that actually renders.
                  The `tabs` array gating admin tabs only ever fed allTabKeys;
                  the strip maps USER_TABS and adminTabs separately, so an
                  archived pool still drew Rounds / Members / Scoring Config /
                  Settings and the divider before them. */}
              {canAdmin && (
                <>
                  <div className="flex items-center px-2">
                    <div className={`h-5 w-px ${hasBranding ? 'bg-white/20' : 'bg-neutral-300'}`} />
                  </div>

                  {adminTabs.map((tab) => (
                    <button
                      key={tab.key}
                      data-tab-key={tab.key}
                      onClick={() => handleTabSwitch(tab.key)}
                      className={`shrink-0 px-4 py-2.5 rounded-pill text-[13px] font-bold whitespace-nowrap transition-colors ${tabPillClass(activeTab === tab.key)}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </>
              )}

            </div>
            )}

          </div>
        </div>
        </div>
      </div>

      {/* Tab content */}
      <main
        /* ⚠ ONE-PAGE HAS NO HORIZONTAL PADDING AND NO TOP PADDING: the band is
           full-bleed and butts against the header. The duel tab's own cards
           below it bring their own. */
        className={`max-w-6xl mx-auto ${onePage ? 'px-0 pt-0 pb-8' : 'px-4 sm:px-6'} ${
          onePage
            ? ''
            : activeTab === 'community'
              ? 'pt-3 sm:py-8 pb-0 sm:pb-8'
              : 'py-6 sm:py-8'
        }`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div key={activeTab} className="tab-transition">
            {/* Tabs built entirely from the pool-wide arrays wait for them rather
                than rendering an empty state that reads as "your picks are gone". */}
            {needsBulk && bulkState !== 'ready' && (
              bulkState === 'error' ? (
                <div className="rounded-xl p-8 text-center bg-surface border border-border-default">
                  <p className="text-neutral-500 dark:text-neutral-400 mb-3">
                    Couldn&apos;t load this tab&apos;s data.
                  </p>
                  <button
                    onClick={() => { setBulkState('idle') }}
                    className="text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              )
            )}
            {(!needsBulk || bulkState === 'ready') && <>
            {activeTab === 'leaderboard' && (
              <LeaderboardTab
                poolId={pool.pool_id}
                members={members}
                bonusScores={bonusScores}
                entryStats={entryStats}
                matchdayMVPData={matchdayMVP}
                matches={matches}
                teams={teams}
                conductData={conductData}
                poolSettings={poolSettings}
                maxEntriesPerUser={pool.max_entries_per_user}
                currentUserId={currentUserId}
                predictionMode={pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker'}
                allBPGroupRankings={allBPGroupRankings}
                allBPThirdPlaceRankings={allBPThirdPlaceRankings}
                allBPKnockoutPicks={allBPKnockoutPicks}
                bpProvisionalScoring={bpProvisionalScoring}
                tournamentAwards={tournamentAwards}
                isLeague={isLeaguePool}
                leagueMode={leagueMode}
                leagueDepth={leagueDepth}
                leagueForm={leagueForm}
                tableView={
                  isTableMode && tableModeData
                    ? {
                        // The same fact as `isLocked` since migration 110 — the
                        // deadline passing is what opens every table. Passed as
                        // its own field because the modal asks a different
                        // question of it than the editing screen does.
                        isRevealed: tableModeData.isRevealed,
                        clubCount: tableModeData.clubs.length,
                        topN: tableModeData.topN,
                        relegationN: tableModeData.relegationN,
                        europaFrom: tableModeData.europaFrom,
                        europaTo: tableModeData.europaTo,
                        conferenceFrom: tableModeData.conferenceFrom,
                        conferenceTo: tableModeData.conferenceTo,
                        prices: tableModeData.prices,
                      }
                    : null
                }
              />
            )}

            {/* Mirrors the strip — ?tab=analytics would otherwise render the
                panel with empty inputs and show a member 0% accuracy and no
                streak, which is the wrongness the block above avoids. */}
            {activeTab === 'analytics' && !isLeaguePool && (
              <AnalyticsTab
                poolId={pool.pool_id}
                matches={matches}
                entryStats={entryStats}
                members={members}
                teams={teams}
                conductData={conductData}
                userEntries={entries}
                currentEntryId={activeEntry?.entry_id || ''}
                predictionMode={pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker'}
                bpGroupRankings={activeBPGroupRankings}
                bpThirdPlaceRankings={activeBPThirdPlaceRankings}
                bpKnockoutPicks={activeBPKnockoutPicks}
                allBPGroupRankings={allBPGroupRankings}
                allBPThirdPlaceRankings={allBPThirdPlaceRankings}
                allBPKnockoutPicks={allBPKnockoutPicks}
                poolCreatedAt={pool.created_at}
              />
            )}

            {/* Table mode's Predictions tab is the table itself. Placed before
                the three fixture-pick branches and gating them below, so a
                Table pool cannot fall through into a matchweek picker for
                fixtures it never predicts. */}
            {activeTab === 'predictions' && isLms && lmsData && (
              <SurvivorTab
                poolId={pool.pool_id}
                round={lmsData.round}
                survivors={lmsData.survivors}
                myPicks={lmsData.myPicks}
                clubs={lmsData.clubs}
                entryNames={lmsData.entryNames}
                entryId={lmsData.entryId}
                currentMatchweek={lmsData.currentMatchweek}
                inPlayMatchweek={lmsData.inPlayMatchweek}
                roundsWon={lmsData.roundsWon}
                fixtures={lmsData.fixtures}
                pickFixtures={lmsData.pickFixtures}
              />
            )}

            {activeTab === 'predictions' && isTableMode && tableModeData && (
              <TablePredictionTab
                poolId={pool.pool_id}
                entryId={tableModeData.entryId}
                clubs={tableModeData.clubs}
                savedOrder={tableSaved.order}
                savedAt={tableSaved.at}
                onSaved={(order, at) => setTableSaved({ order, at })}
                seededOrder={tableModeData.seededOrder}
                breakdown={tableModeData.breakdown}
                lockAt={tableModeData.lockAt}
                topN={tableModeData.topN}
                relegationN={tableModeData.relegationN}
                europaFrom={tableModeData.europaFrom}
                europaTo={tableModeData.europaTo}
                conferenceFrom={tableModeData.conferenceFrom}
                conferenceTo={tableModeData.conferenceTo}
                isLocked={tableModeData.isLocked}
                joinedAfterLock={tableModeData.joinedAfterLock}
                prices={tableModeData.prices}
              />
            )}

            {activeTab === 'predictions' && !isTableMode && !isLms && activeEntry && usesRoundFlow && (
              spectatingEntry ? (
                <ProgressiveSpectatorView
                  ownerName={spectatingEntry.ownerName}
                  entryName={spectatingEntry.entryName}
                  entryId={spectatingEntry.entryId}
                  matches={predictionsMatches}
                  teams={teams}
                  poolId={pool.pool_id}
                  psoEnabled={psoEnabled}
                  existingPredictions={allPredictions
                    .filter(p => p.entry_id === spectatingEntry.entryId)
                    .map(p => ({
                      match_id: p.match_id,
                      predicted_home_score: p.predicted_home_score,
                      predicted_away_score: p.predicted_away_score,
                      predicted_home_pso: p.predicted_home_pso,
                      predicted_away_pso: p.predicted_away_pso,
                      predicted_winner_team_id: p.predicted_winner_team_id,
                      prediction_id: p.prediction_id,
                    }))}
                  roundStates={roundStates}
                  leagueDepth={leagueDepth}
                  onBack={() => setSpectatingEntry(null)}
                />
              ) : (pool.max_entries_per_user > 1 || isPastDeadline) ? (
                // Multi-entry, OR post-lock stop screen for single-entry
                predictionsView.mode === 'list' ? (
                  <>
                  <EntriesListView
                    entries={entries}
                    poolId={pool.pool_id}
                    totalMatches={matches.length}
                    isPastDeadline={isPastDeadline}
                    allPredictions={allPredictions}
                    canAddEntry={canAddEntry}
                    addingEntry={addingEntry}
                    onAddEntry={handleAddEntry}
                    onDeleteEntry={handleDeleteEntryFromList}
                    onRenameEntry={handleRenameEntryFromList}
                    onEditEntry={handleOpenEntryDetail}
                    roundStates={roundStates}
                    allRoundSubmissions={roundSubmissions}
                    liveRoundSubmissions={liveRoundSubmissions}
                    entryFee={pool.entry_fee}
                    entryFeeCurrency={pool.entry_fee_currency}
                  />
                  {isPastDeadline && (
                    <EveryoneElseSection
                      members={members}
                      currentUserId={currentUserId}
                      allPredictions={allPredictions}
                      onSelect={setSpectatingEntry}
                    />
                  )}
                  </>
                ) : loadingPredictions ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                  </div>
                ) : (
                  <div>
                    {/* Back navigation */}
                    <button
                      onClick={handleBackToList}
                      className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium mb-4 transition-colors"
                    >
                      <Icon name="chevron.left" size={16} weight="semibold" />
                      Back to Entries
                    </button>
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-lg font-semibold text-neutral-900">{activeEntry.entry_name}</h3>
                    </div>
                    <ProgressivePredictionsFlow
                      key={activeEntryId}
                      matches={predictionsMatches}
                      teams={teams}
                      entryId={activeEntry.entry_id}
                      poolId={pool.pool_id}
                      existingPredictions={activeEntryPredictions}
                      psoEnabled={psoEnabled}
                      predictionsLocked={predictionsLocked}
                      onUnsavedChangesRef={predictionsRef}
                      onStatusChange={setPredictionStatus}
                      roundStates={roundStates}
                      roundSubmissions={activeRoundSubmissions}
                      leagueDepth={leagueDepth}
                      existingOutcomes={leagueOutcomes}
                    />
                  </div>
                )
              ) : (
                // Single-entry progressive: render directly
                <ProgressivePredictionsFlow
                  key={activeEntryId}
                  matches={predictionsMatches}
                  teams={teams}
                  entryId={activeEntry.entry_id}
                  poolId={pool.pool_id}
                  existingPredictions={activeEntryPredictions}
                  psoEnabled={psoEnabled}
                  predictionsLocked={predictionsLocked}
                  onUnsavedChangesRef={predictionsRef}
                  onStatusChange={setPredictionStatus}
                  roundStates={roundStates}
                  roundSubmissions={activeRoundSubmissions}
                  leagueDepth={leagueDepth}
                  existingOutcomes={leagueOutcomes}
                />
              )
            )}

            {activeTab === 'predictions' && !isTableMode && !isLms && activeEntry && isBracketPicker && (
              spectatingEntry ? (
                <BracketSpectatorView
                  ownerName={spectatingEntry.ownerName}
                  entryName={spectatingEntry.entryName}
                  entryId={spectatingEntry.entryId}
                  poolId={pool.pool_id}
                  teams={teams}
                  matches={predictionsMatches}
                  settings={settings!}
                  predictionDeadline={pool.prediction_deadline}
                  onBack={() => setSpectatingEntry(null)}
                />
              ) : (pool.max_entries_per_user > 1 || isPastDeadline) ? (
                // Multi-entry, OR post-lock stop screen for single-entry
                predictionsView.mode === 'list' ? (
                  <>
                  <EntriesListView
                    entries={entries}
                    poolId={pool.pool_id}
                    totalMatches={bpTotalExpectedPicks}
                    isPastDeadline={isPastDeadline}
                    allPredictions={allPredictions}
                    canAddEntry={canAddEntry}
                    addingEntry={addingEntry}
                    onAddEntry={handleAddEntry}
                    onDeleteEntry={handleDeleteEntryFromList}
                    onRenameEntry={handleRenameEntryFromList}
                    onEditEntry={handleOpenEntryDetail}
                    entryProgressOverride={bpEntryProgressMap}
                    entryFee={pool.entry_fee}
                    entryFeeCurrency={pool.entry_fee_currency}
                  />
                  {isPastDeadline && (
                    <EveryoneElseSection
                      members={members}
                      currentUserId={currentUserId}
                      allPredictions={allPredictions}
                      onSelect={setSpectatingEntry}
                    />
                  )}
                  </>
                ) : loadingPredictions ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                  </div>
                ) : (
                  <div>
                    {/* Back navigation */}
                    <button
                      onClick={handleBackToList}
                      className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium mb-4 transition-colors"
                    >
                      <Icon name="chevron.left" size={16} weight="semibold" />
                      Back to Entries
                    </button>
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-lg font-semibold text-neutral-900">{activeEntry.entry_name}</h3>
                    </div>
                    <BracketPickerFlow
                      key={activeEntryId}
                      poolId={pool.pool_id}
                      entryId={activeEntry.entry_id}
                      teams={teams}
                      matches={predictionsMatches}
                      settings={settings!}
                      predictionDeadline={pool.prediction_deadline}
                      isLocked={activeEntry.predictions_locked}
                      existingGroupRankings={activeBPGroupRankings}
                      existingThirdPlaceRankings={activeBPThirdPlaceRankings}
                      existingKnockoutPicks={activeBPKnockoutPicks}
                      onSaveStatusChange={(status) => setPredictionStatus(prev => ({ ...prev, saveStatus: status }))}
                    />
                  </div>
                )
              ) : (
                // Single-entry bracket picker: render directly
                <BracketPickerFlow
                  key={activeEntryId}
                  poolId={pool.pool_id}
                  entryId={activeEntry.entry_id}
                  teams={teams}
                  matches={predictionsMatches}
                  settings={settings!}
                  predictionDeadline={pool.prediction_deadline}
                  isLocked={activeEntry.predictions_locked}
                  existingGroupRankings={activeBPGroupRankings}
                  existingThirdPlaceRankings={activeBPThirdPlaceRankings}
                  existingKnockoutPicks={activeBPKnockoutPicks}
                  onSaveStatusChange={(status) => setPredictionStatus(prev => ({ ...prev, saveStatus: status }))}
                />
              )
            )}

            {activeTab === 'predictions' && !isTableMode && !isLms && activeEntry && !usesRoundFlow && !isBracketPicker && (
              spectatingEntry ? (
                <SpectatorEntryView
                  ownerName={spectatingEntry.ownerName}
                  entryName={spectatingEntry.entryName}
                  entryId={spectatingEntry.entryId}
                  matches={predictionsMatches}
                  teams={teams}
                  poolId={pool.pool_id}
                  psoEnabled={psoEnabled}
                  existingPredictions={allPredictions
                    .filter(p => p.entry_id === spectatingEntry.entryId)
                    .map(p => ({
                      match_id: p.match_id,
                      predicted_home_score: p.predicted_home_score,
                      predicted_away_score: p.predicted_away_score,
                      predicted_home_pso: p.predicted_home_pso,
                      predicted_away_pso: p.predicted_away_pso,
                      predicted_winner_team_id: p.predicted_winner_team_id,
                      prediction_id: p.prediction_id,
                    }))}
                  onBack={() => setSpectatingEntry(null)}
                />
              ) : (pool.max_entries_per_user > 1 || isPastDeadline) ? (
                // Multi-entry, OR post-lock "stop screen" for single-entry: list + detail
                predictionsView.mode === 'list' ? (
                  <>
                  <EntriesListView
                    entries={entries}
                    poolId={pool.pool_id}
                    totalMatches={matches.length}
                    isPastDeadline={isPastDeadline}
                    allPredictions={allPredictions}
                    canAddEntry={canAddEntry}
                    addingEntry={addingEntry}
                    onAddEntry={handleAddEntry}
                    onDeleteEntry={handleDeleteEntryFromList}
                    onRenameEntry={handleRenameEntryFromList}
                    onEditEntry={handleOpenEntryDetail}
                    entryFee={pool.entry_fee}
                    entryFeeCurrency={pool.entry_fee_currency}
                  />
                  {isPastDeadline && (
                    <EveryoneElseSection
                      members={members}
                      currentUserId={currentUserId}
                      allPredictions={allPredictions}
                      onSelect={setSpectatingEntry}
                    />
                  )}
                  </>
                ) : loadingPredictions ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                  </div>
                ) : (
                  <EntryDetailView
                    entry={entries.find(e => e.entry_id === predictionsView.entryId) || activeEntry}
                    onBack={handleBackToList}
                    matches={predictionsMatches}
                    teams={teams}
                    poolId={pool.pool_id}
                    existingPredictions={activeEntryPredictions}
                    isPastDeadline={isPastDeadline}
                    psoEnabled={psoEnabled}
                    predictionsLocked={predictionsLocked}
                    onUnsavedChangesRef={predictionsRef}
                    onStatusChange={setPredictionStatus}
                  />
                )
              ) : (
                // Single-entry: render PredictionsFlow directly
                <div>
                  <div className="mb-6">
                    {editingEntryName ? (
                      <div className="flex items-center gap-2">
                        <input
                          ref={entryNameInputRef}
                          type="text"
                          value={entryNameDraft}
                          onChange={e => setEntryNameDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameEntry()
                            if (e.key === 'Escape') setEditingEntryName(false)
                          }}
                          className="px-3 py-1.5 border border-primary-300 rounded-xl text-sm font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
                          maxLength={40}
                          placeholder="Entry name..."
                        />
                        <button
                          onClick={handleRenameEntry}
                          disabled={savingEntryName}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 disabled:opacity-50"
                        >
                          {savingEntryName ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingEntryName(false)}
                          className="px-2 py-1.5 text-sm text-neutral-500 hover:text-neutral-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        <span className="text-sm font-semibold text-neutral-900">{activeEntry.entry_name}</span>

                        {!isPastDeadline && !predictionsLocked && (
                          <button
                            onClick={() => {
                              setEntryNameDraft(activeEntry.entry_name)
                              setEditingEntryName(true)
                            }}
                            className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors shrink-0"
                            title="Rename entry"
                          >
                            <Icon name="pencil.line" size={16} weight="semibold" />
                          </button>
                        )}

                        {/* Status badge + save status (right-aligned) */}
                        <div className="ml-auto flex items-center gap-1.5 shrink-0 text-xs">
                          {hasSubmitted ? (
                            <span className="px-1.5 py-0.5 rounded-full font-semibold bg-success-100 text-success-700">Submitted</span>
                          ) : predictionStatus.predictedCount > 0 ? (
                            <span className="px-1.5 py-0.5 rounded-full font-semibold bg-warning-100 text-warning-700">Draft</span>
                          ) : null}
                          <span className="text-neutral-400 whitespace-nowrap" suppressHydrationWarning>
                            {predictionStatus.saveStatus === 'saving' && 'Saving...'}
                            {predictionStatus.saveStatus === 'saved' && '\u2713 Saved'}
                            {predictionStatus.saveStatus === 'error' && <span className="text-danger-600">Failed</span>}
                            {(predictionStatus.saveStatus === 'idle') && predictionStatus.lastSavedAt && !hasSubmitted && `Saved ${formatTimeAgo(predictionStatus.lastSavedAt)}`}
                            {hasSubmitted && submittedAt && formatTimeAgo(submittedAt)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <PredictionsFlow
                    key={activeEntryId}
                    matches={predictionsMatches}
                    teams={teams}
                    entryId={activeEntry.entry_id}
                    poolId={pool.pool_id}
                    existingPredictions={activeEntryPredictions}
                    isPastDeadline={isPastDeadline}
                    psoEnabled={psoEnabled}
                    hasSubmitted={hasSubmitted}
                    submittedAt={submittedAt}
                    lastSavedAt={lastSavedAt}
                    predictionsLocked={predictionsLocked}
                    onUnsavedChangesRef={predictionsRef}
                    onStatusChange={setPredictionStatus}
                  />
                </div>
              )
            )}

            {(onePage || activeTab === 'duels') && isShowdown && showdownData && (
              <DuelsTab
                duels={showdownData.duels}
                entryNames={showdownData.entryNames}
                ownEntryIds={showdownData.ownEntryIds}
                openMatchweek={showdownData.openMatchweek}
                inPlayMatchweek={showdownData.inPlayMatchweek}
                sealedMatchweek={showdownData.sealedMatchweek}
                sealedOpensAtLatest={showdownData.sealedOpensAtLatest}
                entryPeople={showdownData.entryPeople}
                // ⚠ LIVE VALUES WIN, but only the three that move — and the
                // two halves are now independent, because they arrive by
                // different routes. A broadcast can repaint the score without
                // waiting for the points fetch, and the points can land without
                // disturbing a fixture the broadcast already updated. The rest
                // of `showdownData` — names, faces, the draw — is page-load
                // data; re-sending it per goal is the payload mistake this
                // whole path exists to avoid.
                livePoints={duelPoints?.mw === showdownData.inPlayMatchweek
                  ? new Map(Object.entries(duelPoints.points))
                  : showdownData.livePoints}
                perFixture={duelPoints?.mw === showdownData.inPlayMatchweek
                  ? new Map(
                      Object.entries(duelPoints.perFixture).map(([e, byFx]) => [
                        e, new Map(Object.entries(byFx).map(([n, p]) => [Number(n), p])),
                      ]),
                    )
                  : showdownData.perFixture}
                fixtures={showdownData.fixtures.map((f) => {
                  const live = duelFixtures?.mw === showdownData.inPlayMatchweek
                    ? duelFixtures.byNumber[f.number]
                    : undefined
                  // A fixture nothing has said anything about keeps what it had
                  // — never blanked, which would flicker a score to "v".
                  // ⚠ `status` is nullable in the feed but not in
                  // `MatchweekFixture`, so a null must fall back rather than
                  // overwrite: a fixture the provider has not stamped yet would
                  // otherwise lose the status it had.
                  return live ? { ...f, ...live, status: live.status ?? f.status } : f
                })}
                leagueOutcomes={allLeagueOutcomes}
                allPredictions={allPredictions}
                bulkState={bulkState}
                totals={showdownData.totals}
                onGoToPicks={() => handleTabSwitch('predictions')}
                layout={onePage ? 'onepage' : 'tabs'}
                bandHeader={onePage ? (
                  <AppHeader
                    overlay
                    sticky={false}
                    breadcrumbs={[{ label: pool.pool_name }]}
                    isSuperAdmin={isSuperAdmin}
                  />
                ) : null}
                series={showdownData.series}
                form={leagueForm}
                duelPoints={showdownData.duelPoints}
              />
            )}

            {activeTab === 'standings' && isLeaguePool && (
              <LeagueTableTab rows={leagueStandings} fetchedAt={leagueStandingsAt} nextByClub={leagueNextFixture} />
            )}

            {activeTab === 'results' && !isBracketPicker && (
              <ResultsTab
                matches={matches}
                predictions={userPredictionsList}
                poolSettings={poolSettings}
                predictionMode={pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker'}
                teams={teams}
                conductData={conductData}
                userPredictions={userPredictions}
                bonusScores={bonusScores}
                isAdmin={isAdmin}
                members={members}
                allPredictions={allPredictions}
                isLeaguePool={isLeaguePool}
                ownLeagueOutcomes={leagueOutcomes}
                allLeagueOutcomes={allLeagueOutcomes}
                matchScores={activeEntryScores}
                currentEntryId={activeEntry?.entry_id || ''}
                userEntries={entries}
                poolId={pool.pool_id}
              />
            )}

            {activeTab === 'my_bracket' && isBracketPicker && settings && (
              <BracketResultsTab
                matches={matches}
                teams={teams}
                conductData={conductData}
                settings={settings}
                bpGroupRankings={activeBPGroupRankings}
                bpThirdPlaceRankings={activeBPThirdPlaceRankings}
                bpKnockoutPicks={activeBPKnockoutPicks}
                userEntries={entries}
                currentEntryId={activeEntry?.entry_id || ''}
                allBPGroupRankings={allBPGroupRankings}
                allBPThirdPlaceRankings={allBPThirdPlaceRankings}
                allBPKnockoutPicks={allBPKnockoutPicks}
                bpProvisionalScoring={bpProvisionalScoring}
                bonusScores={bonusScores}
              />
            )}

            {/* ⚠ `!isLeaguePool` is load-bearing, not defensive.

                A league pool already renders LeagueTableTab above under this
                same tab key. Ungated, this block rendered UNDERNEATH it: an
                empty "Group Standings — no group stage matches have been
                completed yet", followed by a full Knockout Bracket with R32
                through FINAL, populated with Premier League clubs paired off
                against each other.

                It was not reading stale data — page.tsx substitutes the league
                adapter's output into `matches` and `teams` so the World Cup
                components keep working, so this had all 380 fixtures and all 20
                clubs and drew a tournament tree from a competition that has
                neither groups nor knockouts. "11/380 played" was the giveaway.

                The `standings` key is commented out of USER_TABS_DEFAULT, so a
                World Cup pool cannot reach this today — which is exactly why it
                went unnoticed: the only pools that could open the tab were the
                ones it was wrong for. Gated rather than deleted, because the
                comment on that line says the tab is *temporarily* hidden. */}
            {activeTab === 'standings' && !isLeaguePool && (
              <StandingsTab
                matches={matches}
                teams={teams}
                conductData={conductData}
              />
            )}

            {activeTab === 'pool_info' && (
              <PoolInfoTab
                pool={pool}
                members={members}
                userEntries={entries}
                roundStates={roundStates}
                isPastDeadline={isPastDeadline}
                onLeavePool={isSuperAdminViewing ? undefined : () => setShowLeaveModal(true)}
                leaveDisabledReason={
                  isSoleAdmin ? 'Promote another admin or archive the pool to leave' : null
                }
              />
            )}

            {/* A league is scored by its own engines against its own tables, so
                it gets its own screen rather than the World Cup's with the
                groups and knockouts hidden. See LeagueScoringRulesTab's header:
                the old shared screen did not just show irrelevant cards, it
                quoted a Results-depth member the wrong price. */}
            {activeTab === 'scoring_rules' && (isLeaguePool ? (
              <LeagueScoringRulesTab
                mode={(leagueMode ?? 'pickem') as LeagueScoringMode}
                depth={leagueDepth}
                prices={{
                  exact: settings?.group_exact_score ?? 100,
                  goalDifference: settings?.group_correct_difference ?? 75,
                  result: settings?.group_correct_result ?? 50,
                }}
                table={
                  tableModeData
                    ? {
                        ...tableModeData.prices,
                        topN: tableModeData.topN,
                        relegationN: tableModeData.relegationN,
                        profile: tableModeData.profile,
                      }
                    : null
                }
                clubCount={lmsData?.clubs.length ?? null}
              />
            ) : (
              <ScoringRulesTab settings={settings} predictionMode={pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker'} />
            ))}

            {activeTab === 'community' && (
              <CommunityTab
                poolId={pool.pool_id}
                poolName={pool.pool_name}
                currentUserId={currentUserId}
                members={members}
                isAdmin={isAdmin}
                matches={matches}
                teams={teams}
                allPredictions={allPredictions}
                entryStats={entryStats}
                matchAccuracy={matchAccuracy}
                userEntries={userEntries}
                settings={settings!}
                conductData={conductData}
                predictionMode={pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker'}
                matchScores={matchScores}
                onShowHowToPlay={() => setShowHowToPlayModal(true)}
                allBPGroupRankings={allBPGroupRankings}
                allBPThirdPlaceRankings={allBPThirdPlaceRankings}
                allBPKnockoutPicks={allBPKnockoutPicks}
                poolCreatedAt={pool.created_at}
                initialLastReadAt={banterInitialLastReadAt}
              />
            )}

            {/* Admin tabs */}
            {activeTab === 'members' && canAdmin && (
              <MembersTab
                pool={pool}
                members={members}
                setMembers={setMembers}
                predictions={allPredictions}
                matches={matches}
                teams={teams}
                currentUserId={currentUserId}
                computedEntryTotals={computedEntryTotals}
              />
            )}

            {activeTab === 'fees' && canAdmin && pool.entry_fee && (
              <FeesTab
                pool={pool}
                members={members}
                setMembers={setMembers}
                currentUserId={currentUserId}
              />
            )}

            {/* Mirrors the strip. Hiding the button alone leaves
                ?tab=scoring_config rendering the full editable form — the
                archived-pool lesson, and here it would be an editable form
                whose live sliders are mislabelled. */}
            {activeTab === 'scoring_config' && canAdmin && !isLeaguePool && (
              <ScoringTab
                pool={pool}
                settings={settings}
                setSettings={setSettings}
                matches={matches}
                members={members}
                setMembers={setMembers}
              />
            )}

            {activeTab === 'settings' && canAdmin && (
              <SettingsTab
                pool={pool}
                setPool={setPool}
                members={members}
                currentUserId={currentUserId}
                onDirtyChange={(dirty) => { settingsDirtyRef.current = dirty }}
              />
            )}

            {/* `!isLeaguePool` mirrors the strip above. Hiding the button is not
                enough: ?tab=rounds, or tab state left over from another pool,
                still renders the panel — that is exactly how an archived pool
                kept showing its editable admin forms. */}
            {activeTab === 'rounds' && canAdmin && usesRoundFlow && !isLeaguePool && (
              <RoundsTab
                poolId={pool.pool_id}
                roundStates={roundStates}
              />
            )}
            </>}
        </div>
      </main>

      {/* Navigation Warning Modal */}
      {showNavWarning && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={handleCancelNav} />
          <div className="relative bg-surface sm:rounded-2xl rounded-t-2xl shadow-xl sm:max-w-sm w-full p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Unsaved Changes</h3>
            <p className="text-sm text-neutral-600 mb-5">
              You have unsaved changes. What would you like to do?
            </p>
            <div className="flex flex-col gap-2">
              {activeTab === 'predictions' && (
                <Button variant="primary" onClick={handleSaveAndLeave} fullWidth>
                  Save &amp; Leave
                </Button>
              )}
              <Button variant="outline" onClick={handleLeaveWithoutSaving} fullWidth>
                Leave Without Saving
              </Button>
              <Button variant="gray" onClick={handleCancelNav} fullWidth>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Entry Confirmation Modal */}
      {showDeleteEntryModal && activeEntry && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-modal-backdrop"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => { if (!deletingEntry) setShowDeleteEntryModal(false) }}
          />
          <div className="relative bg-surface sm:rounded-2xl rounded-t-2xl shadow-xl sm:max-w-sm w-full p-6 dark:shadow-none dark:border dark:border-border-default animate-modal-slide-up">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Delete Entry</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Are you sure you want to delete <span className="font-semibold text-neutral-900">{activeEntry.entry_name}</span>?
            </p>
            <Alert variant="error" className="mb-5">
              All predictions for this entry will be permanently deleted. This cannot be undone.
            </Alert>
            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setShowDeleteEntryModal(false)}
                disabled={deletingEntry}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteEntry}
                loading={deletingEntry}
                loadingText="Deleting..."
              >
                Delete Entry
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Pool Confirmation Modal */}
      {showHowToPlayModal && (
        <HowToPlayModal
          poolName={pool.pool_name}
          maxEntries={pool.max_entries_per_user}
          isPastDeadline={isPastDeadline}
          predictionMode={pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker'}
          leagueMode={isLeaguePool ? (leagueMode as LeagueMode | null) : null}
          leagueDepth={leagueDepth}
          onClose={() => setShowHowToPlayModal(false)}
        />
      )}

      {showLeaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-modal-backdrop"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => { if (!leaving) setShowLeaveModal(false) }}
          />
          <div className="relative bg-surface sm:rounded-2xl rounded-t-2xl shadow-xl sm:max-w-sm w-full p-6 dark:shadow-none dark:border dark:border-border-default animate-modal-slide-up">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Leave Pool</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Are you sure you want to leave <span className="font-semibold text-neutral-900">{pool.pool_name}</span>?
            </p>
            <Alert variant="error" className="mb-5">
              <ul className="space-y-1">
                <li>&#8226; Your predictions will be permanently deleted</li>
                <li>&#8226; Your scores and ranking will be removed</li>
                <li>&#8226; You will need a pool code to rejoin</li>
              </ul>
            </Alert>
            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setShowLeaveModal(false)}
                disabled={leaving}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleLeavePool}
                loading={leaving}
                loadingText="Leaving..."
              >
                Leave Pool
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ⚠ WRITE ON DISMISS, NOT ON OPEN. The how-to-play effect above marks
          itself seen the moment it mounts, which is right when the modal IS the
          page. Here it would mean a member who closes the tab mid-animation has
          "seen" a result they never read. */}
      <DuelRecapSheet
        recap={recapDismissed ? null : duelRecap}
        reviewHref={duelRecap ? `/pools/${pool.pool_id}/duel/${duelRecap.matchweek}` : '#'}
        onDismiss={dismissRecap}
      />
    </div>
  )
}
