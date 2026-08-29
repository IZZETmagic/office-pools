// =============================================================
// The round that locks long before most of it is played
// =============================================================
// A matchweek locks at its EARLIEST kickoff, because every fixture in it must
// be picked before any of them is played. Almost always the round is a weekend
// and that is a distinction without a difference.
//
// Sometimes it is not. La Liga 2026/27 matchweek 6 holds *Real Sociedad v Celta
// Vigo* on 3 September and its other nine fixtures on 16 September — so the
// round closes **thirteen days** before nine of its ten games. The member is
// asked for ten predictions, told the deadline is Thursday, and nine of those
// games are a fortnight away.
//
// Nothing here is broken. `lock_at` is correct, `league_open_matchweek` is
// correct, and `planRehome` deliberately leaves a pulled-ahead fixture where it
// is rather than adding it to a week people have already finished picking. What
// is missing is that the screen never SAYS so.
//
// ## Measured, not assumed
//
// Across both live seasons on 2026-08-28:
//
//   Premier League   0 of 38 rounds        worst lead 1.3 days
//   La Liga          3 of 38 rounds (1,2,6) worst lead 12.8, average 6.1
//
// `lib/league/rehome.ts` measured three real Premier League seasons at "a
// median 6 days of picking time" for this, so the COST per occurrence is the
// same in both countries — it is the FREQUENCY that differs, roughly 3x. And
// 3-of-38 is a floor: the feed publishes reschedules progressively, so March's
// are not set yet.
//
// ## Why a threshold of two days, and why the median
//
// The median is the bulk of the round and is unmoved by one outlier; the mean
// would be dragged by the very fixture being detected. Two days clears an
// ordinary Friday-to-Sunday weekend — the shape of nearly every round — without
// needing to know which days a given league plays on, so it holds for a
// Saturday league and a Sunday one alike.

/** What a member needs told, or null when the round is an ordinary weekend. */
export type EarlyKickoff = {
  /** Fixtures played more than two days before the rest. */
  count: number
  /** When the bulk of the round is actually played. */
  bulkAt: string
  /** Whole days between the deadline and the bulk. */
  leadDays: number
}

/** Anything under this is a normal weekend spread, not an early fixture. */
const EARLY_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000

export function earlyKickoff(kickoffs: ReadonlyArray<string>): EarlyKickoff | null {
  const times = kickoffs
    .map((k) => Date.parse(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  if (times.length < 3) return null // too few to have a "bulk"

  // Lower median on an even count: with 1 early and 9 together, either middle
  // value sits in the bulk, and the lower one is the more conservative claim.
  const bulk = times[Math.floor((times.length - 1) / 2)]
  const first = times[0]
  const lead = bulk - first
  if (lead < EARLY_THRESHOLD_MS) return null

  const count = times.filter((t) => t < bulk - EARLY_THRESHOLD_MS).length
  if (count === 0) return null

  return {
    count,
    bulkAt: new Date(bulk).toISOString(),
    leadDays: Math.round(lead / 86_400_000),
  }
}
