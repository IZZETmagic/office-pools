import { createAdminClient } from '@/lib/supabase/server'
import { sendBatchEmails } from '@/lib/email/send'
import { predictionsAutoSubmittedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

type AutoSubmitResult = {
  poolsChecked: number
  submitted: number
  errors: string[]
}

/**
 * Auto-submit draft predictions for pools whose deadline has passed.
 * Only entries with at least 1 saved prediction are submitted.
 * Idempotent — safe to call multiple times.
 *
 * @param poolId - Optional: target a specific pool (used by lazy fallback).
 *                 If omitted, checks ALL pools with past deadlines.
 */
export async function autoSubmitDraftEntries(poolId?: string): Promise<AutoSubmitResult> {
  const supabase = createAdminClient()
  const result: AutoSubmitResult = { poolsChecked: 0, submitted: 0, errors: [] }

  try {
    // 1. Find pools with past deadlines
    let poolsQuery = supabase
      .from('pools')
      .select('pool_id, pool_name, tournament_id, prediction_deadline')
      .lt('prediction_deadline', new Date().toISOString())
      .not('prediction_deadline', 'is', null)

    if (poolId) {
      poolsQuery = poolsQuery.eq('pool_id', poolId)
    }

    const { data: pools, error: poolsError } = await poolsQuery

    if (poolsError) {
      result.errors.push(`Failed to fetch pools: ${poolsError.message}`)
      return result
    }

    if (!pools || pools.length === 0) return result
    result.poolsChecked = pools.length

    for (const pool of pools) {
      // 2. Find unsubmitted entries for this pool
      const { data: entries, error: entriesError } = await supabase
        .from('pool_entries')
        .select(`
          entry_id,
          entry_name,
          member_id,
          pool_members!inner(
            user_id,
            pool_id,
            users!inner(
              email,
              username,
              full_name
            )
          )
        `)
        .eq('pool_members.pool_id', pool.pool_id)
        .eq('has_submitted_predictions', false)
        .eq('auto_submitted', false)
        .eq('predictions_locked', false)

      if (entriesError) {
        result.errors.push(`Pool ${pool.pool_id}: failed to fetch entries: ${entriesError.message}`)
        continue
      }

      if (!entries || entries.length === 0) continue

      // 3. Get total match count for this tournament
      const { count: totalMatches } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', pool.tournament_id)

      // 4. Check which entries have at least 1 prediction
      const eligibleEntries: Array<{
        entry_id: string
        entry_name: string
        predictionCount: number
        email: string
        userName: string
      }> = []

      for (const entry of entries) {
        const { count } = await supabase
          .from('predictions')
          .select('*', { count: 'exact', head: true })
          .eq('entry_id', entry.entry_id)

        if (count && count > 0) {
          const member = entry.pool_members as any
          const user = member.users
          eligibleEntries.push({
            entry_id: entry.entry_id,
            entry_name: entry.entry_name,
            predictionCount: count,
            email: user.email,
            userName: user.full_name || user.username,
          })
        }
      }

      if (eligibleEntries.length === 0) continue

      // 5. Batch update all eligible entries
      const entryIds = eligibleEntries.map((e) => e.entry_id)
      const now = new Date().toISOString()

      const { error: updateError } = await supabase
        .from('pool_entries')
        .update({
          has_submitted_predictions: true,
          predictions_submitted_at: now,
          predictions_last_saved_at: now,
          auto_submitted: true,
        })
        .in('entry_id', entryIds)

      if (updateError) {
        result.errors.push(`Pool ${pool.pool_id}: failed to update entries: ${updateError.message}`)
        continue
      }

      result.submitted += eligibleEntries.length

      // 6. Send notification emails (fire-and-forget)
      const poolUrl = `${APP_URL}/pools/${pool.pool_id}`
      const emailBatch = eligibleEntries.map((entry) => {
        const template = predictionsAutoSubmittedTemplate({
          userName: entry.userName,
          poolName: pool.pool_name,
          entryName: entry.entry_name,
          matchCount: entry.predictionCount,
          totalMatches: totalMatches ?? 0,
          poolUrl,
        })
        return {
          to: entry.email,
          subject: template.subject,
          html: template.html,
          topicId: TOPICS.PREDICTIONS,
        }
      })

      // Chunk emails (Resend batch limit is 100)
      for (let i = 0; i < emailBatch.length; i += 100) {
        const chunk = emailBatch.slice(i, i + 100)
        sendBatchEmails(chunk).catch((err) => {
          console.error('[AutoSubmit] Email batch error:', err)
        })
      }
    }
  } catch (err) {
    result.errors.push(`Unexpected error: ${err}`)
  }

  if (result.submitted > 0) {
    console.log(`[AutoSubmit] Auto-submitted ${result.submitted} entries across ${result.poolsChecked} pools`)
  }

  return result
}
