// Web port of mobile/lib/matchStatus.ts — single source of truth for the live
// clock token and the "abnormal status" badge shown across web match surfaces.
// Pure logic (no JSX/theme) so it matches the mobile implementation exactly and
// can be reused everywhere. Keep in sync with the mobile copy.
//
// `statusDetail` is the api-football-derived reason written by the live sync
// (see lib/integrations/apiFootball/mappers.ts). "Delayed" is NOT a
// `statusDetail` value — it's derived from `originalMatchDate`, which the daily
// schedule reconcile sets when a not-yet-started kickoff moves. Keeping the two
// in separate columns means the per-minute sync and the reconcile never clobber
// each other; this helper reunites them for display.

export type StatusTone = 'amber' | 'red'

export type MatchStatusBadge = {
  label: string
  tone: StatusTone
  /** True when a countdown / kickoff time is meaningless (no known time). */
  hidesCountdown: boolean
}

export type MatchStatusInput = {
  status?: string | null
  statusDetail?: string | null
  originalMatchDate?: string | null
}

const DETAIL: Record<string, MatchStatusBadge> = {
  postponed: { label: 'Postponed', tone: 'amber', hidesCountdown: true },
  tbd: { label: 'Time TBD', tone: 'amber', hidesCountdown: true },
  cancelled: { label: 'Cancelled', tone: 'red', hidesCountdown: true },
  abandoned: { label: 'Abandoned', tone: 'red', hidesCountdown: true },
  suspended: { label: 'Suspended', tone: 'amber', hidesCountdown: false },
  interrupted: { label: 'Interrupted', tone: 'amber', hidesCountdown: false },
  awarded: { label: 'Awarded', tone: 'amber', hidesCountdown: true },
  walkover: { label: 'Walkover', tone: 'amber', hidesCountdown: true },
}

/**
 * Resolve the status badge to show for a match, or null when it's a normal
 * scheduled/live/finished match with nothing to flag.
 *
 * Precedence: an explicit api-football `statusDetail` (postponed/suspended/…)
 * wins; otherwise a moved kickoff (`originalMatchDate` set) on a not-yet-started
 * match surfaces as "Delayed".
 */
export function getMatchStatusBadge(m: MatchStatusInput): MatchStatusBadge | null {
  const detail = m.statusDetail ? DETAIL[m.statusDetail] : undefined
  if (detail) return detail

  const notStarted = !m.status || m.status === 'scheduled'
  if (m.originalMatchDate && notStarted) {
    return { label: 'Delayed', tone: 'amber', hidesCountdown: false }
  }
  return null
}

export type LiveClockInput = {
  status?: string | null
  livePeriod?: string | null
  liveMinute?: number | null
}

/**
 * Short live-clock token for a match: the running minute ("45'") during 1H/2H,
 * or the phase — "HT", "ET", "PENS" — otherwise. Null when the match isn't live
 * (or has no minute yet). Driven by `live_minute`/`live_period`, written by the
 * sync.
 */
export function getLiveClock(m: LiveClockInput): string | null {
  if (m.status !== 'live') return null
  switch (m.livePeriod) {
    case 'HT':
      return 'HT'
    case 'ET':
      return 'ET'
    case 'PEN':
      return 'PENS'
    default:
      return m.liveMinute != null ? `${m.liveMinute}'` : null
  }
}
