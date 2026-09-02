// Human-readable tournament stage labels, shared by the home cards and the
// match-detail header so wording stays consistent (e.g. 'round_16' → 'Round of 16'
// instead of the raw enum). Group matches show "Group X" only where the caller has
// the group letter (match detail); the cards fall back to "Group Stage".

/**
 * @param roundNumber the MATCHWEEK, for a league fixture — and without it this
 *   function renders **"Regular Season"** on the Live and Next Kickoff cards and
 *   in the match-detail header.
 *
 *   ⚠ That is not a cosmetic miss. `regular_season` is a value the league
 *   adapter invents; `matches_stage_check` does not admit it and `STAGE_LABELS`
 *   was never going to hold it, so it fell to the default branch and a member
 *   read a database enum. The web hit exactly this and fixed it the same way —
 *   `getStageLabel` in `app/pools/[pool_id]/results/MatchCard.tsx` — and the two
 *   surfaces must say the same words: "Matchweek 12", on both.
 */
export function formatStageLabel(
  stage: string | null | undefined,
  roundNumber?: number | null,
): string {
  switch (stage) {
    case 'regular_season':
      return roundNumber ? `Matchweek ${roundNumber}` : 'Regular Season';
    case 'group':
      return 'Group Stage';
    case 'round_32':
    case 'round_of_32':
      return 'Round of 32';
    case 'round_16':
    case 'round_of_16':
      return 'Round of 16';
    case 'quarter_final':
      return 'Quarter Finals';
    case 'semi_final':
      return 'Semi Finals';
    case 'third_place':
      return 'Third Place';
    case 'final':
      return 'Final';
    default:
      return (stage ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
