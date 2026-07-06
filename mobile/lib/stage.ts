// Human-readable tournament stage labels, shared by the home cards and the
// match-detail header so wording stays consistent (e.g. 'round_16' → 'Round of 16'
// instead of the raw enum). Group matches show "Group X" only where the caller has
// the group letter (match detail); the cards fall back to "Group Stage".

export function formatStageLabel(stage: string | null | undefined): string {
  switch (stage) {
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
