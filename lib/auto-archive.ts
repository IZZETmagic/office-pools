import { createAdminClient } from '@/lib/supabase/server'

type AutoArchiveResult = {
  poolsChecked: number
  archived: number
  errors: string[]
}

/**
 * Auto-archive pools whose tournament has ended (all matches completed)
 * and at least 15 days have passed since the last match.
 *
 * Only pools with status 'open' or 'active' are considered.
 * Idempotent — safe to call multiple times.
 */
export async function autoArchivePools(): Promise<AutoArchiveResult> {
  const supabase = createAdminClient()
  const result: AutoArchiveResult = { poolsChecked: 0, archived: 0, errors: [] }

  try {
    // 1. Find all open/active pools
    const { data: pools, error: poolsError } = await supabase
      .from('pools')
      .select('pool_id, pool_name, tournament_id, status')
      .in('status', ['open', 'active'])

    if (poolsError) {
      result.errors.push(`Failed to fetch pools: ${poolsError.message}`)
      return result
    }

    if (!pools || pools.length === 0) return result

    // 2. Get unique tournament IDs
    const tournamentIds = [...new Set(pools.map(p => p.tournament_id))]

    // 3. For each tournament, check if all matches are completed and find the last match date
    const tournamentStatus = new Map<string, { allCompleted: boolean; lastMatchDate: Date | null }>()

    for (const tid of tournamentIds) {
      // Count total matches
      const { count: totalCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tid)

      // Count completed matches
      const { count: completedCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tid)
        .eq('is_completed', true)

      const allCompleted = totalCount !== null && completedCount !== null
        && totalCount > 0 && totalCount === completedCount

      // Get the last match date
      let lastMatchDate: Date | null = null
      if (allCompleted) {
        const { data: lastMatch } = await supabase
          .from('matches')
          .select('match_date')
          .eq('tournament_id', tid)
          .order('match_date', { ascending: false })
          .limit(1)
          .single()

        if (lastMatch?.match_date) {
          lastMatchDate = new Date(lastMatch.match_date)
        }
      }

      tournamentStatus.set(tid, { allCompleted, lastMatchDate })
    }

    // 4. Archive pools where tournament is done and 15+ days have passed
    const now = new Date()
    const ARCHIVE_DELAY_DAYS = 15

    for (const pool of pools) {
      result.poolsChecked++
      const status = tournamentStatus.get(pool.tournament_id)
      if (!status || !status.allCompleted || !status.lastMatchDate) continue

      const daysSinceLastMatch = (now.getTime() - status.lastMatchDate.getTime()) / (1000 * 60 * 60 * 24)

      if (daysSinceLastMatch >= ARCHIVE_DELAY_DAYS) {
        const { error: updateError } = await supabase
          .from('pools')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('pool_id', pool.pool_id)

        if (updateError) {
          result.errors.push(`Failed to archive pool "${pool.pool_name}": ${updateError.message}`)
        } else {
          result.archived++
          console.log(`[Auto-Archive] Archived pool "${pool.pool_name}" (${pool.pool_id}) — tournament ended ${Math.floor(daysSinceLastMatch)} days ago`)
        }
      }
    }

    return result
  } catch (err) {
    result.errors.push(`Unexpected error: ${err}`)
    return result
  }
}
