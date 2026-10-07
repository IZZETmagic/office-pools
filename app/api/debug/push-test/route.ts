import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'
import { sendPushToUser } from '@/lib/push/apns'
import type { NotificationTypeKey } from '@/lib/notifications/registry'

// =============================================================
// POST /api/debug/push-test
//
// Super-admin-only endpoint that fires sample versions of every push
// type to the *caller's* device tokens, so you can preview the on-device
// look without waiting for real matches/deadlines/etc.
//
// Body: { type?: string }   — omit or pass "all" to fire one of every
//                              sample with a 600ms delay between them
//                              so iOS renders them as separate banners.
//
// All sends go through sendPushToUser, naming the real kind each sample
// imitates, so that kind's switch still applies (switch it back ON in Profile
// if you don't see something).
// =============================================================

type Sample = {
  key: string
  /** The registry kind this sample imitates — its switch applies. */
  kind: NotificationTypeKey
  title: string
  body: string
  data: Record<string, string>
}

const SAMPLES: Sample[] = [
  // --- MATCH_RESULTS ---
  {
    key: 'prediction_result',
    kind: 'prediction_result',
    title: 'Brazil 2 - 1 Argentina',
    body: 'Main · WC Office · Exact · +5 pts',
    data: { type: 'match_result', match_id: 'sample', pool_id: 'sample', entry_id: 'sample' },
  },
  {
    key: 'matchday_recap',
    kind: 'matchday_recap',
    title: '📅 Matchday recap — Sun, Jun 14',
    body: '3 matches · +12 pts · 1 exact · 2 winner · Main · WC Office',
    data: { type: 'matchday_recap', pool_id: 'sample', matchday: '2026-06-14' },
  },
  {
    key: 'weekly_recap',
    kind: 'weekly_recap',
    title: 'Your week in predictions',
    body: '14 matches · +85 pts · 3 exact · 4 winner+GD · 7 winner',
    data: { type: 'weekly_recap', week_starting: '2026-06-08' },
  },

  // --- GAMIFICATION ---
  {
    key: 'matchday_mvp',
    kind: 'matchday_mvp',
    title: "🏆 You're MVP for Match 12",
    body: '+5 pts · top scorer in WC Office',
    data: { type: 'gamification', sub: 'mvp', match_id: 'sample', pool_id: 'sample' },
  },
  {
    key: 'matchday_mvp_tied',
    kind: 'matchday_mvp',
    title: "🏆 You're co-MVP for Match 12",
    body: '+5 pts · tied for top in WC Office',
    data: { type: 'gamification', sub: 'mvp', match_id: 'sample', pool_id: 'sample', tied: 'true' },
  },
  {
    key: 'streak_hot',
    kind: 'streak_milestone',
    title: '🔥 5-match hot streak!',
    body: 'Main · WC Office',
    data: { type: 'gamification', sub: 'streak', pool_id: 'sample', streak_type: 'hot', streak_length: '5' },
  },
  {
    key: 'streak_cold',
    kind: 'streak_milestone',
    title: '🧊 3-match cold streak!',
    body: 'Main · WC Office',
    data: { type: 'gamification', sub: 'streak', pool_id: 'sample', streak_type: 'cold', streak_length: '3' },
  },

  // Badges — one preview per badge so you can review the unlock copy.
  {
    key: 'badge_sharpshooter',
    kind: 'badge_unlocked',
    title: '🎯 Sharpshooter unlocked!',
    body: 'Score 2 exact predictions · +50 XP · Main · WC Office',
    data: { type: 'gamification', sub: 'badge', badge_id: 'sharpshooter', pool_id: 'sample' },
  },
  {
    key: 'badge_oracle',
    kind: 'badge_unlocked',
    title: '🔮 Oracle unlocked!',
    body: '3 consecutive correct results · +75 XP · Main · WC Office',
    data: { type: 'gamification', sub: 'badge', badge_id: 'oracle', pool_id: 'sample' },
  },
  {
    key: 'badge_ice_breaker',
    kind: 'badge_unlocked',
    title: '🧊 Ice Breaker unlocked!',
    body: 'End a cold streak of 5+ misses · +40 XP · Main · WC Office',
    data: { type: 'gamification', sub: 'badge', badge_id: 'ice_breaker', pool_id: 'sample' },
  },
  {
    key: 'badge_on_fire',
    kind: 'badge_unlocked',
    title: '🔥 On Fire unlocked!',
    body: 'Hit a 5-match correct streak · +80 XP · Main · WC Office',
    data: { type: 'gamification', sub: 'badge', badge_id: 'on_fire', pool_id: 'sample' },
  },
  {
    key: 'badge_top_dog',
    kind: 'badge_unlocked',
    title: '👑 Top Dog unlocked!',
    body: 'Reach #1 on the leaderboard · +100 XP · Main · WC Office',
    data: { type: 'gamification', sub: 'badge', badge_id: 'top_dog', pool_id: 'sample' },
  },
  {
    key: 'badge_globe_trotter',
    kind: 'badge_unlocked',
    title: '🌍 Globe Trotter unlocked!',
    body: 'Predict all 12 groups with 50%+ accuracy · +75 XP · Main · WC Office',
    data: { type: 'gamification', sub: 'badge', badge_id: 'globe_trotter', pool_id: 'sample' },
  },
  {
    key: 'badge_lightning_rod',
    kind: 'badge_unlocked',
    title: '⚡ Lightning Rod unlocked!',
    body: 'Submit all predictions before deadline · +50 XP · Main · WC Office',
    data: { type: 'gamification', sub: 'badge', badge_id: 'lightning_rod', pool_id: 'sample' },
  },
  {
    key: 'badge_stadium_regular',
    kind: 'badge_unlocked',
    title: '🏟️ Stadium Regular unlocked!',
    body: 'Predict all 104 matches · +60 XP · Main · WC Office',
    data: { type: 'gamification', sub: 'badge', badge_id: 'stadium_regular', pool_id: 'sample' },
  },
  {
    key: 'badge_showtime',
    kind: 'badge_unlocked',
    title: '🎪 Showtime unlocked!',
    body: 'Correct exact score in a knockout match · +80 XP · Main · WC Office',
    data: { type: 'gamification', sub: 'badge', badge_id: 'showtime', pool_id: 'sample' },
  },
  {
    key: 'badge_grand_finale',
    kind: 'badge_unlocked',
    title: '🏆 Grand Finale unlocked!',
    body: 'Correctly predict the World Cup Final result · +120 XP · Main · WC Office',
    data: { type: 'gamification', sub: 'badge', badge_id: 'grand_finale', pool_id: 'sample' },
  },
  {
    key: 'level_up',
    kind: 'level_up',
    title: '⭐ Level 6 reached!',
    body: 'Tactician · Main · WC Office',
    data: { type: 'gamification', sub: 'level_up', level: '6', pool_id: 'sample' },
  },

  // --- PREDICTIONS ---
  {
    key: 'deadline_24h',
    kind: 'deadline_warning',
    title: 'Predictions lock in 18h',
    body: 'Lock in your picks for WC Office before the window closes.',
    data: { type: 'deadline_warning', pool_id: 'sample', window_hours: '24' },
  },
  {
    key: 'deadline_6h',
    kind: 'deadline_warning',
    title: 'Predictions lock in 4h',
    body: 'Lock in your picks for WC Office before the window closes.',
    data: { type: 'deadline_warning', pool_id: 'sample', window_hours: '6' },
  },
  {
    key: 'deadline_1h',
    kind: 'deadline_warning',
    title: 'Predictions lock in 30m',
    body: 'Lock in your picks for WC Office before the window closes.',
    data: { type: 'deadline_warning', pool_id: 'sample', window_hours: '1' },
  },
  {
    key: 'match_starting',
    kind: 'match_starting',
    title: 'Brazil vs Argentina kicks off in ~1h',
    body: 'Match 12',
    data: { type: 'match_starting', match_id: 'sample' },
  },
  {
    key: 'predict_reminder',
    kind: 'predict_reminder',
    title: 'Make your picks for WC Office',
    body: "Predictions lock in 6h — don't miss out",
    data: { type: 'predict_reminder', pool_id: 'sample' },
  },
  {
    key: 'deadline_changed',
    kind: 'deadline_changed',
    title: 'Deadline Changed',
    body: 'WC Office: new deadline is Sunday, June 14 at 3:00 PM',
    data: { type: 'admin', pool_id: 'sample' },
  },
  {
    key: 'auto_submit',
    kind: 'predictions_auto_submitted',
    title: 'Predictions Auto-Submitted',
    body: 'Your draft predictions for WC Office were submitted before the deadline.',
    data: { type: 'predictions', pool_id: 'sample' },
  },

  // --- COMMUNITY ---
  {
    key: 'mention',
    kind: 'chat_mention',
    title: 'Mike mentioned you',
    body: 'in WC Office: "hey @ryan did you see brazil\'s score?"',
    data: { type: 'community', pool_id: 'sample' },
  },
  {
    key: 'message',
    kind: 'chat_message',
    title: 'Mike in WC Office',
    body: 'Brazil with the equalizer!',
    data: { type: 'community', pool_id: 'sample' },
  },

  // --- POOL_ACTIVITY ---
  {
    key: 'pool_joined_welcome',
    kind: 'pool_welcome',
    title: 'Welcome to WC Office!',
    body: "You've joined the pool. Make your predictions!",
    data: { type: 'pool_activity', pool_id: 'sample' },
  },
  {
    key: 'pool_joined_admin',
    kind: 'member_joined',
    title: 'Sarah joined WC Office',
    body: 'A new member just joined your pool',
    data: { type: 'pool_activity', sub: 'member_joined', pool_id: 'sample' },
  },

  // --- ADMIN ---
  {
    key: 'points_adjusted',
    kind: 'points_adjusted',
    title: 'Points Adjusted (+5)',
    body: 'WC Office: bonus for early submission',
    data: { type: 'admin', pool_id: 'sample' },
  },
  {
    key: 'member_removed',
    kind: 'member_removed',
    title: 'Removed from Pool',
    body: "You've been removed from WC Office",
    data: { type: 'admin', pool_id: 'sample' },
  },
]

