// =============================================================
// MATCHWEEK STORIES — one card per settled matchweek, per entry
// =============================================================
// The Activity tab's history used to be one row per event: a result row per
// fixture, a rank row, an XP row, a badge row. A weekend in one pool was a
// dozen rows, and none of them said what the weekend MEANT. A story card is
// that sentence: "14 pts, up 3 to 4th".
//
// PURE. The reads live in `readLeagueActivity.ts`; this file only shapes rows
// it is handed, so every branch below is covered by
// `lib/activity/__tests__/matchweekStories.test.ts` without a database.
//
// ⚠ ONLY SETTLED WEEKS. A card is built for a matchweek once `ranks_snapshot_at`
// is set — the moment it is fully played AND fully scored (migration 061). A
// card for a week still in play would restate itself every refresh, and the
// pool screen already shows the live number.
//
// ⚠ RANK IS READ, NEVER DERIVED. `rank` comes from league_entry_rank_history
// (migration 149), which copies the stored `final_rank`. A week with no history
// row (every week before 149, bar one backfilled) gets a card with points and
// no rank — never a rank recomputed from points, which cannot see a deduction.
// =============================================================

import { shortClubName } from '@/lib/league/clubName'
import { duelResult } from '@/lib/league/duelPoints'

export type StoryMode = 'pickem' | 'showdown' | 'last_man_standing' | 'table'

export type StoryPool = {
  poolId: string
  poolName: string
  seasonId: string
  mode: StoryMode
  /** The viewer's entries in this pool. */
  entries: Array<{ entryId: string; entryName: string }>
  /** Everyone in the pool, for "4th of 18". NULL when unknown. */
  entrantCount: number | null
}

export type SettledWeek = {
  seasonId: string
  matchweekNumber: number
  settledAt: string
}

export type ScoreRow = {
  entry_id: string
  pool_id: string
  matchweek_number: number
  fixture_id: string
  score_type: 'exact' | 'winner_gd' | 'winner' | 'miss' | string
  total_points: number
}

export type FixtureLabel = {
  fixture_id: string
  home: string
  away: string
  home_goals: number | null
  away_goals: number | null
}

export type DuelRow = {
  pool_id: string
  matchweek_number: number
  entry_a: string
  entry_b: string | null
  accuracy_a: number | null
  accuracy_b: number | null
  points_a: number | null
  points_b: number | null
  settled_at: string | null
}

export type LmsPickRow = {
  pool_id: string
  round_id: string
  round_number: number
  entry_id: string
  matchweek_number: number
  club_name: string
  result: 'survived' | 'eliminated' | null
}

export type LmsSurvivorRow = {
  round_id: string
  entry_id: string
  eliminated_matchweek: number | null
  is_winner: boolean
}

export type RankRow = {
  entry_id: string
  matchweek_number: number
  rank: number
}

export type Tiers = { exact: number; winner_gd: number; winner: number; miss: number }

export type MatchweekStoryMeta = {
  pool_name: string
  league_mode: StoryMode
  matchweek_number: number
  entry_id: string
  entry_name: string
  /** True when the viewer has more than one entry here, so the card names it. */
  multi_entry: boolean
  points: number | null
  tiers: Tiers | null
  rank: number | null
  rank_before: number | null
  entrants: number | null
  lines: Array<{ label: string; points: number }>
  more_count: number
  more_points: number
  duel: {
    outcome: 'won' | 'tied' | 'lost' | 'bye'
    opponent_name: string | null
    my_accuracy: number | null
    their_accuracy: number | null
    duel_points: number
  } | null
  lms: {
    result: 'survived' | 'eliminated'
    club_name: string
    round_number: number
    survivors_left: number
    round_entrants: number
    won_round: boolean
  } | null
}

export type MatchweekStory = {
  id: string
  poolId: string
  createdAt: string
  title: string
  body: string | null
  colorKey: 'primary' | 'success' | 'warning' | 'error' | 'accent'
  meta: MatchweekStoryMeta
}

export type StoryInput = {
  pools: StoryPool[]
  weeks: SettledWeek[]
  scores: ScoreRow[]
  fixtures: FixtureLabel[]
  duels: DuelRow[]
  lmsPicks: LmsPickRow[]
  lmsSurvivors: LmsSurvivorRow[]
  ranks: RankRow[]
  /** entry_id -> the person's display name, for duel opponents. */
  nameByEntry: Map<string, string>
}

const LINES_SHOWN = 3

export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** "14 pts, up 3 to 4th" — the rank half, or null when there is no rank to state. */
export function rankPhrase(rank: number | null, before: number | null): string | null {
  if (rank == null) return null
  if (before == null) return ordinal(rank)
  const d = before - rank
  if (d > 0) return `up ${d} to ${ordinal(rank)}`
  if (d < 0) return `down ${-d} to ${ordinal(rank)}`
  return `still ${ordinal(rank)}`
}

