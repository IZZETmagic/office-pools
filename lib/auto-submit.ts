import { createAdminClient } from '@/lib/supabase/server'
import { sendBatchEmails } from '@/lib/email/send'
import { predictionsAutoSubmittedTemplate, roundAutoSubmittedTemplate, roundOpenTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
// No longer imports lib/tournament's ROUND_* maps: every round question in this
// file now goes through the format-aware resolver, so the World Cup's seven
// hardcoded rounds are no longer baked into the sweep that has to drive a
// 34-, 38- or 46-matchweek season.
import { isMatchweekKey, nextRoundKey, roundLabel } from '@/lib/competitionRounds'
import { fetchPoolRoundKeys, fetchRoundMatches } from '@/lib/roundMatches'
import { sendPushToUser, sendPushToUsers } from '@/lib/push/apns'

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
        userId: string
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
            userId: member.user_id,
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

      // Send push notifications (fire-and-forget)
      for (const entry of eligibleEntries) {
        sendPushToUser(
          entry.userId,
          {
            title: 'Predictions Auto-Submitted',
            body: `Your draft predictions for ${pool.pool_name} were submitted before the deadline.`,
            data: { type: 'predictions', pool_id: pool.pool_id },
          },
          'PREDICTIONS',
        ).catch((err) => console.error('[AutoSubmit] Push error:', err))
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
        const roundKey = round.round_key
        const roundName = roundLabel(roundKey)

        // Fixture count for this round, via the selector rather than a stage
        // filter — see lib/roundMatches.ts. A matchweek counted by stage would
        // report every fixture in the season.
        const { data: roundFixtures } = await fetchRoundMatches<{ match_id: string }>(supabase, {
          tournamentId: pool.tournament_id,
          roundKey,
          columns: 'match_id',
        })
        const roundMatchCount = roundFixtures.length

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

          // Count predictions for this round's fixtures. Reuses the list
          // fetched once above rather than re-querying `matches` per entry —
          // this ran inside the per-entry loop, so a 38-matchweek league pool
          // would have issued one fixture query per member per matchweek.
          if (roundFixtures.length === 0) continue

          const { count: predCount } = await supabase
            .from('predictions')
            .select('*', { count: 'exact', head: true })
            .eq('entry_id', entry.entry_id)
            .in('match_id', roundFixtures.map(m => m.match_id))

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

            // Push notification
            sendPushToUser(
              member.user_id,
              {
                title: `${roundName} Auto-Submitted`,
                body: `Your predictions for ${pool.pool_name} were submitted before the deadline.`,
                data: { type: 'predictions', pool_id: poolId },
              },
              'PREDICTIONS',
            ).catch(console.error)
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

type AutoCompleteResult = {
  roundsChecked: number
  completed: number
  nextRoundsOpened: number
  errors: string[]
}

/**
 * Auto-complete progressive rounds where all matches have finished.
 * When a round is in 'in_progress' state and every match in that round
 * has is_completed=true, transition to 'completed' and auto-open the
 * next round if teams are assigned.
 */
export async function autoCompleteProgressiveRounds(): Promise<AutoCompleteResult> {
  const supabase = createAdminClient()
  const result: AutoCompleteResult = { roundsChecked: 0, completed: 0, nextRoundsOpened: 0, errors: [] }

  try {
    // 1. Find all rounds in 'in_progress' state
    const { data: inProgressRounds, error: roundsError } = await supabase
      .from('pool_round_states')
      .select('id, pool_id, round_key')
      .eq('state', 'in_progress')

    if (roundsError) {
      result.errors.push(`Failed to fetch in_progress rounds: ${roundsError.message}`)
      return result
    }

    if (!inProgressRounds || inProgressRounds.length === 0) return result
    result.roundsChecked = inProgressRounds.length

    for (const round of inProgressRounds) {
      const roundKey = round.round_key

      // 2. Get pool's tournament_id
      const { data: pool } = await supabase
        .from('pools')
        .select('tournament_id, pool_name')
        .eq('pool_id', round.pool_id)
        .single()

      if (!pool) continue

      // 3. Check if ALL matches in this round are completed.
      //
      // Resolved through the round selector rather than `.in('stage', ...)`: a
      // matchweek's fixtures all share stage 'regular_season' and are told apart
      // by round_number, so a stage filter would select the WHOLE SEASON for
      // matchweek 1 and never complete it. An unknown key returns an error
      // instead of an empty list — an empty list here would read as "all zero
      // fixtures are finished" and complete the round immediately.
      const { data: roundMatches, error: roundMatchesError } = await fetchRoundMatches<{
        match_id: string
        is_completed: boolean
      }>(supabase, { tournamentId: pool.tournament_id, roundKey, columns: 'match_id, is_completed' })

      if (roundMatchesError) {
        result.errors.push(`Pool ${round.pool_id} round ${roundKey}: ${roundMatchesError}`)
        continue
      }
      if (roundMatches.length === 0) continue

      const allCompleted = roundMatches.every(m => m.is_completed)
      if (!allCompleted) continue

      // 4. Transition round to 'completed'
      const now = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('pool_round_states')
        .update({
          state: 'completed',
          completed_at: now,
          updated_at: now,
        })
        .eq('id', round.id)

      if (updateError) {
        result.errors.push(`Pool ${round.pool_id} round ${roundKey}: ${updateError.message}`)
        continue
      }

      result.completed++
      console.log(`[AutoComplete] Completed ${roundKey} for pool ${round.pool_id}`)

      // 5. Auto-open next round if teams are assigned.
      //
      // The successor is resolved against the rounds this pool ACTUALLY has,
      // not the static seven-entry ROUND_ORDER map. A league's last round is
      // matchweek 34 in the Bundesliga and 38 in the Premier League — there is
      // no constant that is right for both, and the count comes from the feed.
      const { keys: poolRoundKeys, error: keysError } = await fetchPoolRoundKeys(supabase, round.pool_id)
      if (keysError) {
        result.errors.push(`Pool ${round.pool_id} round keys: ${keysError}`)
        continue
      }
      const nextRound = nextRoundKey(roundKey, poolRoundKeys)
      if (!nextRound) continue

      // Check current state of next round (must be locked)
      const { data: nextRoundState } = await supabase
        .from('pool_round_states')
        .select('id, state')
        .eq('pool_id', round.pool_id)
        .eq('round_key', nextRound)
        .single()

      if (!nextRoundState || nextRoundState.state !== 'locked') continue

      const { data: nextMatches, error: nextMatchesError } = await fetchRoundMatches<{
        match_id: string
        home_team_id: string | null
        away_team_id: string | null
        match_date: string
      }>(supabase, {
        tournamentId: pool.tournament_id,
        roundKey: nextRound,
        columns: 'match_id, home_team_id, away_team_id, match_date',
      })

      if (nextMatchesError) {
        result.errors.push(`Pool ${round.pool_id} next round ${nextRound}: ${nextMatchesError}`)
        continue
      }
      if (nextMatches.length === 0) continue

      const allTeamsAssigned = nextMatches.every(m => m.home_team_id && m.away_team_id)
      if (!allTeamsAssigned) continue

      // Deadline.
      //
      // Bracket: 2 h before the round's first kickoff, unchanged.
      //
      // League: the matchweek's FIRST kickoff exactly — no grace window. This
      // has to agree with `trg_enforce_prediction_before_kickoff`, which
      // migration 045 made matchweek-level and which silently drops writes past
      // that instant. If this said 2 h earlier, the UI would close a matchweek
      // while the database still accepted picks; if it said later, members would
      // see an open round whose saves vanish without an error. The trigger is
      // the real gate, so this mirrors it.
      const firstMatchDate = new Date(nextMatches[0].match_date)
      const defaultDeadline = isMatchweekKey(nextRound)
        ? firstMatchDate.toISOString()
        : new Date(firstMatchDate.getTime() - 2 * 60 * 60 * 1000).toISOString()

      const { error: openError } = await supabase
        .from('pool_round_states')
        .update({
          state: 'open',
          deadline: defaultDeadline,
          opened_at: now,
          updated_at: now,
        })
        .eq('id', nextRoundState.id)

      if (openError) {
        result.errors.push(`Pool ${round.pool_id} auto-open ${nextRound}: ${openError.message}`)
        continue
      }

      result.nextRoundsOpened++
      console.log(`[AutoComplete] Auto-opened ${nextRound} for pool ${round.pool_id} (deadline: ${defaultDeadline})`)

      // Send round open notifications
      sendAutoRoundOpenNotifications(round.pool_id, pool.pool_name, nextRound, defaultDeadline).catch(console.error)
    }
  } catch (err) {
    result.errors.push(`Unexpected error: ${err}`)
  }

  if (result.completed > 0) {
    console.log(`[AutoComplete] Completed ${result.completed} rounds, opened ${result.nextRoundsOpened} next rounds`)
  }

  return result
}

/**
 * Send round open notification emails (used by auto-complete flow).
 * Same logic as the admin route's sendRoundOpenNotifications but usable from cron context.
 */
async function sendAutoRoundOpenNotifications(
  poolId: string,
  poolName: string,
  roundKey: string,
  deadline: string
) {
  const supabase = createAdminClient()

  const { data: members } = await supabase
    .from('pool_members')
    .select('user_id, users(email, full_name, username)')
    .eq('pool_id', poolId)

  if (!members || members.length === 0) return

  const { data: pool } = await supabase
    .from('pools')
    .select('tournament_id')
    .eq('pool_id', poolId)
    .single()

  // Fixture count via the round selector: a matchweek is identified by
  // round_number, so a stage filter would count the entire season.
  const { data: roundFixtures } = await fetchRoundMatches<{ match_id: string }>(supabase, {
    tournamentId: pool?.tournament_id as string,
    roundKey,
    columns: 'match_id',
  })
  const matchCount = roundFixtures.length

  const roundName = roundLabel(roundKey)
  const poolUrl = `${APP_URL}/pools/${poolId}?tab=predictions`

  const emails = members
    .filter((m: any) => m.users?.email)
    .map((m: any) => {
      const { subject, html } = roundOpenTemplate({
        userName: m.users.full_name || m.users.username || 'there',
        poolName,
        roundName,
        deadline,
        matchCount: matchCount ?? 0,
        poolUrl,
      })
      return {
        to: m.users.email,
        subject,
        html,
        topicId: TOPICS.POOL_ACTIVITY,
        tags: [{ name: 'category', value: 'round_open' }],
      }
    })

  if (emails.length > 0) {
    await sendBatchEmails(emails)
  }

  // Push notifications
  const userIds = members.map((m: any) => m.user_id).filter(Boolean)
  if (userIds.length > 0) {
    const roundName = roundLabel(roundKey)
    sendPushToUsers(
      userIds,
      {
        title: `${roundName} Now Open`,
        body: `Make your predictions for ${poolName}!`,
        data: { type: 'pool_activity', pool_id: poolId },
      },
      'PREDICTIONS',
    ).catch(console.error)
  }
}
