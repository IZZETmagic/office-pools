/**
 * One-time script: Recalculate all pool scores using the new scoring engine v2.
 *
 * Usage:
 *   npx tsx scripts/recalculate-all-pools.ts
 *
 * This populates the match_scores_v2 table and v2_* columns on pool_entries
 * for comparison against the existing scoring system. It does NOT modify
 * any existing scores.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

// Load .env.local
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
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
} catch {
  console.error('Could not read .env.local')
}

import { recalculatePool } from '../lib/scoring/recalculate'

const POOL_IDS = [
  // Analytics Test - Full (12 entries, full_tournament)
  'b0000000-0000-0000-0000-000000000001',
  // Analytics Test - Prog (11 entries, progressive)
  'b0000000-0000-0000-0000-000000000002',
  // Analytics Test - Brac (11 entries, bracket_picker)
  'b0000000-0000-0000-0000-000000000003',
]

async function main() {
  console.log('=== Scoring Engine v2 — One-time Recalculation ===\n')

  // Verify env vars
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
    process.exit(1)
  }

  console.log(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
  console.log(`Pools to process: ${POOL_IDS.length}\n`)

  for (const poolId of POOL_IDS) {
    console.log(`--- Processing pool: ${poolId} ---`)
    const start = Date.now()

    try {
      const result = await recalculatePool({ poolId })
      const elapsed = Date.now() - start

      if (result.success) {
        console.log(`  Mode: ${result.predictionMode}`)
        console.log(`  Entries processed: ${result.entriesProcessed}`)
        console.log(`  Match scores written: ${result.matchScoresWritten}`)
        console.log(`  Bonus scores written: ${result.bonusScoresWritten}`)
        console.log(`  Time: ${elapsed}ms`)
      } else {
        console.error(`  FAILED: ${result.error}`)
      }
    } catch (err: any) {
      console.error(`  ERROR: ${err.message}`)
    }

    console.log('')
  }

  console.log('=== Done ===')
}

main().catch(console.error)
