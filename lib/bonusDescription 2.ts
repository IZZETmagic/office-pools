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

import { ROUND_LABELS, type RoundKey } from '@/lib/tournament'

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

/**
 * The fixture a bracket bonus was earned on, resolved by the caller from
 * `related_match_id`. Both bracket bonus types store a single fixed sentence
 * — "Correct match winner", "R32 correct pairing" — so on their own they can't
 * tell you *which* match or *who*. Every one of those rows carries a
 * `related_match_id`, and the breakdown already holds the tournament's matches,
 * so the detail is recoverable at display time without touching the column.
 */
export type BonusMatchContext = {
  matchNumber: number
  stage: string
  homeTeam: string | null
  awayTeam: string | null
  winnerTeam: string | null
}

function matchPrefix(m: BonusMatchContext): string {
  const round = ROUND_LABELS[m.stage as RoundKey]
  return round ? `Match ${m.matchNumber}, ${round}` : `Match ${m.matchNumber}`
}

export function formatBonusDescription(
  bs: BonusDescriptionInput,
  match?: BonusMatchContext | null,
): string {
  // Bracket bonuses: name the fixture and the teams. Falls through to the
  // stored sentence whenever the match can't be resolved, so a missing lookup
  // degrades to today's wording rather than to a blank or a half-sentence.
  if (match) {
    if (bs.bonus_type === 'match_winner_correct' && match.winnerTeam) {
      return `${matchPrefix(match)}: Correct winner — ${match.winnerTeam}`
    }
    if (bs.bonus_type === 'correct_bracket_pairing' && match.homeTeam && match.awayTeam) {
      return `${matchPrefix(match)}: Correct pairing — ${match.homeTeam} v ${match.awayTeam}`
    }
  }

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
