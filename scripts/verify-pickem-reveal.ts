// =============================================================
// The Pick'em weekly reveal, against production
// =============================================================
// READ-ONLY. Runs the REAL gate — `readLeagueRevealContext` + `computeReveal` +
// `gatePoolPredictions`, exactly as `/api/pools/:id/bulk` composes them — over
// every live Pick'em pool, and asserts the one rule the feature rests on:
//
//   ⚠⚠ A MEMBER MUST NEVER SEE A PICK FOR A WEEK THEY CAN STILL CHANGE.
//
// This is the check that a unit test cannot make. The gate is unit-tested with
// fixtures already; what those cannot tell you is whether the ROUND STATES a
// real season produces line up with the matchweeks real picks were made in. The
// phone's new predictions tab shows everybody's picks for a locked week, so if
// this rule is wrong anywhere it is wrong on a screen.
//
// ## What it asserts, per pool
//
//  1. Every matchweek whose `lock_at` has passed is revealed, and every one that
//     has not is NOT. ⚠ Including FUTURE weeks — the trap this whole area
//     carries, because `pool_round_states` spells an unopened matchweek
//     'locked' exactly as it spells a closed one. A gate reading the string
//     would reveal matchweek 30 in August.
//  2. Running the gate as a real member returns their OWN picks in full, and
//     another member's ONLY for revealed weeks.
//  3. Nothing survives the gate whose fixture sits in an unrevealed matchweek —
//     asserted against the fixtures themselves, not against the gate's own
//     bookkeeping, so the two have to agree independently.
//
//   npx tsx --env-file=.env.local scripts/verify-pickem-reveal.ts
// =============================================================

import { createClient } from '@supabase/supabase-js'
import { readAllLeaguePredictions, readLeagueRevealContext } from '../lib/league/read'
import { computeReveal, gatePoolPredictions } from '../lib/predictions/revealGate'
import { matchweekNumber } from '../lib/competitionRounds'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

let failures = 0
function check(ok: boolean, label: string, detail = '') {
  if (ok) console.log(`    ✓ ${label}`)
  else {
    failures++
    console.log(`    ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  const now = new Date()
  const { data: pools, error } = await admin
    .from('pools')
    .select('pool_id, pool_name, league_season_id, league_depth, prediction_mode, prediction_deadline')
    .eq('league_mode', 'pickem')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`pools: ${error.message}`)

  console.log(`\n${(pools ?? []).length} Pick'em pools · now = ${now.toISOString()}\n`)

  for (const p of pools ?? []) {
    console.log(`── ${p.pool_name}  [depth=${p.league_depth ?? 'NULL'}]`)

    const ctx = await readLeagueRevealContext(admin, p.league_season_id)
    if (ctx.error) {
      check(false, 'reveal context', ctx.error)
      continue
    }

    // ---- 1. the clock decides, and only the clock -------------------------
    const reveal = computeReveal(
      {
        prediction_mode: p.prediction_mode as 'league_pickem',
        prediction_deadline: p.prediction_deadline,
      },
      ctx.roundStates,
      now,
    )
    const revealedKeys = new Set(reveal.revealed && reveal.scope === 'rounds' ? reveal.roundKeys : [])

    const expectedRevealed = new Set(
      ctx.roundStates
        .filter((r) => r.deadline !== null && new Date(r.deadline).getTime() <= now.getTime())
        .map((r) => r.round_key),
    )
    const wronglyRevealed = [...revealedKeys].filter((k) => !expectedRevealed.has(k))
    const wronglyHidden = [...expectedRevealed].filter((k) => !revealedKeys.has(k))

    check(
      wronglyRevealed.length === 0,
      '⚠ no matchweek is revealed before its lock_at',
      wronglyRevealed.map((k) => matchweekNumber(k)).join(', '),
    )
    check(
      wronglyHidden.length === 0,
      'every locked matchweek is revealed',
      wronglyHidden.map((k) => matchweekNumber(k)).join(', '),
    )

    const revealedNumbers = [...revealedKeys].map((k) => matchweekNumber(k)).filter((n): n is number => n !== null).sort((a, b) => a - b)
    const futureCount = ctx.roundStates.length - expectedRevealed.size
    console.log(`    · ${revealedNumbers.length} revealed (${revealedNumbers.slice(0, 6).join(', ')}${revealedNumbers.length > 6 ? '…' : ''}), ${futureCount} still hidden`)

    // ---- 2. the gate, run as a real member --------------------------------
    const { data: entryRows } = await admin
      .from('pool_entries')
      .select('entry_id, member_id')
      .eq('pool_id', p.pool_id)
      .is('retired_at', null)
    const entries = (entryRows ?? []) as Array<{ entry_id: string; member_id: string }>
    if (entries.length < 2) {
      console.log('    · fewer than two entries — nothing to hide from anybody')
      continue
    }

    const { predictions, outcomes, error: predErr } = await readAllLeaguePredictions(
      admin,
      entries.map((e) => e.entry_id),
    )
    if (predErr) {
      check(false, 'read predictions', predErr)
      continue
    }

    const viewer = entries[0]
    const all = [
      ...predictions.map((x) => ({ entry_id: x.entry_id, match_id: x.match_id })),
      ...outcomes.map((x) => ({ entry_id: x.entry_id, match_id: x.match_id })),
    ]
    if (all.length === 0) {
      console.log('    · no picks in this pool yet')
      continue
    }

    const gated = gatePoolPredictions({
      predictions: all,
      ownEntryIds: [viewer.entry_id],
      isAdmin: false,
      reveal,
      matchStageById: ctx.stageById,
    })

    const ownAll = all.filter((x) => x.entry_id === viewer.entry_id).length
    const ownGated = gated.filter((x) => x.entry_id === viewer.entry_id).length
    check(ownGated === ownAll, 'your own picks are never withheld from you', `${ownGated}/${ownAll}`)

    // ---- 3. independently: nothing survives from an unrevealed week -------
    // Asserted against the FIXTURES rather than the gate's own round keys, so
    // the two have to agree without consulting each other.
    const leaked: number[] = []
    for (const g of gated) {
      if (g.entry_id === viewer.entry_id) continue
      const key = ctx.stageById.get(g.match_id)
      if (!key || !revealedKeys.has(key)) {
        const n = key ? matchweekNumber(key) : null
        if (n !== null && !leaked.includes(n)) leaked.push(n)
      }
    }
    check(
      leaked.length === 0,
      "⚠⚠ no rival pick survives from an unrevealed matchweek",
      leaked.length ? `matchweeks ${leaked.sort((a, b) => a - b).join(', ')}` : '',
    )

    const othersAll = all.length - ownAll
    const othersGated = gated.length - ownGated
    console.log(`    · viewer sees ${ownGated} own + ${othersGated} of ${othersAll} rival picks`)
  }

  console.log(failures === 0 ? '\n✅ all checks passed\n' : `\n❌ ${failures} check(s) failed\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
