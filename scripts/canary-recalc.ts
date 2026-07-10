/**
 * B1 canary: run recalculatePool for one or more pools against the (prod) DB,
 * timing each. The diff-write flag is read from sync_settings, so set
 * scoring_diff_writes_enabled before running to exercise the diff path.
 *
 * Usage: npx tsx scripts/canary-recalc.ts <pool_id> [<pool_id> ...]
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

import { recalculatePool } from '../lib/scoring/recalculate'

async function main() {
  const poolIds = process.argv.slice(2)
  if (poolIds.length === 0) {
    console.error('Usage: npx tsx scripts/canary-recalc.ts <pool_id> [<pool_id> ...]')
    process.exit(1)
  }
  for (const poolId of poolIds) {
    const start = Date.now()
    try {
      const result = await recalculatePool({ poolId })
      const ms = Date.now() - start
      console.log(JSON.stringify({ ...result, poolId, ms }))
    } catch (e: any) {
      console.log(JSON.stringify({ poolId, error: e?.message || String(e) }))
    }
  }
}

main().then(() => process.exit(0))
