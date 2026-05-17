import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

export type PoolSettings = {
  // Group stage scoring
  groupExactScore: number;
  groupCorrectDifference: number;
  groupCorrectResult: number;

  // Knockout scoring
  knockoutExactScore: number;
  knockoutCorrectDifference: number;
  knockoutCorrectResult: number;

  // Round multipliers
  round32Multiplier: number;
  round16Multiplier: number;
  quarterFinalMultiplier: number;
  semiFinalMultiplier: number;
  thirdPlaceMultiplier: number;
  finalMultiplier: number;

  // PSO
  psoEnabled: boolean;
  psoExactScore: number | null;
  psoCorrectDifference: number | null;
  psoCorrectResult: number | null;

  // Bonus: Group standings
  bonusGroupWinnerAndRunnerup: number | null;
  bonusGroupWinnerOnly: number | null;
  bonusGroupRunnerupOnly: number | null;
  bonusBothQualifySwapped: number | null;
  bonusOneQualifiesWrongPosition: number | null;

  // Bonus: Overall qualification
  bonusAll16Qualified: number | null;
  bonus12_15Qualified: number | null;
  bonus8_11Qualified: number | null;

  // Bonus: Bracket & Tournament
  bonusCorrectBracketPairing: number | null;
  bonusMatchWinnerCorrect: number | null;
  bonusChampionCorrect: number | null;
  bonusSecondPlaceCorrect: number | null;
  bonusThirdPlaceCorrect: number | null;
  bonusBestPlayerCorrect: number | null;
  bonusTopScorerCorrect: number | null;

  // Bracket Picker mode scoring (optional — only set when prediction_mode = bracket_picker)
  bpGroupCorrect1st: number | null;
  bpGroupCorrect2nd: number | null;
  bpGroupCorrect3rd: number | null;
  bpGroupCorrect4th: number | null;
  bpThirdCorrectQualifier: number | null;
  bpThirdCorrectEliminated: number | null;
  bpThirdAllCorrectBonus: number | null;
  bpR32Correct: number | null;
  bpR16Correct: number | null;
  bpQfCorrect: number | null;
  bpSfCorrect: number | null;
  bpThirdPlaceMatchCorrect: number | null;
  bpFinalCorrect: number | null;
  bpChampionBonus: number | null;
  bpPenaltyCorrect: number | null;
};

type DbRow = {
  group_exact_score: number;
  group_correct_difference: number;
  group_correct_result: number;
  knockout_exact_score: number;
  knockout_correct_difference: number;
  knockout_correct_result: number;
  round_32_multiplier: number;
  round_16_multiplier: number;
  quarter_final_multiplier: number;
  semi_final_multiplier: number;
  third_place_multiplier: number;
  final_multiplier: number;
  pso_enabled: boolean;
  pso_exact_score: number | null;
  pso_correct_difference: number | null;
  pso_correct_result: number | null;
  bonus_group_winner_and_runnerup: number | null;
  bonus_group_winner_only: number | null;
  bonus_group_runnerup_only: number | null;
  bonus_both_qualify_swapped: number | null;
  bonus_one_qualifies_wrong_position: number | null;
  bonus_all_16_qualified: number | null;
  bonus_12_15_qualified: number | null;
  bonus_8_11_qualified: number | null;
  bonus_correct_bracket_pairing: number | null;
  bonus_match_winner_correct: number | null;
  bonus_champion_correct: number | null;
  bonus_second_place_correct: number | null;
  bonus_third_place_correct: number | null;
  bonus_best_player_correct: number | null;
  bonus_top_scorer_correct: number | null;
  bp_group_correct_1st: number | null;
  bp_group_correct_2nd: number | null;
  bp_group_correct_3rd: number | null;
  bp_group_correct_4th: number | null;
  bp_third_correct_qualifier: number | null;
  bp_third_correct_eliminated: number | null;
  bp_third_all_correct_bonus: number | null;
  bp_r32_correct: number | null;
  bp_r16_correct: number | null;
  bp_qf_correct: number | null;
  bp_sf_correct: number | null;
  bp_third_place_match_correct: number | null;
  bp_final_correct: number | null;
  bp_champion_bonus: number | null;
  bp_penalty_correct: number | null;
};