async function handle(request: NextRequest) {
  // Two auth paths:
  //  1. Super-admin session (default) — sends to the caller's own tokens.
  //  2. Cron Bearer secret + body.target_user_id — lets ops trigger a push
  //     for any user via Supabase MCP / pg_net without needing a user
  //     session token. Same secret used by the cron jobs.
  let body: { type?: string; target_user_id?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* empty body is fine — defaults to "all" */
  }

  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`

  let targetUserId: string
  if (isCron && body.target_user_id) {
    targetUserId = body.target_user_id
  } else {
    const auth = await requireSuperAdmin()
    if (auth.error) return auth.error
    targetUserId = auth.data.userData.user_id
  }

  const requested = body.type && body.type !== 'all' ? body.type : null

  const toSend = requested ? SAMPLES.filter((s) => s.key === requested) : SAMPLES
  if (toSend.length === 0) {
    return NextResponse.json(
      {
        error: `Unknown type "${requested}"`,
        available: SAMPLES.map((s) => s.key),
      },
      { status: 400 },
    )
  }

  const results: Array<{ key: string; sent: number; total: number; suppressed?: boolean }> = []
  for (const sample of toSend) {
    try {
      const r = await sendPushToUser(
        targetUserId,
        { title: sample.title, body: sample.body, data: sample.data },
        sample.kind,
      )
      results.push({
        key: sample.key,
        sent: r.sent,
        total: r.total,
        suppressed: r.total === 0,
      })
    } catch (err) {
      results.push({ key: sample.key, sent: 0, total: 0, suppressed: false })
      console.error('[push-test] failed', sample.key, err)
    }
    // Tiny delay so iOS renders distinct banners rather than collapsing
    // them. Kept short (300ms) so the whole "fire one of each" run stays
    // under Vercel's serverless timeout even on the Hobby plan.
    if (toSend.length > 1) await new Promise((r) => setTimeout(r, 300))
  }

  return NextResponse.json({
    ok: true,
    user_id: targetUserId,
    auth: isCron ? 'cron' : 'super_admin',
    requested: requested ?? 'all',
    results,
    note: 'Each sample is filtered by its kind\'s switch. If sent=0 and total=0, the user either has no registered token for that bundle, or switched that kind\'s switch off in Profile.',
  })
}

export const POST = withPerfLogging('/api/debug/push-test', handle)
