import { createAdminClient } from '@/lib/supabase/server'
import { sendBatchEmails } from '@/lib/email/send'
import { predictionsAutoSubmittedTemplate, roundAutoSubmittedTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { ROUND_LABELS, ROUND_MATCH_STAGES, type RoundKey } from '@/lib/tournament'

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

/**
 * Auto-submit progressive round predictions for rounds whose deadline has passed.
 * For each progressive pool: find rounds in 'open' state with past deadline,
 * auto-submit entries that have predictions, transition round to 'in_progress'.
 */
export async function autoSubmitProgressiveRounds(): Promise<AutoSubmitResult> {
  const supabase = createAdminClient()
  const result: AutoSubmitResult = { poolsChecked: 0, submitted: 0, errors: [] }

  try {
    // 1. Find open rounds with past deadlines
    const { data: openRounds, error: roundsError } = await supabase
      .from('pool_round_states')
      .select('id, pool_id, round_key, deadline')
      .eq('state', 'open')
      .lt('deadline', new Date().toISOString())
      .not('deadline', 'is', null)

    if (roundsError) {
      result.errors.push(`Failed to fetch open rounds: ${roundsError.message}`)
      return result
    }

    if (!openRounds || openRounds.length === 0) return result

    // Group by pool
    const poolRounds = new Map<string, typeof openRounds>()
    for (const round of openRounds) {
      const existing = poolRounds.get(round.pool_id) ?? []
      existing.push(round)
      poolRounds.set(round.pool_id, existing)
    }

    result.poolsChecked = poolRounds.size

    for (const [poolId, rounds] of poolRounds) {
      // Get pool info
      const { data: pool } = await supabase
        .from('pools')
        .select('pool_id, pool_name, tournament_id')
        .eq('pool_id', poolId)
        .single()

      if (!pool) continue

      // Get all entries for this pool
      const { data: members } = await supabase
        .from('pool_members')
        .select('member_id, users(email, full_name, username)')
        .eq('pool_id', poolId)

      const { data: entries } = await supabase
        .from('pool_entries')
        .select('entry_id, entry_name, member_id')
        .in('member_id', (members ?? []).map(m => m.member_id))

      if (!entries || entries.length === 0) continue

      const memberMap = new Map((members ?? []).map((m: any) => [m.member_id, m]))

      for (const round of rounds) {
        const roundKey = round.round_key as RoundKey
        const roundName = ROUND_LABELS[roundKey] ?? roundKey
        const stages = ROUND_MATCH_STAGES[roundKey] ?? []

        // Get match count for this round
        const { count: roundMatchCount } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', pool.tournament_id)
          .in('stage', stages)

        // Find entries without submission for this round that have predictions
        for (const entry of entries) {
          // Check if already submitted
          const { data: existingSub } = await supabase
            .from('entry_round_submissions')
            .select('id, has_submitted')
            .eq('entry_id', entry.entry_id)
            .eq('round_key', roundKey)
            .maybeSingle()

          if (existingSub?.has_submitted) continue

          // Count predictions for this round's matches
          const { data: matchIds } = await supabase
            .from('matches')
            .select('match_id')
            .eq('tournament_id', pool.tournament_id)
            .in('stage', stages)

          if (!matchIds || matchIds.length === 0) continue

          const { count: predCount } = await supabase
            .from('predictions')
            .select('*', { count: 'exact', head: true })
            .eq('entry_id', entry.entry_id)
            .in('match_id', matchIds.map(m => m.match_id))

          if (!predCount || predCount === 0) continue

          // Auto-submit: upsert entry_round_submissions
          const now = new Date().toISOString()
          await supabase
            .from('entry_round_submissions')
            .upsert({
              ...(existingSub?.id ? { id: existingSub.id } : {}),
              entry_id: entry.entry_id,
              round_key: roundKey,
              has_submitted: true,
              submitted_at: now,
              auto_submitted: true,
              prediction_count: predCount,
              updated_at: now,
            }, { onConflict: 'entry_id,round_key' })

          result.submitted++

          // Send notification email
          const member = memberMap.get(entry.member_id) as any
          if (member?.users?.email) {
            const { subject, html } = roundAutoSubmittedTemplate({
              userName: member.users.full_name || member.users.username || 'there',
              poolName: pool.pool_name,
              entryName: entry.entry_name,
              roundName,
              matchCount: predCount,
              totalRoundMatches: roundMatchCount ?? 0,
              poolUrl: `${APP_URL}/pools/${poolId}?tab=predictions`,
            })

            sendBatchEmails([{
              to: member.users.email,
              subject,
              html,
              topicId: TOPICS.PREDICTIONS,
            }]).catch(console.error)
          }
        }

        // Transition round to in_progress
        await supabase
          .from('pool_round_states')
          .update({
            state: 'in_progress',
            updated_at: new Date().toISOString(),
          })
          .eq('id', round.id)
      }
    }
  } catch (err) {
    result.errors.push(`Unexpected error: ${err}`)
  }

  if (result.submitted > 0) {
    console.log(`[AutoSubmit] Progressive: auto-submitted ${result.submitted} round entries`)
  }

  return result
}
