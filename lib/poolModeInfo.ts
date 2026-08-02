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

export type PredictionMode = 'full_tournament' | 'progressive' | 'bracket_picker'

export type PoolModeInfo = {
  label: string
  /** One sentence: what the player is being asked to do. */
  summary: string
  /** The three things that most change how the mode feels to play. */
  points: string[]
}

export const POOL_MODE_INFO: Record<PredictionMode, PoolModeInfo> = {
  full_tournament: {
    label: 'Full Tournament',
    summary: 'Members predict a score for every match in the tournament, all in one sitting.',
    points: [
      'One deadline covers the whole tournament.',
      'All 104 matches — 48 in the group stage, then every knockout round.',
      'Submitting locks the entry. You can unlock it for someone from the Members tab.',
    ],
  },
  progressive: {
    label: 'Progressive',
    summary: 'Members predict round by round, as the tournament unfolds.',
    points: [
      'Every round has its own deadline, set in the Rounds tab.',
      'Knockout rounds show the teams that actually qualified — nobody has to guess who got through.',
      'Drafts save as members type, and are submitted automatically when a deadline passes.',
    ],
  },
  bracket_picker: {
    label: 'Bracket Picker',
    summary: 'Members build a full bracket before kick-off, then watch it play out.',
    points: [
      'Rank all four teams in each of the 12 groups.',
      'Rank the 12 third-place teams — 8 qualify, 4 go out.',
      'Pick the winner of every knockout match through to the final.',
    ],
  },
}
