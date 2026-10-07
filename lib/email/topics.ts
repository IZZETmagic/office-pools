export const TOPICS = {
  POOL_ACTIVITY: process.env.RESEND_TOPIC_POOL_ACTIVITY!,
  PREDICTIONS: process.env.RESEND_TOPIC_PREDICTIONS!,
  MATCH_RESULTS: process.env.RESEND_TOPIC_MATCH_RESULTS!,
  LEADERBOARD: process.env.RESEND_TOPIC_LEADERBOARD!,
  ADMIN: process.env.RESEND_TOPIC_ADMIN!,
  COMMUNITY: process.env.RESEND_TOPIC_COMMUNITY!,
  // News from SportPool (migration 179, 2026-10-07). Email only.
  NEWS: process.env.RESEND_TOPIC_NEWS!,
} as const

export const TOPIC_KEYS = [
  'POOL_ACTIVITY',
  'PREDICTIONS',
  'MATCH_RESULTS',
  'LEADERBOARD',
  'ADMIN',
  'COMMUNITY',
  'NEWS',
] as const

export type TopicKey = (typeof TOPIC_KEYS)[number]

export const TOPIC_LABELS: Record<TopicKey, { name: string; description: string }> = {
  POOL_ACTIVITY: {
    name: 'Pool Activity',
    description: 'Join/leave pool, invitations, pool updates',
  },
  PREDICTIONS: {
    name: 'Predictions',
    description: 'Deadline reminders, submission confirmations',
  },
  MATCH_RESULTS: {
    name: 'Match Results',
    description: 'Match results and points earned',
  },
  LEADERBOARD: {
    name: 'Leaderboard Updates',
    description: 'Rank changes, weekly standings recaps',
  },
  ADMIN: {
    name: 'Admin Notifications',
    description: 'Settings changed, member removed, predictions unlocked',
  },
  COMMUNITY: {
    name: 'Community & Mentions',
    description: 'When someone @mentions you in a pool chat',
  },
  NEWS: {
    name: 'News from SportPool',
    description: 'What\'s new, short surveys, starting a pool of your own',
  },
}
