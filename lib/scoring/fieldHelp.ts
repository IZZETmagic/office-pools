/**
 * Plain-English explanations for every configurable scoring value.
 *
 * Keyed by the `pool_settings` column so there is one description per stored
 * field and no chance of a label drifting away from what it configures. Written
 * against lib/bonusCalculation.ts and lib/scoring rather than from the field
 * names, because several names do not say what they do — see the notes on
 * bonus_all_16_qualified and bonus_correct_bracket_pairing below.
 *
 * Keep these to two short sentences: what it rewards, then when it is awarded.
 */

export type FieldHelp = { title: string; body: string }

export const SCORING_FIELD_HELP: Record<string, FieldHelp> = {
  // ── Base match points ───────────────────────────────────────────────────
  group_exact_score: {
    title: 'Exact Score',
    body: 'The full-time score matched exactly. If the match ends 2–1 and that is what was predicted, this is what it pays. Only the highest tier a prediction reaches is awarded — an exact score does not also earn the two below it.',
  },
  group_correct_difference: {
    title: 'Correct Winner + Goal Difference',
    body: 'The right winner and the right margin, but not the exact score. Predicting 3–2 on a 2–1 result earns this. Awarded instead of Exact Score, not on top of it.',
  },
  group_correct_result: {
    title: 'Correct Winner Only',
    body: 'The right winner or a correctly called draw, with the margin wrong. Predicting 2–0 on a 2–1 result earns this. It is the lowest of the three tiers and only one applies.',
  },
  knockout_exact_score: {
    title: 'Exact Score (Knockout)',
    body: 'The same exact-score tier as the group stage, but for knockout matches, where a separate base value lets later rounds be worth more. This figure is then multiplied by the round multiplier.',
  },
  knockout_correct_difference: {
    title: 'Correct Winner + Goal Difference (Knockout)',
    body: 'Right winner and right margin in a knockout match. Multiplied by the round multiplier, so the same prediction pays more in a Final than a Round of 32.',
  },
  knockout_correct_result: {
    title: 'Correct Winner Only (Knockout)',
    body: 'Right winner, wrong margin, in a knockout match. Scored on the result after extra time; a shootout is handled separately.',
  },

  // ── Multipliers ─────────────────────────────────────────────────────────
  round_32_multiplier: {
    title: 'Round of 32 Multiplier',
    body: 'Multiplies the knockout base points for every Round of 32 match. At 1× a correct call is worth exactly the base value.',
  },
  round_16_multiplier: {
    title: 'Round of 16 Multiplier',
    body: 'Multiplies the knockout base points for Round of 16 matches. Raising it makes the later rounds decide more of the leaderboard.',
  },
  quarter_final_multiplier: {
    title: 'Quarter Final Multiplier',
    body: 'Multiplies the knockout base points for Quarter Final matches.',
  },
  semi_final_multiplier: {
    title: 'Semi Final Multiplier',
    body: 'Multiplies the knockout base points for Semi Final matches. Worth checking this is not below the Quarter Final — the shipped defaults have it lower, which makes a semi worth less than a quarter.',
  },
  third_place_multiplier: {
    title: 'Third Place Multiplier',
    body: 'Multiplies the knockout base points for the third-place play-off.',
  },
  final_multiplier: {
    title: 'Final Multiplier',
    body: 'Multiplies the knockout base points for the Final. Usually the highest, so the last match still matters to the standings.',
  },

  // ── Penalty shootout ────────────────────────────────────────────────────
  pso_exact_score: {
    title: 'Exact Shootout Score',
    body: 'The shootout ended exactly as predicted, for example 4–3. Added on top of whatever the full-time score earned, and only for knockout matches that actually reach penalties.',
  },
  pso_correct_difference: {
    title: 'Shootout Winner + Margin',
    body: 'The right shootout winner and the right margin, but not the exact score. Awarded instead of the exact tier.',
  },
  pso_correct_result: {
    title: 'Shootout Winner Only',
    body: 'The right team went through on penalties, margin wrong. The lowest of the three shootout tiers.',
  },

  // ── Group standings bonus ───────────────────────────────────────────────
  bonus_group_winner_and_runnerup: {
    title: 'Winner and Runner-up',
    body: 'Both of a group’s top two called in the right order. Checked once per group after all six of its matches finish, and only one standings bonus is awarded per group — this one wins over the others.',
  },
  bonus_group_winner_only: {
    title: 'Winner Only',
    body: 'The group winner was right but the runner-up was not. Awarded per group, and only when the top two were not both correct.',
  },
  bonus_group_runnerup_only: {
    title: 'Runner-up Only',
    body: 'The runner-up was right but the winner was not. Awarded per group, and ranks below getting the winner right.',
  },
  bonus_both_qualify_swapped: {
    title: 'Both Qualified, Order Swapped',
    body: 'The right two teams went through but first and second were the wrong way round. Ranks just below getting both in the right order.',
  },
  bonus_one_qualifies_wrong_position: {
    title: 'One Qualifier, Wrong Position',
    body: 'One of the two teams called does go through, but in the other position. The smallest of the group standings bonuses, awarded when nothing above it applies.',
  },

  // ── Overall qualification bonus ─────────────────────────────────────────
  bonus_all_16_qualified: {
    title: 'Every Qualifier Correct',
    body: 'All 32 teams reaching the knockout stage were predicted. Awarded once, after every group match is complete. The column name says 16 — it dates from the old 32-team format and the threshold now scales to the full field.',
  },
  bonus_12_15_qualified: {
    title: '75% of Qualifiers Correct',
    body: 'At least three quarters of the teams that reached the knockout stage were predicted. Awarded once, and only when the full set was not correct.',
  },
  bonus_8_11_qualified: {
    title: '50% of Qualifiers Correct',
    body: 'At least half the teams that reached the knockout stage were predicted. The lowest qualification tier, and only one of the three is ever awarded.',
  },

  // ── Knockout & tournament bonus ─────────────────────────────────────────
  bonus_correct_bracket_pairing: {
    title: 'Correct Bracket Pairing',
    body: 'A Round of 32 tie whose two teams were both predicted to meet there, in either order. Paid per matching tie, so it can be earned up to sixteen times.',
  },
  bonus_match_winner_correct: {
    title: 'Correct Knockout Winner',
    body: 'The team predicted to go through from a knockout tie did go through. Paid per tie across every knockout round, on top of the match score points.',
  },
  bonus_champion_correct: {
    title: 'Champion',
    body: 'The tournament winner was predicted. Awarded once, from the completed final rather than a manually set result.',
  },
  bonus_second_place_correct: {
    title: 'Runner-up',
    body: 'The losing finalist was predicted. Awarded once, and independently of the champion bonus.',
  },
  bonus_third_place_correct: {
    title: 'Third Place',
    body: 'The winner of the third-place play-off was predicted. Awarded once.',
  },

  // ── Bracket picker ──────────────────────────────────────────────────────
  bp_group_correct_1st: {
    title: 'Correct 1st Place',
    body: 'A team placed first in its group finished first. Scored per team, so with twelve groups this can be earned twelve times.',
  },
  bp_group_correct_2nd: {
    title: 'Correct 2nd Place',
    body: 'A team placed second in its group finished second. Scored per team, per group.',
  },
  bp_group_correct_3rd: {
    title: 'Correct 3rd Place',
    body: 'A team placed third in its group finished third. Scored per team, per group.',
  },
  bp_group_correct_4th: {
    title: 'Correct 4th Place',
    body: 'A team placed last in its group finished last. Scored per team, per group.',
  },
  bp_third_correct_qualifier: {
    title: 'Correct Qualifier',
    body: 'A third-placed team backed to advance did advance. Eight of the twelve third-placed teams go through.',
  },
  bp_third_correct_eliminated: {
    title: 'Correct Elimination',
    body: 'A third-placed team backed to go out did go out. The four that do not advance.',
  },
  bp_third_all_correct_bonus: {
    title: 'All Eight Correct',
    body: 'Every one of the eight advancing third-placed teams was called. Awarded once, on top of the individual picks.',
  },
  bp_r32_correct: {
    title: 'Round of 32',
    body: 'Points for each Round of 32 tie whose winner was picked correctly.',
  },
  bp_r16_correct: {
    title: 'Round of 16',
    body: 'Points for each Round of 16 tie whose winner was picked correctly.',
  },
  bp_qf_correct: {
    title: 'Quarter Finals',
    body: 'Points for each Quarter Final whose winner was picked correctly.',
  },
  bp_sf_correct: {
    title: 'Semi Finals',
    body: 'Points for each Semi Final whose winner was picked correctly.',
  },
  bp_third_place_match_correct: {
    title: 'Third Place Match',
    body: 'Points for picking the winner of the third-place play-off.',
  },
  bp_final_correct: {
    title: 'Final',
    body: 'Points for picking the winner of the Final. Usually the largest, since a bracket that survives to here got everything before it right.',
  },
  bp_champion_bonus: {
    title: 'Champion Bonus',
    body: 'An extra award on top of the Final for calling the tournament winner.',
  },
  bp_penalty_correct: {
    title: 'Penalty Prediction',
    body: 'Points for calling that a tie would be decided on penalties.',
  },
}

/** Help for a settings column, or null when it has none. */
export function fieldHelp(key: string): FieldHelp | null {
  return SCORING_FIELD_HELP[key] ?? null
}