function pts(n: number): string {
  return `${n.toLocaleString('en-GB')} pt${n === 1 ? '' : 's'}`
}

function tierSummary(t: Tiers): string {
  const parts: string[] = []
  if (t.exact) parts.push(`${t.exact} exact`)
  if (t.winner_gd) parts.push(`${t.winner_gd} winner+GD`)
  if (t.winner) parts.push(`${t.winner} winner`)
  if (t.miss) parts.push(`${t.miss} miss`)
  return parts.join(' · ')
}

function fixtureLabel(f: FixtureLabel | undefined): string {
  if (!f) return 'Match'
  const home = shortClubName(f.home)
  const away = shortClubName(f.away)
  if (f.home_goals == null || f.away_goals == null) return `${home} v ${away}`
  return `${home} ${f.home_goals}–${f.away_goals} ${away}`
}

export function buildMatchweekStories(input: StoryInput): MatchweekStory[] {
  const out: MatchweekStory[] = []

  // Every week it is handed — which weeks make a page is lib/activity/page.ts's
  // decision, not this builder's.
  const weeksBySeason = new Map<string, SettledWeek[]>()
  for (const w of input.weeks) {
    const got = weeksBySeason.get(w.seasonId) ?? []
    got.push(w)
    weeksBySeason.set(w.seasonId, got)
  }
  for (const list of weeksBySeason.values()) {
    list.sort((a, b) => b.matchweekNumber - a.matchweekNumber)
  }

  const fixtureById = new Map(input.fixtures.map((f) => [f.fixture_id, f]))

  const scoresByKey = new Map<string, ScoreRow[]>()
  for (const s of input.scores) {
    const k = `${s.entry_id}:${s.matchweek_number}`
    const got = scoresByKey.get(k) ?? []
    got.push(s)
    scoresByKey.set(k, got)
  }

  const rankByKey = new Map<string, number>()
  const rankWeeksByEntry = new Map<string, number[]>()
  for (const r of input.ranks) {
    rankByKey.set(`${r.entry_id}:${r.matchweek_number}`, r.rank)
    const got = rankWeeksByEntry.get(r.entry_id) ?? []
    got.push(r.matchweek_number)
    rankWeeksByEntry.set(r.entry_id, got)
  }
  /** The rank at the latest recorded week BEFORE this one — not "number minus one". */
  const rankBefore = (entryId: string, mw: number): number | null => {
    const weeks = (rankWeeksByEntry.get(entryId) ?? []).filter((n) => n < mw)
    if (weeks.length === 0) return null
    return rankByKey.get(`${entryId}:${Math.max(...weeks)}`) ?? null
  }

  const duelByKey = new Map<string, DuelRow>()
  for (const d of input.duels) {
    if (!d.settled_at) continue
    duelByKey.set(`${d.entry_a}:${d.matchweek_number}`, d)
    if (d.entry_b) duelByKey.set(`${d.entry_b}:${d.matchweek_number}`, d)
  }

  const lmsByKey = new Map<string, LmsPickRow>()
  for (const p of input.lmsPicks) {
    if (!p.result) continue
    lmsByKey.set(`${p.entry_id}:${p.matchweek_number}`, p)
  }
  const survivorsByRound = new Map<string, LmsSurvivorRow[]>()
  for (const s of input.lmsSurvivors) {
    const got = survivorsByRound.get(s.round_id) ?? []
    got.push(s)
    survivorsByRound.set(s.round_id, got)
  }

  for (const pool of input.pools) {
    const weeks = weeksBySeason.get(pool.seasonId) ?? []
    const multi = pool.entries.length > 1

    for (const week of weeks) {
      const mw = week.matchweekNumber
      for (const entry of pool.entries) {
        const key = `${entry.entryId}:${mw}`
        const rank = rankByKey.get(key) ?? null
        const before = rank == null ? null : rankBefore(entry.entryId, mw)

        const meta: MatchweekStoryMeta = {
          pool_name: pool.poolName,
          league_mode: pool.mode,
          matchweek_number: mw,
          entry_id: entry.entryId,
          entry_name: entry.entryName,
          multi_entry: multi,
          points: null,
          tiers: null,
          rank,
          rank_before: before,
          entrants: pool.entrantCount,
          lines: [],
          more_count: 0,
          more_points: 0,
          duel: null,
          lms: null,
        }

        let title: string
        let body: string | null = null
        let colorKey: MatchweekStory['colorKey'] = 'primary'
        const rp = rankPhrase(rank, before)

        if (pool.mode === 'pickem' || pool.mode === 'showdown') {
          const rows = scoresByKey.get(key) ?? []
          const duel = pool.mode === 'showdown' ? duelByKey.get(key) : undefined
          // No picks and no duel: they sat this week out, and a card saying
          // "0 pts" about a week they never played would read as a failure.
          if (rows.length === 0 && !duel) continue

          const tiers: Tiers = { exact: 0, winner_gd: 0, winner: 0, miss: 0 }
          let total = 0
          for (const r of rows) {
            total += r.total_points
            if (r.score_type in tiers) tiers[r.score_type as keyof Tiers] += 1
          }
          meta.points = total
          meta.tiers = rows.length > 0 ? tiers : null
          const sorted = [...rows].sort((a, b) => b.total_points - a.total_points)
          meta.lines = sorted.slice(0, LINES_SHOWN).map((r) => ({
            label: fixtureLabel(fixtureById.get(r.fixture_id)),
            points: r.total_points,
          }))
          const rest = sorted.slice(LINES_SHOWN)
          meta.more_count = rest.length
          meta.more_points = rest.reduce((s, r) => s + r.total_points, 0)

          if (duel) {
            const mine = duel.entry_a === entry.entryId ? 'a' : 'b'
            const myPoints = mine === 'a' ? duel.points_a : duel.points_b
            const oppEntry = mine === 'a' ? duel.entry_b : duel.entry_a
            const outcome = oppEntry == null ? 'bye' : (duelResult(myPoints) ?? 'tied')
            const oppName = oppEntry ? (input.nameByEntry.get(oppEntry) ?? 'your opponent') : null
            meta.duel = {
              outcome,
              opponent_name: oppName,
              my_accuracy: mine === 'a' ? duel.accuracy_a : duel.accuracy_b,
              their_accuracy: oppEntry == null ? null : mine === 'a' ? duel.accuracy_b : duel.accuracy_a,
              duel_points: myPoints ?? 0,
            }
            const dp = `+${(myPoints ?? 0).toLocaleString('en-GB')}`
            if (outcome === 'won') {
              title = `Beat ${oppName}: ${dp}`
              colorKey = 'success'
            } else if (outcome === 'tied') {
              title = `Level with ${oppName}: ${dp}`
            } else if (outcome === 'bye') {
              title = `Bye week: ${dp}`
            } else {
              // Leads the sentence, so the fallback name needs its capital.
              const who = oppName ?? 'your opponent'
              title = `${who.charAt(0).toUpperCase()}${who.slice(1)} took the duel`
            }
            const acc = meta.duel.their_accuracy != null
              ? `${meta.duel.my_accuracy ?? 0} accuracy pts vs ${meta.duel.their_accuracy}`
              : `${pts(total)} accuracy`
            body = rp ? `${acc} · ${rp}` : acc
          } else {
            title = rp ? `${pts(total)}, ${rp}` : pts(total)
            body = meta.tiers ? tierSummary(meta.tiers) : null
            if (meta.tiers && meta.tiers.exact > 0) colorKey = 'accent'
            else if (rank != null && before != null && before > rank) colorKey = 'success'
          }
        } else if (pool.mode === 'last_man_standing') {
          const pick = lmsByKey.get(key)
          if (!pick || !pick.result) continue
          const round = survivorsByRound.get(pick.round_id) ?? []
          // Still standing AFTER this week: never eliminated, or eliminated later.
          const left = round.filter(
            (s) => s.eliminated_matchweek == null || s.eliminated_matchweek > mw,
          ).length
          const mineRow = round.find((s) => s.entry_id === entry.entryId)
          const club = shortClubName(pick.club_name)
          const wonRound = !!mineRow?.is_winner && pick.result === 'survived' && left <= 1
          meta.lms = {
            result: pick.result,
            club_name: club,
            round_number: pick.round_number,
            survivors_left: left,
            round_entrants: round.length,
            won_round: wonRound,
          }
          if (wonRound) {
            title = `You won round ${pick.round_number}`
            body = `The last one standing, with ${club}.`
            colorKey = 'accent'
          } else if (pick.result === 'survived') {
            title = `Survived with ${club}`
            body = `${left} of ${round.length} still in round ${pick.round_number}`
            colorKey = 'success'
          } else {
            title = `Round ${pick.round_number} ended with ${club}`
            body = 'Every club comes back when the next round starts.'
          }
        } else {
          // Predict the Table: one order all season, so the week's news is only
          // where it left you — and only when that moved.
          if (rank == null || before == null || rank === before) continue
          title = rp ? rp.charAt(0).toUpperCase() + rp.slice(1) : ordinal(rank)
          body = 'Where the real table left your prediction'
          if (before > rank) colorKey = 'success'
        }

        if (multi && body) body = `${entry.entryName} · ${body}`
        else if (multi) body = entry.entryName

        out.push({
          id: `matchweek_story-${entry.entryId}-${mw}`,
          poolId: pool.poolId,
          createdAt: week.settledAt,
          title,
          body,
          colorKey,
          meta,
        })
      }
    }
  }

  return out
}