const SELECT_COLUMNS =
  'group_exact_score, group_correct_difference, group_correct_result, knockout_exact_score, knockout_correct_difference, knockout_correct_result, round_32_multiplier, round_16_multiplier, quarter_final_multiplier, semi_final_multiplier, third_place_multiplier, final_multiplier, pso_enabled, pso_exact_score, pso_correct_difference, pso_correct_result, bonus_group_winner_and_runnerup, bonus_group_winner_only, bonus_group_runnerup_only, bonus_both_qualify_swapped, bonus_one_qualifies_wrong_position, bonus_all_16_qualified, bonus_12_15_qualified, bonus_8_11_qualified, bonus_correct_bracket_pairing, bonus_match_winner_correct, bonus_champion_correct, bonus_second_place_correct, bonus_third_place_correct, bonus_best_player_correct, bonus_top_scorer_correct, bp_group_correct_1st, bp_group_correct_2nd, bp_group_correct_3rd, bp_group_correct_4th, bp_third_correct_qualifier, bp_third_correct_eliminated, bp_third_all_correct_bonus, bp_r32_correct, bp_r16_correct, bp_qf_correct, bp_sf_correct, bp_third_place_match_correct, bp_final_correct, bp_champion_bonus, bp_penalty_correct';

function normalize(row: DbRow): PoolSettings {
  return {
    groupExactScore: row.group_exact_score,
    groupCorrectDifference: row.group_correct_difference,
    groupCorrectResult: row.group_correct_result,
    knockoutExactScore: row.knockout_exact_score,
    knockoutCorrectDifference: row.knockout_correct_difference,
    knockoutCorrectResult: row.knockout_correct_result,
    round32Multiplier: row.round_32_multiplier,
    round16Multiplier: row.round_16_multiplier,
    quarterFinalMultiplier: row.quarter_final_multiplier,
    semiFinalMultiplier: row.semi_final_multiplier,
    thirdPlaceMultiplier: row.third_place_multiplier,
    finalMultiplier: row.final_multiplier,
    psoEnabled: row.pso_enabled,
    psoExactScore: row.pso_exact_score,
    psoCorrectDifference: row.pso_correct_difference,
    psoCorrectResult: row.pso_correct_result,
    bonusGroupWinnerAndRunnerup: row.bonus_group_winner_and_runnerup,
    bonusGroupWinnerOnly: row.bonus_group_winner_only,
    bonusGroupRunnerupOnly: row.bonus_group_runnerup_only,
    bonusBothQualifySwapped: row.bonus_both_qualify_swapped,
    bonusOneQualifiesWrongPosition: row.bonus_one_qualifies_wrong_position,
    bonusAll16Qualified: row.bonus_all_16_qualified,
    bonus12_15Qualified: row.bonus_12_15_qualified,
    bonus8_11Qualified: row.bonus_8_11_qualified,
    bonusCorrectBracketPairing: row.bonus_correct_bracket_pairing,
    bonusMatchWinnerCorrect: row.bonus_match_winner_correct,
    bonusChampionCorrect: row.bonus_champion_correct,
    bonusSecondPlaceCorrect: row.bonus_second_place_correct,
    bonusThirdPlaceCorrect: row.bonus_third_place_correct,
    bonusBestPlayerCorrect: row.bonus_best_player_correct,
    bonusTopScorerCorrect: row.bonus_top_scorer_correct,
    bpGroupCorrect1st: row.bp_group_correct_1st,
    bpGroupCorrect2nd: row.bp_group_correct_2nd,
    bpGroupCorrect3rd: row.bp_group_correct_3rd,
    bpGroupCorrect4th: row.bp_group_correct_4th,
    bpThirdCorrectQualifier: row.bp_third_correct_qualifier,
    bpThirdCorrectEliminated: row.bp_third_correct_eliminated,
    bpThirdAllCorrectBonus: row.bp_third_all_correct_bonus,
    bpR32Correct: row.bp_r32_correct,
    bpR16Correct: row.bp_r16_correct,
    bpQfCorrect: row.bp_qf_correct,
    bpSfCorrect: row.bp_sf_correct,
    bpThirdPlaceMatchCorrect: row.bp_third_place_match_correct,
    bpFinalCorrect: row.bp_final_correct,
    bpChampionBonus: row.bp_champion_bonus,
    bpPenaltyCorrect: row.bp_penalty_correct,
  };
}

export function usePoolSettings(poolId: string | undefined) {
  const [settings, setSettings] = useState<PoolSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!poolId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('pool_settings')
        .select(SELECT_COLUMNS)
        .eq('pool_id', poolId)
        .maybeSingle();
      if (err) throw err;
      setSettings(data ? normalize(data as DbRow) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scoring rules');
      console.warn('[usePoolSettings]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { settings, loading, error, refresh: load };
}
