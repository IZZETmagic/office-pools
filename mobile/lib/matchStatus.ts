// Single source of truth for the "abnormal status" badge shown across match
// surfaces (Next Kickoff card, results row, match detail). Pure logic — no theme
// or JSX here, so it can be unit-tested and reused everywhere.
//
// `statusDetail` is the api-football-derived reason written by the live sync
// (see lib/integrations/apiFootball/mappers.ts on the backend). "Delayed" is NOT
// a `statusDetail` value — it's derived from `originalMatchDate`, which the daily
// schedule reconcile sets when a not-yet-started kickoff moves. Keeping the two in
// separate columns means the per-minute sync and the reconcile never clobber each
// other; this helper reunites them for display.

export type StatusTone = 'amber' | 'red';

export type MatchStatusBadge = {
  label: string;
  tone: StatusTone;
  /** True when a countdown / kickoff time is meaningless (no known time). */
  hidesCountdown: boolean;
};

export type MatchStatusInput = {
  status?: string | null;
  statusDetail?: string | null;
  originalMatchDate?: string | null;
};

const DETAIL: Record<string, MatchStatusBadge> = {
  postponed: { label: 'Postponed', tone: 'amber', hidesCountdown: true },
  tbd: { label: 'Time TBD', tone: 'amber', hidesCountdown: true },
  cancelled: { label: 'Cancelled', tone: 'red', hidesCountdown: true },
  abandoned: { label: 'Abandoned', tone: 'red', hidesCountdown: true },
  suspended: { label: 'Suspended', tone: 'amber', hidesCountdown: false },
  interrupted: { label: 'Interrupted', tone: 'amber', hidesCountdown: false },
  awarded: { label: 'Awarded', tone: 'amber', hidesCountdown: true },
  walkover: { label: 'Walkover', tone: 'amber', hidesCountdown: true },
};

/**
 * Resolve the status badge to show for a match, or null when it's a normal
 * scheduled/live/finished match with nothing to flag.
 *
 * Precedence: an explicit api-football `statusDetail` (postponed/suspended/…)
 * wins; otherwise a moved kickoff (`originalMatchDate` set) on a not-yet-started
 * match surfaces as "Delayed".
 */
export function getMatchStatusBadge(m: MatchStatusInput): MatchStatusBadge | null {
  const detail = m.statusDetail ? DETAIL[m.statusDetail] : undefined;
  if (detail) return detail;

  const notStarted = !m.status || m.status === 'scheduled';
  if (m.originalMatchDate && notStarted) {
    return { label: 'Delayed', tone: 'amber', hidesCountdown: false };
  }
  return null;
}

export type LiveClockInput = {
  status?: string | null;
  livePeriod?: string | null;
  liveMinute?: number | null;
  liveAdded?: number | null;
};

/**
 * Short live-clock token for a match. Driven by `live_minute`/`live_period`/`live_added`,
 * written by the sync:
 *   - 1H/2H: the running minute ("67'"). At the end of a half the minute holds at
 *     45'/90' and any stoppage is appended on top ("45+2'").
 *   - ET (extra time): "ET" plus the running minute, which keeps counting 91'→120'
 *     ("ET 105'"), with stoppage appended the same way ("ET 105+2'").
 *   - HT / PENS: the phase label alone.
 * Null when the match isn't live (or has no minute yet).
 */
export function getLiveClock(m: LiveClockInput): string | null {
  if (m.status !== 'live') return null;
  switch (m.livePeriod) {
    case 'HT':
      return 'HT';
    case 'PEN':
      return 'PENS';
    case 'ET':
      // Extra time keeps counting up (91'→120'); show it. Null-guard the brief
      // break between ET halves, where no running minute is reported.
      return m.liveMinute != null ? `ET ${withStoppage(m.liveMinute, m.liveAdded)}` : 'ET';
    default:
      return m.liveMinute != null ? withStoppage(m.liveMinute, m.liveAdded) : null;
  }
}

/**
 * The minute token, with end-of-half stoppage appended when present:
 * (45, 2) → "45+2'"; (67, null) → "67'".
 */
function withStoppage(minute: number, added: number | null | undefined): string {
  return added != null && added > 0 ? `${minute}+${added}'` : `${minute}'`;
}
