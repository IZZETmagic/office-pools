// =============================================================
// The notification registry — its copy in code (N2, 2026-10-05)
// =============================================================
// public.notification_types (migration 170) IS the registry: one row per kind
// of notification, each carrying the one-sentence account of how it works that
// the disclosure gate asks for. This file is its copy in code, for what code
// needs without a database round trip: which switch a kind belongs to, and
// whether it is live.
//
// ⚠ A COPY, CHECKED. registry.guard.test.ts fails unless this lists exactly the
// kinds the migrations seed, with the same category and status. So a kind
// added here fails the build until a migration gives it a sentence — the gate,
// enforced. The sentences themselves live only in the database; the
// preferences screens read them from there.
//
// ⚠ A SEND GATE (N4, 2026-10-07): sendPushToUser and the email transport take a
// kind from this list — nothing else — and refuse one that is not live, so
// every message has a switch (or is marked always delivered) and a sentence.
//
// The ORDER below is the order members read them in, under each switch.
// =============================================================

import type { PushCategory } from '@/lib/push/categories'

/**
 * The switches — the same eight as notification_preferences. Seven are shared by
 * every channel; NEWS (migration 179, "News from SportPool") is email only: push
 * preferences have no column for it, and the database refuses a NEWS kind with push.
 */
export type NotificationCategory = PushCategory | 'NEWS'

/** How the registry scopes a notice: by game mode, never by competition. */
export const GAME_MODES = [
  'full_tournament',
  'progressive',
  'bracket_picker',
  'pickem',
  'showdown',
  'last_man_standing',
  'table',
] as const

export type GameMode = (typeof GAME_MODES)[number]

export type NotificationStatus = 'live' | 'planned' | 'retired'

type Spec = {
  category: NotificationCategory
  status: NotificationStatus
  /** Always delivered: no switch governs it (is_transactional in the database). */
  transactional?: true
  /**
   * Its name in the preferences screens, above its sentence (Ryan, 2026-10-07:
   * the lists read as a wall of sentences). A label only — the sentence in the
   * database stays the account of how it works. Every kind a switch controls
   * has one; registry.test.ts holds that.
   */
  title?: string
}

