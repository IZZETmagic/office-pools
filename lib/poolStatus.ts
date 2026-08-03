/**
 * Single source of truth for how a pool's status is shown to a user (web).
 *
 * Mirrored by `mobile/lib/poolStatus.ts` — the two apps have separate module
 * graphs (`@/*` resolves to the repo root for web, to `mobile/` for Expo), so
 * the logic is duplicated by necessity. Keep the two in sync; the derivation
 * below is the part that must not drift.
 *
 * Replaces eight independent status->color implementations and three different
 * label strategies. See drafts/2026-07-25_pool_status_display_audit.md.
 *
 * TWO AXES, deliberately kept apart:
 *
 *   1. Lifecycle  — `pools.status` ('open' | 'completed'), optionally refined by
 *      tournament phase into "In Progress" / "Final". This is what the status
 *      badge shows.
 *   2. Join-ability — `pools.accepting_members`. NOT part of the badge: to an
 *      existing member a pool that has stopped taking joiners is still simply
 *      open. It surfaces on the join page and in pool admin instead
 *      (see `poolJoinability`).
 *
 * Conflating those two is what produced the dashboard bug fixed by migration
 * 025 — see that file's header.
 */

export type PoolStatusTone = 'green' | 'amber' | 'blue' | 'neutral'

/**
 * Where the pool's tournament sits in time. A property of the TOURNAMENT, not
 * of the pool — all pools on one tournament share it, which is why it is passed
 * in rather than stored per-pool.
 *
 * Optional throughout: omit it and the badge falls back to plain lifecycle
 * ("Open" / "Completed"), which is exactly today's behaviour. Plumbing it
 * through the call sites is a separate, deliberate step.
 */
export type TournamentPhase = 'not_started' | 'running' | 'finished'

export interface PoolStatusInput {
  status: string | null | undefined
  accepting_members?: boolean | null
}

export interface PoolStatusDisplay {
  label: string
  tone: PoolStatusTone
}

/**
 * The lifecycle badge: label + tone.
 *
 * @param pool  needs only `status`
 * @param phase omit to get plain lifecycle labels
 */
export function poolStatusDisplay(
  pool: PoolStatusInput,
  phase?: TournamentPhase,
): PoolStatusDisplay {
  const status = pool.status ?? 'open'

  // Terminal state wins: an explicitly completed pool reads "Completed" even if
  // the tournament feed still thinks matches are pending.
  if (status === 'completed') return { label: 'Completed', tone: 'neutral' }

  // Never written by any code path; handled so an unexpected legacy row cannot
  // reach the user as a raw lowercase string. See the audit doc, finding 4.
  if (status === 'upcoming') return { label: 'Upcoming', tone: 'blue' }

  if (phase === 'finished') return { label: 'Final', tone: 'blue' }
  if (phase === 'running') return { label: 'In Progress', tone: 'amber' }

  // 'open' and the legacy 'active' alias.
  return { label: 'Open', tone: 'green' }
}

/**
 * Whether the pool is over, for surfaces that swap live UI for a
 * final-standings state.
 *
 * Without a phase this is exactly `status === 'completed'`. Pass a phase and a
 * tournament whose matches have all finished also counts, which is what lets a
 * card read "final standings" during the window before auto-archive retires
 * the pool.
 */
export function isPoolFinished(pool: PoolStatusInput, phase?: TournamentPhase): boolean {
  return (pool.status ?? 'open') === 'completed' || phase === 'finished'
}

export interface PoolJoinability {
  canJoin: boolean
  /** User-facing explanation when `canJoin` is false; null otherwise. */
  reason: string | null
}

/**
 * The join-ability axis. Two independent ways a pool can refuse a joiner, with
 * distinct copy so the user is told which one applies.
 */
export function poolJoinability(pool: PoolStatusInput): PoolJoinability {
  if ((pool.status ?? 'open') === 'completed') {
    return { canJoin: false, reason: 'This pool has finished.' }
  }
  // Default true: a NULL/absent column (pre-migration row, partial select)
  // must not read as "closed".
  if (pool.accepting_members === false) {
    return { canJoin: false, reason: 'This pool is not accepting new members.' }
  }
  return { canJoin: true, reason: null }
}

// ---------------------------------------------------------------------------
// Rendering adapters. The web app draws status pills two different ways, so
// both flavours derive from the same tone rather than re-deriving from status.
// ---------------------------------------------------------------------------

type BadgeVariant =
  | 'blue' | 'green' | 'yellow' | 'red' | 'gray'
  | 'outline' | 'outline-green' | 'outline-yellow' | 'outline-gray'

/** For `<Badge variant={...}>` (components/ui/Badge.tsx). */
export function toneToBadgeVariant(tone: PoolStatusTone): BadgeVariant {
  switch (tone) {
    case 'green': return 'outline-green'
    case 'amber': return 'outline-yellow'
    case 'blue': return 'outline'
    case 'neutral': return 'outline-gray'
  }
}

/** Filled Badge variant for a tone, for status pills that are not outlines. */
export function toneToBadgeVariantSolid(tone: PoolStatusTone): BadgeVariant {
  switch (tone) {
    case 'green': return 'green'
    case 'amber': return 'yellow'
    case 'blue': return 'blue'
    case 'neutral': return 'gray'
  }
}

/**
 * For the bare Tailwind pills on pool cards.
 *
 * Uses the Badge recipe — the tone at 12% behind its -700 step — rather than a
 * pale -100 fill with a dark: override. The old pairing put text on the -400
 * step in dark mode, which is the weak end of an inverted ramp and measured
 * around 2:1; and -100 fills go near-black in dark. One class per tone now
 * covers both modes.
 */
export function toneToTagClass(tone: PoolStatusTone): string {
  switch (tone) {
    case 'green':
      return 'bg-success-600/12 text-success-700'
    case 'amber':
      return 'bg-warning-500/15 text-warning-700'
    case 'blue':
      return 'bg-primary-600/12 text-primary-700'
    case 'neutral':
      return 'bg-mist text-muted'
  }
}

/** Convenience: label + ready-to-use Tailwind classes in one call. */
export function poolStatusTag(
  pool: PoolStatusInput,
  phase?: TournamentPhase,
): { label: string; className: string } {
  const { label, tone } = poolStatusDisplay(pool, phase)
  return { label, className: toneToTagClass(tone) }
}

/**
 * Sort rank for ordering a pool list: live pools first, finished last.
 * Replaces the inline `statusOrder` map in PoolsClient.
 */
export function poolStatusSortRank(pool: PoolStatusInput): number {
  switch (pool.status ?? 'open') {
    case 'open':
    case 'active': return 0
    case 'upcoming': return 1
    case 'completed': return 3
    default: return 9
  }
}
