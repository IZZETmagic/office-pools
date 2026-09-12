/**
 * Which matchweek a new league pool starts from — the options, and how they
 * read on screen.
 *
 * ## Why this exists
 *
 * Migration 143. Both wizards used to ask for a DATE, title the step "First
 * matchweek deadline", and then discard it for every league mode except table.
 * A pool created the night before a Saturday with matchweek 5 chosen started in
 * matchweek 4 — and in Last Man Standing, starting a week early means being
 * eliminated in a week you were never shown a picker for.
 *
 * The fix is to ask the question the admin was actually answering. They are not
 * setting a clock; they are saying *when does my group start playing*. A
 * matchweek is that answer, and the lock time is the information they need to
 * judge whether their friends have enough notice.
 *
 * ## Pure on purpose
 *
 * Every function here takes its rows and its `now`. `mobile/lib/createPool.ts`
 * carries a mirror of `startMatchweekOptions` — mobile is a separate npm
 * project that cannot resolve this path — and `mobile/lib/__tests__` pins the
 * two to the same expectations. ⚠ A change here is a change there.
 */

/** A `league_matchweeks` row, reduced to what the chooser needs. */
export type StartMatchweekRow = {
  number: number
  label: string | null
  lockAt: string
}

export type StartMatchweekOption = {
  number: number
  /** "Matchweek 5", or the season's own label when it has one. */
  title: string
  /** The ISO instant picks close. `lock_at`, never `first_kickoff_at`. */
  lockAt: string
  /**
   * Is this the week that is open right now?
   *
   * ⚠ It is the EARLIEST option, not a separate test. The query that feeds this
   * already filters to unlocked weeks with fixtures, so the first row is the
   * open one by construction — the same definition `openMatchweekId` uses.
   */
  isOpenNow: boolean
  /** "today", "tomorrow", "in 6 days" — the bit that answers "is that enough time". */
  closesIn: string
}

/**
 * Whole days from `now` until `at`, rounded DOWN.
 *
 * ⚠ Floored, not rounded. "in 1 day" for something 44 hours away overstates the
 * notice a group has; understating it is the safe direction when the whole
 * point of the screen is deciding whether there is enough time.
 */
function wholeDaysUntil(at: number, now: number): number {
  return Math.floor((at - now) / 86_400_000)
}

/**
 * How soon picks close, in words.
 *
 * ⚠ "today" rather than "in 0 days", and it does NOT claim an hour. The lock is
 * an hour before the first kickoff (migration 101) and the exact instant is
 * printed beside this by the caller — this line is the at-a-glance version.
 */
export function closesInLabel(lockAt: string, now: number): string {
  const at = new Date(lockAt).getTime()
  if (Number.isNaN(at)) return ''
  if (at <= now) return 'closed'
  const days = wholeDaysUntil(at, now)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

/**
 * The matchweeks a pool being created right now may start from.
 *
 * ⚠ ROWS MUST ALREADY BE THE UNLOCKED, NON-EMPTY ONES, in lock order — that is
 * the create route's own definition of "still open" and re-implementing it here
 * would be a second copy of Decision 16. This function orders and labels; it
 * does not decide eligibility.
 *
 * ⚠ A locked row that slips through is DROPPED rather than shown disabled. The
 * wizard can sit open across a lock, and a greyed row invites the question
 * "why can't I pick that" for a week the answer is simply "it started".
 */
export function startMatchweekOptions(
  rows: StartMatchweekRow[],
  now: number,
  limit = 4,
): StartMatchweekOption[] {
  const live = rows
    .filter((r) => {
      const at = new Date(r.lockAt).getTime()
      return !Number.isNaN(at) && at > now
    })
    .sort((a, b) => new Date(a.lockAt).getTime() - new Date(b.lockAt).getTime())
    .slice(0, limit)

  return live.map((r, i) => ({
    number: r.number,
    title: r.label ?? `Matchweek ${r.number}`,
    lockAt: r.lockAt,
    isOpenNow: i === 0,
    closesIn: closesInLabel(r.lockAt, now),
  }))
}

/**
 * The option a wizard should land on.
 *
 * ⚠ THE OPEN ONE, which is what the product did before 143 and what somebody
 * setting up on a quiet Tuesday wants. Defaulting to the SECOND week would fix
 * Ryan's Saturday and break every ordinary creation, and it would also be us
 * deciding how much notice his friends need — which is the decision this screen
 * exists to hand back to him.
 */
export function defaultStartMatchweek(options: StartMatchweekOption[]): number | null {
  return options[0]?.number ?? null
}

/**
 * The instant picks close, as an admin reads it.
 *
 * ⚠ DEVICE-LOCAL, deliberately, like every other time in this product
 * (`match_time_timezone`). The admin is judging whether their friends have
 * enough notice, and "Friday 3:00 PM" only answers that in the reader's own
 * zone. No timezone suffix: adding one invites the reading that the OTHER times
 * on screen are in some different zone.
 */
export function formatLockInstant(lockAt: string): string {
  const d = new Date(lockAt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
