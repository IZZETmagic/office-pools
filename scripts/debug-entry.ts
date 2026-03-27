// Debug script: trace why specific entries get 0 match scores in v2

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
} catch { console.error('Could not read .env.local') }

import { createAdminClient } from '@/lib/supabase/server'

async function main() {
  const adminClient = createAdminClient()
  const poolId = 'b0000000-0000-0000-0000-000000000001'
  const debugEntryIds = [
    'd0000000-0000-0000-0000-000000000109', // Noah M
    'd0000000-0000-0000-0000-000000000110', // Sophie A
    'd0000000-0000-0000-0000-000000000108', // Olivia T
    'd0000000-0000-0000-0000-000000000101', // Alex J (works fine)
  ]

  // Step 1: Fetch pool_members
  const { data: poolMembers } = await adminClient
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', poolId)

  const memberIds = poolMembers!.map((m: any) => m.member_id)
  console.log(`Pool members: ${memberIds.length}`)

  // Step 2: Fetch entries
  const { data: entries } = await adminClient
    .from('pool_entries')
    .select('entry_id, member_id, has_submitted_predictions, point_adjustment')
    .in('member_id', memberIds)

  console.log(`Total entries: ${entries!.length}`)
  const submitted = entries!.filter((e: any) => e.has_submitted_predictions)
  console.log(`Submitted entries: ${submitted.length}`)

  for (const eid of debugEntryIds) {
    const entry = submitted.find((e: any) => e.entry_id === eid)
    console.log(`\n--- ${eid} ---`)
    console.log(`  Found in submitted: ${!!entry}`)
  }

  // Step 3: Fetch predictions
  const entryIds = submitted.map((e: any) => e.entry_id)
  console.log(`\nFetching predictions for ${entryIds.length} entries...`)

  const { data: allPredictions, error: predErr } = await adminClient
    .from('predictions')
    .select('entry_id, match_id, predicted_home_score, predicted_away_score')
    .in('entry_id', entryIds)
    .limit(50000)

  console.log(`Total predictions fetched: ${allPredictions?.length ?? 0}`)
  if (predErr) console.log(`Prediction error: ${predErr.message}`)

  // Group by entry
  const predictionsByEntry = new Map<string, any[]>()
  for (const p of (allPredictions || [])) {
    const list = predictionsByEntry.get(p.entry_id) || []
    list.push(p)
    predictionsByEntry.set(p.entry_id, list)
  }

  for (const eid of debugEntryIds) {
    const preds = predictionsByEntry.get(eid) || []
    console.log(`\n  ${eid}: ${preds.length} predictions in fetch`)
  }

  // Step 4: Check directly
  for (const eid of debugEntryIds.slice(0, 2)) {
    const { data: directPreds, count } = await adminClient
      .from('predictions')
      .select('entry_id', { count: 'exact' })
      .eq('entry_id', eid)
    console.log(`\n  Direct query for ${eid}: ${count ?? directPreds?.length ?? 0} predictions`)
  }
}

main().catch(console.error)
