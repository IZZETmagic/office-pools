/**
 * Single source of truth for how a pool's status is shown to a user (mobile).
 *
 * Mirror of the web app's `lib/poolStatus.ts`. The two apps have separate
 * module graphs (`@/*` resolves to `mobile/` here, to the repo root there), so
 * this logic is duplicated by necessity — keep the derivation in
 * `poolStatusDisplay` identical in both files.
 *
 * See drafts/2026-07-25_pool_status_display_audit.md for the full rationale.
 *
 * TWO AXES, deliberately kept apart:
 *   1. Lifecycle   — `pools.status` ('open' | 'completed'), optionally refined
 *      by tournament phase. This is what the status badge shows.
 *   2. Join-ability — `pools.accepting_members`. NOT part of the badge; to an
 *      existing member a pool that has stopped taking joiners is still open.
 */

/** Matches the local BadgeTone union in components/pool-detail/PoolInfoTab.tsx. */
export type PoolStatusTone = 'green' | 'amber' | 'blue' | 'neutral';

/**
 * Where the pool's tournament sits in time. A property of the TOURNAMENT, not
 * the pool. Optional: omit it and the badge falls back to plain lifecycle
 * labels ("Open" / "Completed"), which is today's behaviour.
 */
export type TournamentPhase = 'not_started' | 'running' | 'finished';

export type PoolStatusInput = {
  status: string | null | undefined;
  acceptingMembers?: boolean | null;
};

export type PoolStatusDisplay = {
  label: string;
  tone: PoolStatusTone;
};

export function poolStatusDisplay(
  pool: PoolStatusInput,
  phase?: TournamentPhase,
): PoolStatusDisplay {
  const status = pool.status ?? 'open';

  // Terminal state wins over any tournament-feed disagreement.
  if (status === 'completed') return { label: 'Completed', tone: 'neutral' };

  // Never written by any code path; handled so an unexpected legacy row cannot
  // reach the user as a raw lowercase string.
  if (status === 'upcoming') return { label: 'Upcoming', tone: 'blue' };

  if (phase === 'finished') return { label: 'Final', tone: 'blue' };
  if (phase === 'running') return { label: 'In Progress', tone: 'amber' };

  // 'open' and the legacy 'active' alias.
  return { label: 'Open', tone: 'green' };
}

export type PoolJoinability = {
  canJoin: boolean;
  reason: string | null;
};

export function poolJoinability(pool: PoolStatusInput): PoolJoinability {
  if ((pool.status ?? 'open') === 'completed') {
    return { canJoin: false, reason: 'This pool has finished.' };
  }
  // Default true: a null/absent column must not read as "closed".
  if (pool.acceptingMembers === false) {
    return { canJoin: false, reason: 'This pool is not accepting new members.' };
  }
  return { canJoin: true, reason: null };
}
