/**
 * Human wording for a bonus row.
 *
 * Normally the stored `description` is already prose and is returned untouched.
 * The exception is group-standings rows coming from the shadow scoring engine:
 * `lib/migrations/028_shadow_podium_use_view.sql` builds them as
 *
 *     ('Group '||gp.group_letter||': '||x.bt)
 *
 * where `x.bt` is the bonus-type enum, so the breakdown reads
 * "Group A: both_qualify_swapped". The legacy `bonus_scores` table had proper
 * sentences here (`lib/bonusCalculation.ts`), and every other shadow category
 * still does — group_standings is the only one that regressed, and only when
 * the read cutover pointed every pool at the shadow table.
 *
 * This rewrites the enum for display. It is a stopgap, not the fix: the wording
 * belongs in the SQL that writes the column, because the React Native app reads
 * the same field and shows the same raw text, and because the team name the old
 * sentence carried ("Correct winner (Mexico)") cannot be recovered here.
 */

/** Only the exact shadow shape — anything already prose is left alone. */
const RAW_ENUM_DESCRIPTION = /^Group [A-Z]: [a-z_]+$/

const GROUP_STANDINGS_LABEL: Record<string, string> = {
  group_winner_and_runnerup: 'Correct winner and runner-up',
  group_winner_only: 'Correct winner',
  group_runnerup_only: 'Correct runner-up',
  both_qualify_swapped: 'Both qualified, positions swapped',
  one_qualifies_wrong_position: 'One qualifier, wrong position',
}

export type BonusDescriptionInput = {
  bonus_type: string
  related_group_letter: string | null
  description: string
}

export function formatBonusDescription(bs: BonusDescriptionInput): string {
  if (!bs.description || !RAW_ENUM_DESCRIPTION.test(bs.description)) return bs.description

  const label = GROUP_STANDINGS_LABEL[bs.bonus_type]
  if (!label) {
    // An unmapped type still beats an underscored enum: "both_qualify_swapped"
    // reads as "Both qualify swapped" rather than leaking the identifier.
    const words = bs.bonus_type.replace(/_/g, ' ')
    const sentence = words.charAt(0).toUpperCase() + words.slice(1)
    return bs.related_group_letter ? `Group ${bs.related_group_letter}: ${sentence}` : sentence
  }

  return bs.related_group_letter ? `Group ${bs.related_group_letter}: ${label}` : label
}
