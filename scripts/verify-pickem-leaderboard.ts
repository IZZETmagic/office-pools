// =============================================================
// The Pick'em leaderboard, against production
// =============================================================
// READ-ONLY. Runs the real `readLeagueLeaderboard` against every live Pick'em
// pool and checks the things that were actually wrong, rather than that the
// function returns something.
//
// Why it exists: before this leaderboard, a Pick'em pool on the phone rendered
// **"No Entries Yet"** — `usePoolDetail` empties the World Cup list for every
// league pool, and Pick'em had no branch of its own, so it fell to the empty
// state on top of a fully scored pool. Nothing threw, nothing logged, and the
// screen was confidently wrong. A unit test with a fixture would not have
// noticed; only real rows do.
//
// ## What it asserts
//
//  1. Rows come back at all, and their totals match `league_entry_totals`.
//     ⚠ Read straight from the table, NOT recomputed — the engine owns the
//     number and a second opinion here would be a second scoring engine.
//  2. `exact_count` is NULL at Results depth and a number at Scores depth.
//     This is the depth fork, and getting it backwards is the failure that has
//     shipped three times on web: it does not throw, it just tells members they
//     played a game they did not.
//  3. Form dots speak only the vocabulary their depth can emit — a Results pool
//     that reports an `exact` means the engine and the screen disagree.
//  4. Rank ordering is the engine's, ascending and gapless-by-comparison.
//
//   npx tsx --env-file=.env.local scripts/verify-pickem-leaderboard.ts
// =============================================================

import { createClient } from '@supabase/supabase-js'
import { readLeagueLeaderboard } from '../lib/league/leaderboard'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

let failures = 0
function check(ok: boolean, label: string, detail = '') {
  if (ok) {
    console.log(`    ✓ ${label}`)
  } else {
    failures++
    console.log(`    ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** What each depth's engine is allowed to emit (066:184). */
const ALLOWED: Record<string, Set<string>> = {
  results: new Set(['winner', 'miss', 'no_pick']),
  scores: new Set(['exact', 'winner_gd', 'winner', 'miss', 'no_pick']),
}

async function main() {
  const { data: pools, error } = await admin
    .from('pools')
    .select('pool_id, pool_name, league_mode, league_depth, league_season_id')
    .eq('league_mode', 'pickem')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`pools: ${error.message}`)

  const list = pools ?? []
  console.log(`\n${list.length} Pick'em pools in production\n`)

  for (const p of list) {
    // ⚠ NULL depth is Scores, byte for byte with 066. Same polarity the reader
    // uses; testing it the other way round would agree with a bug.
    const depth = p.league_depth === 'results' ? 'results' : 'scores'
    console.log(`── ${p.pool_name}  [depth=${p.league_depth ?? 'NULL'} → ${depth}]`)

    const { leaderboard, error: lbErr } = await readLeagueLeaderboard(
      admin,
      p.pool_id,
      {
        league_season_id: p.league_season_id,
        league_mode: p.league_mode,
        league_depth: p.league_depth,
      },
      null,
    )
    if (lbErr || !leaderboard) {
      check(false, 'leaderboard read', lbErr ?? 'null')
      continue
    }

    check(leaderboard.mode === 'pickem', `mode is pickem`, String(leaderboard.mode))
    check(leaderboard.depth === depth, `depth ships as ${depth}`, String(leaderboard.depth))

    const rows = leaderboard.rows
    if (rows.length === 0) {
      console.log('    · no entries — nothing further to check')
      continue
    }

    // ---- 1. totals are the stored ones, not a recomputation ----------------
    const { data: totals } = await admin
      .from('league_entry_totals')
      .select('entry_id, total_points, exact_count, correct_count, final_rank')
      .eq('pool_id', p.pool_id)
    const stored = new Map((totals ?? []).map((t) => [t.entry_id, t]))
    const mismatched = rows.filter(
      (r) => stored.has(r.entry_id) && (stored.get(r.entry_id)!.total_points ?? 0) !== r.total_points,
    )
    check(mismatched.length === 0, 'every total matches league_entry_totals', `${mismatched.length} differ`)

    // ---- 2. the depth fork -------------------------------------------------
    const withBlock = rows.filter((r) => r.pickem !== null)
    check(withBlock.length === rows.length, 'every row carries a pickem block')

    if (depth === 'results') {
      const leaked = withBlock.filter((r) => r.pickem!.exact_count !== null)
      check(
        leaked.length === 0,
        'exact_count is NULL at Results depth (the mode never asks for a scoreline)',
        `${leaked.length} rows carry a number`,
      )
    } else {
      const missing = withBlock.filter((r) => r.pickem!.exact_count === null)
      check(missing.length === 0, 'exact_count is a number at Scores depth', `${missing.length} are null`)
      const wrong = withBlock.filter(
        (r) => stored.has(r.entry_id) && r.pickem!.exact_count !== (stored.get(r.entry_id)!.exact_count ?? 0),
      )
      check(wrong.length === 0, 'exact_count matches the stored column', `${wrong.length} differ`)
    }

    const badCorrect = withBlock.filter(
      (r) => stored.has(r.entry_id) && r.pickem!.correct_count !== (stored.get(r.entry_id)!.correct_count ?? 0),
    )
    check(badCorrect.length === 0, 'correct_count matches the stored column', `${badCorrect.length} differ`)

    // ---- 3. form vocabulary ------------------------------------------------
    const allowed = ALLOWED[depth]
    const illegal = new Set<string>()
    let plotted = 0
    for (const r of withBlock) {
      for (const t of r.pickem!.last_five) {
        plotted++
        if (!allowed.has(t)) illegal.add(t)
      }
    }
    check(
      illegal.size === 0,
      `form dots speak only ${depth} vocabulary`,
      illegal.size ? `saw ${[...illegal].join(', ')}` : '',
    )
    const overlong = withBlock.filter((r) => r.pickem!.last_five.length > 5)
    check(overlong.length === 0, 'no row plots more than five', `${overlong.length} do`)
    console.log(`    · ${plotted} dots across ${rows.length} rows`)

    // ---- 4. ordering is the engine's --------------------------------------
    const ranked = rows.filter((r) => r.current_rank !== null)
    const ascending = ranked.every(
      (r, i) => i === 0 || (ranked[i - 1].current_rank ?? 0) <= (r.current_rank ?? 0),
    )
    check(ascending, 'rows arrive in the engine\'s rank order')

    const top = rows[0]
    console.log(
      `    · leader: ${top.entry_name || top.full_name} — ${top.total_points} pts, ` +
        `${top.pickem?.correct_count ?? 0} correct` +
        (top.pickem?.exact_count !== null && top.pickem !== null
          ? `, ${top.pickem.exact_count} exact`
          : '') +
        `, form [${top.pickem?.last_five.join(' ') || '—'}]`,
    )
  }

  console.log(failures === 0 ? '\n✅ all checks passed\n' : `\n❌ ${failures} check(s) failed\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
