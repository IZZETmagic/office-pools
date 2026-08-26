/**
 * The last tiebreak the feed does not do: alphabetical, among clubs that are
 * genuinely level.
 *
 * ## What this is allowed to touch, and what it is not
 *
 * The league table is INGESTED, never derived (migration 075). That rule exists
 * because a table computed from our own fixtures cannot see points deductions —
 * Everton were docked ten points and then eight in 2023/24, and a derived table
 * would have shown them ten places too high all season.
 *
 * This does not derive anything. It reorders rows the feed has already placed
 * ADJACENTLY and which are identical on every column we ingest. Points, goal
 * difference, goals for, goals against and played must all match before two
 * clubs are considered swappable — so a deducted club, whose points differ by
 * definition, can never be inside a tie group. The safety property is
 * structural rather than remembered.
 *
 * ## Why alphabetical
 *
 * The Premier League's competitive tiebreak is points → goal difference →
 * goals scored → head-to-head points → away goals → a playoff, and alphabetical
 * order is nowhere in it. But that decides who WINS a contested place; a
 * published table still has to print a deterministic order for clubs the
 * rulebook considers level, and the official Premier League app uses
 * alphabetical for exactly this case (Ryan, 2026-08-25). Matching it means our
 * table agrees with the one members are checking on their phones.
 *
 * ## ⚠ The case this gets wrong
 *
 * If api-football separated two clubs on HEAD-TO-HEAD — which it may, and which
 * we do not ingest — every column we can see is still equal, so this will
 * reorder them and undo a correct decision. That is a real cost, accepted
 * knowingly:
 *
 *   * head-to-head only applies once the two clubs have played each other,
 *   * and the rulebook only reaches for it when the position decides the title,
 *     a European place or relegation.
 *
 * So it is wrong rarely, late, and only where the ordering is contested anyway.
 * If that becomes the deciding factor at a season end, the fix is to ingest the
 * head-to-head result and skip the group — not to abandon the tiebreak.
 */

export type OrderableStanding = {
  club_name: string
  rank: number
  points: number
  goals_diff: number
  goals_for: number
  goals_against: number
  played: number
}

/** Every ingested figure must match before two clubs are considered level. */
function isLevel(a: OrderableStanding, b: OrderableStanding): boolean {
  return (
    a.points === b.points &&
    a.goals_diff === b.goals_diff &&
    a.goals_for === b.goals_for &&
    a.goals_against === b.goals_against &&
    a.played === b.played
  )
}

/**
 * Rows in the feed's order, with each run of level clubs sorted by name.
 *
 * The rank NUMBERS stay where they were — a group holding 7 and 8 still shows 7
 * and 8, just against different clubs. Renumbering would be deriving rank,
 * which is the thing that is not allowed.
 *
 * Input is not mutated; callers hold the array from the server read.
 */
export function orderStandings<T extends OrderableStanding>(rows: readonly T[]): T[] {
  const out: T[] = []

  for (let i = 0; i < rows.length; ) {
    // Extend the run while the next row is level with the FIRST of the group.
    // Comparing against the first, not the previous, keeps the relation an
    // equivalence — chaining on the previous row could walk a group across
    // clubs that are not level with each other.
    let j = i + 1
    while (j < rows.length && isLevel(rows[i], rows[j])) j++

    if (j - i === 1) {
      out.push(rows[i])
    } else {
      const group = rows.slice(i, j)
      // The positions this group occupies, kept in ascending order so the
      // numbers read 7, 8, 9 whatever the clubs turn out to be.
      const ranks = group.map((r) => r.rank).sort((a, b) => a - b)
      const sorted = [...group].sort((a, b) => a.club_name.localeCompare(b.club_name))
      sorted.forEach((row, k) => out.push({ ...row, rank: ranks[k] }))
    }
    i = j
  }

  return out
}
