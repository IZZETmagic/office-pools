/**
 * What each prediction mode actually asks of a player.
 *
 * The wording is taken from HowToPlayTab, which is where these mechanics are
 * already explained to players — this is a condensed restatement, not a second
 * source of truth. If the rules change, HowToPlayTab is the file to check
 * against; the two should not be allowed to drift.
 *
 * Labels are duplicated as `MODE_LABELS` in several tabs (PoolInfoTab,
 * MembersTab, PointsBreakdownModal, and others). Those are left alone here —
 * consolidating them is a separate sweep — but new callers should prefer this.
 */

// The copy in this file describes the three bracket modes only; a league has its
// own explainer. Re-exported under the historical name so the ~10 importers of
// `poolModeInfo`'s PredictionMode keep working.
import type { BracketPredictionMode } from './predictionMode'
export type PredictionMode = BracketPredictionMode

export type PoolModeInfo = {
  label: string
  /**
   * One sentence: what the player is being asked to do. Kept short on purpose —
   * the Settings Pool Mode card pairs it with `points` inside a card that has
   * to stay level with Share & Invite beside it. Lengthen `description`
   * instead.
   */
  summary: string
  /** The fuller explanation, for surfaces with room to run (Pool Info). */
  description: string
  /** The three things that most change how the mode feels to play. */
  points: string[]
}

export const POOL_MODE_INFO: Record<PredictionMode, PoolModeInfo> = {
  full_tournament: {
    label: 'Full Tournament',
    summary: 'Members predict a score for every match in the tournament, all in one sitting.',
    description:
      'Everyone fills in a predicted score for every match — the full group stage and then ' +
      'each knockout round — and it all rides on a single deadline before the tournament ' +
      'starts. Submitting locks an entry, though you can unlock one from the Members tab if ' +
      'somebody needs to fix a mistake. Each match is scored on a tier: the exact score is ' +
      'worth most, then the right winner and goal difference, then just the right result. ' +
      'Knockout rounds are multiplied, so a game late in the bracket is worth several group ' +
      'matches.',
    points: [
      'One deadline covers the whole tournament.',
      'All 104 matches — 48 in the group stage, then every knockout round.',
      'Submitting locks the entry. You can unlock it for someone from the Members tab.',
    ],
  },
  progressive: {
    label: 'Progressive',
    summary: 'Members predict round by round, as the tournament unfolds.',
    description:
      'Predictions open one round at a time and follow the tournament as it happens, so ' +
      'nobody has to call the whole thing in advance. Each round carries its own deadline, ' +
      'set in the Rounds tab, and members are notified when a round opens. Knockout rounds ' +
      'show the teams that actually qualified, so the guesswork is about the score rather ' +
      'than who got through. Drafts save as members type and are submitted for them when a ' +
      'deadline passes.',
    points: [
      'Every round has its own deadline, set in the Rounds tab.',
      'Knockout rounds show the teams that actually qualified — nobody has to guess who got through.',
      'Drafts save as members type, and are submitted automatically when a deadline passes.',
    ],
  },
  bracket_picker: {
    label: 'Bracket Picker',
    summary: 'Members build a full bracket before kick-off, then watch it play out.',
    description:
      'No scorelines in this one — it is all about who goes through. Members rank all four ' +
      'teams in each of the twelve groups, rank the twelve third-place teams to say which ' +
      'eight qualify and which four go out, then pick the winner of every knockout match ' +
      'through to the final. Changing an early pick reshapes everything after it. The whole ' +
      'bracket is submitted before kick-off and then plays out on its own, with later rounds ' +
      'worth more than early ones.',
    points: [
      'Rank all four teams in each of the 12 groups.',
      'Rank the 12 third-place teams — 8 qualify, 4 go out.',
      'Pick the winner of every knockout match through to the final.',
    ],
  },
}
