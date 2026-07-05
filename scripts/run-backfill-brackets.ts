/**
 * One-off: populate shadow_resolved_brackets for all submitted full_tournament
 * entries (Option A materialization of resolveFullBracket). Writes ONLY the
 * shadow_resolved_brackets table — zero live-scoring impact.
 *
 * Usage: npx tsx scripts/run-backfill-brackets.ts [tournament_id] [poolId ...]
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
try {
  const envContent = readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  console.error('Could not read .env.local')
  process.exit(1)
}

import { createAdminClient } from '../lib/supabase/server'
import { backfillResolvedBrackets } from '../lib/scoring/shadowBrackets'

async function main() {
  const args = process.argv.slice(2)
  const tournamentId =
    args[0] || process.env.API_FOOTBALL_TOURNAMENT_ID || '00000000-0000-0000-0000-000000000001'
  const poolIds = args.slice(1)
  const admin = createAdminClient()
  const start = Date.now()
  const summary = await backfillResolvedBrackets(
    admin,
    tournamentId,
    poolIds.length > 0 ? { poolIds } : undefined,
  )
  console.log(JSON.stringify({ ms: Date.now() - start, ...summary }))
}

main().then(() => process.exit(0))
