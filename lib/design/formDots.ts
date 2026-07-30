/**
 * The five-dot form strip that appears on pool cards and leaderboard rows.
 *
 * Colours are the mode-invariant `--sp-tier-*` tokens, mirroring FORM_COLOR in
 * mobile/components/pool-detail/leaderboard-shared.tsx. Note `miss` is red rather
 * than palette.tierMiss — that is what the app actually renders, and the token is
 * unused on both platforms.
 *
 * This lived as three separate private copies (LeaderboardTab, PoolsClient,
 * DashboardClient) which had already drifted apart: two of them coloured `exact`
 * with the gold accent ramp and `winner` with primary, so the same result showed a
 * different colour depending on which screen you looked at.
 */

export type FormResult = 'exact' | 'winner_gd' | 'winner' | 'miss' | 'no_pick'

const FORM_DOT_CLASS: Record<FormResult, string> = {
  exact: 'bg-tier-exact',
  winner_gd: 'bg-tier-winner-gd',
  winner: 'bg-tier-winner',
  miss: 'bg-danger-600',
  no_pick: 'bg-silver',
}

export function getFormDotClass(type: string): string {
  return FORM_DOT_CLASS[type as FormResult] ?? FORM_DOT_CLASS.no_pick
}

/** Label for each tier, used by the leaderboard legend. */
export const FORM_LEGEND: readonly (readonly [FormResult, string])[] = [
  ['exact', 'Exact'],
  ['winner_gd', 'W+GD'],
  ['winner', 'Winner'],
  ['miss', 'Miss'],
  ['no_pick', 'No Pick'],
] as const
