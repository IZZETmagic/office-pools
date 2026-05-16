// Push notification categories. Each push fan-out passes a category so the
// dispatcher can suppress sends to users who opted out of that category.
//
// Categories mirror the email Resend topics (lib/email/topics.ts) so the UX
// can group them together in the Profile screen — except GAMIFICATION, which
// is push-only (no equivalent email blast for badges / level-ups / streaks).
//
// Stored as boolean columns in the `push_notification_preferences` table.
// Default for all is `true` so newly-registered users receive every push
// until they explicitly opt out.

export const PUSH_CATEGORIES = [
  'POOL_ACTIVITY',
  'PREDICTIONS',
  'MATCH_RESULTS',
  'LEADERBOARD',
  'ADMIN',
  'COMMUNITY',
  'GAMIFICATION',
] as const

export type PushCategory = (typeof PUSH_CATEGORIES)[number]

/** Map from API enum to the snake_case column name in push_notification_preferences. */
export const PUSH_CATEGORY_COLUMNS: Record<PushCategory, string> = {
  POOL_ACTIVITY: 'pool_activity',
  PREDICTIONS: 'predictions',
  MATCH_RESULTS: 'match_results',
  LEADERBOARD: 'leaderboard',
  ADMIN: 'admin',
  COMMUNITY: 'community',
  GAMIFICATION: 'gamification',
}

export const PUSH_CATEGORY_LABELS: Record<
  PushCategory,
  { name: string; description: string }
> = {
  POOL_ACTIVITY: {
    name: 'Pool Activity',
    description: 'Join/leave a pool, invitations, pool updates',
  },
  PREDICTIONS: {
    name: 'Predictions',
    description: 'Deadline reminders, submission confirmations',
  },
  MATCH_RESULTS: {
    name: 'Match Results',
    description: 'Per-match outcomes and matchday recaps',
  },
  LEADERBOARD: {
    name: 'Leaderboard',
    description: 'Rank changes and leaderboard shake-ups',
  },
  ADMIN: {
    name: 'Admin Alerts',
    description: 'Settings changed, points adjusted, member actions',
  },
  COMMUNITY: {
    name: 'Community',
    description: '@mentions and pool chat messages',
  },
  GAMIFICATION: {
    name: 'Achievements',
    description: 'Badges, level-ups, streaks, matchday MVP',
  },
}
