import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { withPerfLogging } from '@/lib/api-perf'
import { sendPushToUser } from '@/lib/push/apns'
import { type PushCategory } from '@/lib/push/categories'

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
// All sends go through sendPushToUser so the per-category opt-out filter
// still applies (toggle the relevant category back ON in Profile if you
// don't see something).
// =============================================================

type Sample = {
  key: string
  category: PushCategory
  title: string
  body: string
  data: Record<string, string>
}

const SAMPLES: Sample[] = [
  // --- MATCH_RESULTS ---
  {
    key: 'prediction_result',
    category: 'MATCH_RESULTS',
    title: 'Brazil 2 - 1 Argentina',
    body: 'Exact · +5 pts · WC Office',
    data: { type: 'match_result', match_id: 'sample', pool_id: 'sample' },
  },
  {
    key: 'matchday_recap',
    category: 'MATCH_RESULTS',
    title: '📅 Matchday recap — Sun, Jun 14',
    body: '3 matches · +12 pts · 1 exact · 2 winner · Main · WC Office',
    data: { type: 'matchday_recap', pool_id: 'sample', matchday: '2026-06-14' },
  },
  {
    key: 'weekly_recap',
    category: 'MATCH_RESULTS',
    title: 'Your week in predictions',
    body: '14 matches · +85 pts · 3 exact · 4 winner+GD · 7 winner',
    data: { type: 'weekly_recap', week_starting: '2026-06-08' },
  },

  // --- GAMIFICATION ---
  {
    key: 'matchday_mvp',
    category: 'GAMIFICATION',
    title: "🏆 You're MVP for Match 12",
    body: '+5 pts · top scorer in WC Office',
    data: { type: 'gamification', sub: 'mvp', match_id: 'sample', pool_id: 'sample' },
  },
  {
    key: 'streak_hot',
    category: 'GAMIFICATION',
    title: '🔥 5-match hot streak!',
    body: 'Main · WC Office',
    data: { type: 'gamification', sub: 'streak', pool_id: 'sample', streak_type: 'hot', streak_length: '5' },
  },
  {
    key: 'streak_cold',
    category: 'GAMIFICATION',
    title: '🧊 3-match cold streak!',
    body: 'Main · WC Office',
    data: { type: 'gamification', sub: 'streak', pool_id: 'sample', streak_type: 'cold', streak_length: '3' },
  },

  // --- PREDICTIONS ---
  {
    key: 'deadline_24h',
    category: 'PREDICTIONS',
    title: 'Predictions lock in 18h',
    body: 'Lock in your picks for WC Office before the window closes.',
    data: { type: 'deadline_warning', pool_id: 'sample', window_hours: '24' },
  },
  {
    key: 'deadline_6h',
    category: 'PREDICTIONS',
    title: 'Predictions lock in 4h',
    body: 'Lock in your picks for WC Office before the window closes.',
    data: { type: 'deadline_warning', pool_id: 'sample', window_hours: '6' },
  },
  {
    key: 'deadline_1h',
    category: 'PREDICTIONS',
    title: 'Predictions lock in 30m',
    body: 'Lock in your picks for WC Office before the window closes.',
    data: { type: 'deadline_warning', pool_id: 'sample', window_hours: '1' },
  },
  {
    key: 'match_starting',
    category: 'PREDICTIONS',
    title: 'Brazil vs Argentina kicks off in ~1h',
    body: 'Match 12',
    data: { type: 'match_starting', match_id: 'sample' },
  },
  {
    key: 'predict_reminder',
    category: 'PREDICTIONS',
    title: 'Make your picks for WC Office',
    body: "Predictions lock in 6h — don't miss out",
    data: { type: 'predict_reminder', pool_id: 'sample' },
  },
  {
    key: 'deadline_changed',
    category: 'PREDICTIONS',
    title: 'Deadline Changed',
    body: 'WC Office: new deadline is Sunday, June 14 at 3:00 PM',
    data: { type: 'admin', pool_id: 'sample' },
  },
  {
    key: 'auto_submit',
    category: 'PREDICTIONS',
    title: 'Predictions Auto-Submitted',
    body: 'Your draft predictions for WC Office were submitted before the deadline.',
    data: { type: 'predictions', pool_id: 'sample' },
  },

  // --- LEADERBOARD ---
  {
    key: 'rank_change_up',
    category: 'LEADERBOARD',
    title: '↑ Moved up to #5',
    body: 'Overtook Sarah in WC Office',
    data: { type: 'rank_change', pool_id: 'sample', old_rank: '7', new_rank: '5' },
  },
  {
    key: 'rank_change_down',
    category: 'LEADERBOARD',
    title: '↓ Dropped to #7',
    body: 'Mike overtook you in WC Office',
    data: { type: 'rank_change', pool_id: 'sample', old_rank: '5', new_rank: '7' },
  },

  // --- COMMUNITY ---
  {
    key: 'mention',
    category: 'COMMUNITY',
    title: 'Mike mentioned you',
    body: 'in WC Office: "hey @ryan did you see brazil\'s score?"',
    data: { type: 'community', pool_id: 'sample' },
  },
  {
    key: 'message',
    category: 'COMMUNITY',
    title: 'Mike in WC Office',
    body: 'Brazil with the equalizer!',
    data: { type: 'community', pool_id: 'sample' },
  },

  // --- POOL_ACTIVITY ---
  {
    key: 'pool_joined_welcome',
    category: 'POOL_ACTIVITY',
    title: 'Welcome to WC Office!',
    body: "You've joined the pool. Make your predictions!",
    data: { type: 'pool_activity', pool_id: 'sample' },
  },
  {
    key: 'pool_joined_admin',
    category: 'POOL_ACTIVITY',
    title: 'Sarah joined WC Office',
    body: 'A new member just joined your pool',
    data: { type: 'pool_activity', sub: 'member_joined', pool_id: 'sample' },
  },

  // --- ADMIN ---
  {
    key: 'points_adjusted',
    category: 'ADMIN',
    title: 'Points Adjusted (+5)',
    body: 'WC Office: bonus for early submission',
    data: { type: 'admin', pool_id: 'sample' },
  },
  {
    key: 'member_removed',
    category: 'ADMIN',
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
        sample.category,
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
    note: 'Tokens are filtered by per-category push prefs. If sent=0 and total=0, the user either has no registered token for that bundle, or opted out of that category in Profile.',
  })
}

export const POST = withPerfLogging('/api/debug/push-test', handle)