export const NOTIFICATION_TYPES = {
  // League — pick'em and Showdown
  matchweek_opened: { category: 'PREDICTIONS', status: 'live', title: 'New matchweek' },
  lock_reminder: { category: 'PREDICTIONS', status: 'live', title: 'Pick reminder' },
  matchweek_completed: { category: 'MATCH_RESULTS', status: 'live', title: 'Matchweek results' },
  // League — Last Man Standing (migration 174)
  lms_pick_open: { category: 'PREDICTIONS', status: 'live', title: 'Last Man Standing pick' },
  lms_pick_reminder: { category: 'PREDICTIONS', status: 'live', title: 'Last Man Standing reminder' },
  // Pool countdowns (migration 175)
  pool_countdown: { category: 'PREDICTIONS', status: 'live', title: 'Pool starting soon' },
  pool_countdown_admin: { category: 'POOL_ACTIVITY', status: 'live', title: 'Pool needs players' },
  // League — Table
  table_deadline: { category: 'PREDICTIONS', status: 'live', title: 'Season table reminder' },
  table_deadline_moved: { category: 'PREDICTIONS', status: 'live', title: 'Table deadline moved' },
  // Tournaments — before the deadline
  deadline_warning: { category: 'PREDICTIONS', status: 'live', title: 'Deadline reminders' },
  predict_reminder: { category: 'PREDICTIONS', status: 'live', title: 'Daily reminder' },
  match_starting: { category: 'PREDICTIONS', status: 'live', title: 'Kickoff soon' },
  round_open: { category: 'PREDICTIONS', status: 'live', title: 'New round' },
  deadline_changed: { category: 'ADMIN', status: 'live', title: 'Deadline changed' },
  // Tournaments — submitting
  predictions_submitted: { category: 'PREDICTIONS', status: 'live', title: 'Predictions confirmed' },
  round_submitted: { category: 'PREDICTIONS', status: 'live', title: 'Round confirmed' },
  predictions_auto_submitted: { category: 'PREDICTIONS', status: 'live', title: 'Submitted for you' },
  round_auto_submitted: { category: 'PREDICTIONS', status: 'live', title: 'Round submitted for you' },
  predictions_unlocked: { category: 'ADMIN', status: 'live', title: 'Predictions unlocked' },
  // Tournaments — results and achievements
  prediction_result: { category: 'MATCH_RESULTS', status: 'live', title: 'Match result' },
  matchday_recap: { category: 'MATCH_RESULTS', status: 'live', title: 'Matchday recap' },
  weekly_recap: { category: 'MATCH_RESULTS', status: 'live', title: 'Weekly recap' },
  matchday_mvp: { category: 'GAMIFICATION', status: 'live', title: 'Matchday MVP' },
  streak_milestone: { category: 'GAMIFICATION', status: 'live', title: 'Streaks' },
  badge_unlocked: { category: 'GAMIFICATION', status: 'live', title: 'Badge earned' },
  level_up: { category: 'GAMIFICATION', status: 'live', title: 'Level up' },
  // Any pool
  pool_welcome: { category: 'POOL_ACTIVITY', status: 'live', title: 'Welcome to a pool' },
  member_joined: { category: 'POOL_ACTIVITY', status: 'live', title: 'New member' },
  member_removed: { category: 'ADMIN', status: 'live', title: 'Removed from a pool' },
  points_adjusted: { category: 'ADMIN', status: 'live', title: 'Points adjusted' },
  pool_archived: { category: 'ADMIN', status: 'live', title: 'Pool archived' },
  pool_restored: { category: 'ADMIN', status: 'live', title: 'Pool restored' },
  chat_message: { category: 'COMMUNITY', status: 'live', title: 'Chat messages' },
  chat_mention: { category: 'COMMUNITY', status: 'live', title: '@mentions' },
  // Crews
  crew_invite: { category: 'POOL_ACTIVITY', status: 'live', title: 'Crew invite' },
  crew_invite_email: { category: 'POOL_ACTIVITY', status: 'live', transactional: true },
  crew_seat_saved: { category: 'POOL_ACTIVITY', status: 'live', title: 'Spot saved' },
  crew_seat_reminder: { category: 'POOL_ACTIVITY', status: 'live', title: 'Saved spot reminder' },
  // Our own emails (migration 179). A reply or one-off email to one person is
  // always delivered; the rest sit under a switch like everything else.
  direct_email: { category: 'ADMIN', status: 'live', transactional: true },
  // Terms and Privacy updates (migration 180) — always delivered, as a Broadcast without the News topic.
  policy_update: { category: 'ADMIN', status: 'live', transactional: true },
  pool_size_nudge: { category: 'POOL_ACTIVITY', status: 'live', title: 'Ideas for your pool' },
  predictions_reminder: { category: 'PREDICTIONS', status: 'live', title: 'Prediction reminder' },
  sportpool_news: { category: 'NEWS', status: 'live', title: 'News from SportPool' },
  // Planned — N7. Written down so they pass the gate while being designed.
  duel_drawn: { category: 'POOL_ACTIVITY', status: 'planned' },
  duel_reveal_ready: { category: 'POOL_ACTIVITY', status: 'planned' },
  duel_result: { category: 'MATCH_RESULTS', status: 'planned' },
  lms_eliminated: { category: 'MATCH_RESULTS', status: 'planned' },
  lms_survived: { category: 'MATCH_RESULTS', status: 'planned' },
  table_locked: { category: 'PREDICTIONS', status: 'planned' },
} as const satisfies Record<string, Spec>

export type NotificationTypeKey = keyof typeof NOTIFICATION_TYPES

/**
 * A pool's game mode, as the registry scopes notices: the league mode for a
 * league pool, the prediction mode for a tournament pool. A league pool with
 * no league_mode set has none — and today the league notices skip it too.
 */
export function poolGameMode(pool: { prediction_mode: string | null; league_mode: string | null }): GameMode | null {
  const mode = pool.league_mode ?? pool.prediction_mode
  return mode !== null && (GAME_MODES as readonly string[]).includes(mode) ? (mode as GameMode) : null
}

/** A registry row as the database returns it. */
export type RegistryRow = {
  type_key: string
  category: string
  modes: string[] | null
  channels: string[]
  is_transactional: boolean
  status: string
  disclosure_sentence: string
}

/**
 * One notice a member's switches control, as the preferences screens show it.
 * `title` is null only for a kind the database has and this file does not yet.
 */
export type MemberNotice = { key: string; category: string; channels: string[]; title: string | null; sentence: string }

/**
 * What a member's switches actually control, in reading order: live kinds
 * only, never a transactional one (no switch governs it), and only those tied
 * to no mode or to a mode the member plays — so a Premier League pick'em
 * player is not shown World Cup level-ups.
 */
export function noticesForMember(rows: RegistryRow[], modes: ReadonlySet<GameMode>): MemberNotice[] {
  const keys = Object.keys(NOTIFICATION_TYPES)
  const order = new Map(keys.map((k, i) => [k, i]))
  const rank = (k: string) => order.get(k) ?? keys.length
  return rows
    .filter((r) => r.status === 'live' && !r.is_transactional)
    .filter((r) => r.modes === null || r.modes.some((m) => modes.has(m as GameMode)))
    .sort((a, b) => rank(a.type_key) - rank(b.type_key))
    .map((r) => ({
      key: r.type_key,
      category: r.category,
      channels: r.channels,
      title: (NOTIFICATION_TYPES as Record<string, Spec>)[r.type_key]?.title ?? null,
      sentence: r.disclosure_sentence,
    }))
}
