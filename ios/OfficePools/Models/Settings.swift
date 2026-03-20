import Foundation

struct PoolSettings: Codable {
    let settingId: String
    let poolId: String

    // Group stage scoring
    let groupExactScore: Int
    let groupCorrectDifference: Int
    let groupCorrectResult: Int

    // Knockout scoring
    let knockoutExactScore: Int
    let knockoutCorrectDifference: Int
    let knockoutCorrectResult: Int

    // Round multipliers
    let round32Multiplier: Double
    let round16Multiplier: Double
    let quarterFinalMultiplier: Double
    let semiFinalMultiplier: Double
    let thirdPlaceMultiplier: Double
    let finalMultiplier: Double

    // PSO scoring
    let psoEnabled: Bool
    let psoExactScore: Int?
    let psoCorrectDifference: Int?
    let psoCorrectResult: Int?

    // Bonus: Group standings
    let bonusGroupWinnerAndRunnerup: Int?
    let bonusGroupWinnerOnly: Int?
    let bonusGroupRunnerupOnly: Int?
    let bonusBothQualifySwapped: Int?
    let bonusOneQualifiesWrongPosition: Int?

    // Bonus: Overall qualification
    let bonusAll16Qualified: Int?
    let bonus12_15Qualified: Int?
    let bonus8_11Qualified: Int?

    // Bonus: Bracket & Tournament
    let bonusCorrectBracketPairing: Int?
    let bonusMatchWinnerCorrect: Int?
    let bonusChampionCorrect: Int?
    let bonusSecondPlaceCorrect: Int?
    let bonusThirdPlaceCorrect: Int?
    let bonusBestPlayerCorrect: Int?
    let bonusTopScorerCorrect: Int?

    // Bracket Picker scoring
    let bracketPairingMode: String?
    let bpGroupCorrect1st: Int?
    let bpGroupCorrect2nd: Int?
    let bpGroupCorrect3rd: Int?
    let bpGroupCorrect4th: Int?
    let bpThirdCorrectQualifier: Int?
    let bpThirdCorrectEliminated: Int?
    let bpThirdAllCorrectBonus: Int?
    let bpR32Correct: Int?
    let bpR16Correct: Int?
    let bpQfCorrect: Int?
    let bpSfCorrect: Int?
    let bpThirdPlaceMatchCorrect: Int?
    let bpFinalCorrect: Int?
    let bpChampionBonus: Int?
    let bpPenaltyCorrect: Int?

    enum CodingKeys: String, CodingKey {
        case settingId = "setting_id"
        case poolId = "pool_id"
        case groupExactScore = "group_exact_score"
        case groupCorrectDifference = "group_correct_difference"
        case groupCorrectResult = "group_correct_result"
        case knockoutExactScore = "knockout_exact_score"
        case knockoutCorrectDifference = "knockout_correct_difference"
        case knockoutCorrectResult = "knockout_correct_result"
        case round32Multiplier = "round_32_multiplier"
        case round16Multiplier = "round_16_multiplier"
        case quarterFinalMultiplier = "quarter_final_multiplier"
        case semiFinalMultiplier = "semi_final_multiplier"
        case thirdPlaceMultiplier = "third_place_multiplier"
        case finalMultiplier = "final_multiplier"
        case psoEnabled = "pso_enabled"
        case psoExactScore = "pso_exact_score"
        case psoCorrectDifference = "pso_correct_difference"
        case psoCorrectResult = "pso_correct_result"
        case bonusGroupWinnerAndRunnerup = "bonus_group_winner_and_runnerup"
        case bonusGroupWinnerOnly = "bonus_group_winner_only"
        case bonusGroupRunnerupOnly = "bonus_group_runnerup_only"
        case bonusBothQualifySwapped = "bonus_both_qualify_swapped"
        case bonusOneQualifiesWrongPosition = "bonus_one_qualifies_wrong_position"
        case bonusAll16Qualified = "bonus_all_16_qualified"
        case bonus12_15Qualified = "bonus_12_15_qualified"
        case bonus8_11Qualified = "bonus_8_11_qualified"
        case bonusCorrectBracketPairing = "bonus_correct_bracket_pairing"
        case bonusMatchWinnerCorrect = "bonus_match_winner_correct"
        case bonusChampionCorrect = "bonus_champion_correct"
        case bonusSecondPlaceCorrect = "bonus_second_place_correct"
        case bonusThirdPlaceCorrect = "bonus_third_place_correct"
        case bonusBestPlayerCorrect = "bonus_best_player_correct"
        case bonusTopScorerCorrect = "bonus_top_scorer_correct"
        case bracketPairingMode = "bracket_pairing_mode"
        case bpGroupCorrect1st = "bp_group_correct_1st"
        case bpGroupCorrect2nd = "bp_group_correct_2nd"
        case bpGroupCorrect3rd = "bp_group_correct_3rd"
        case bpGroupCorrect4th = "bp_group_correct_4th"
        case bpThirdCorrectQualifier = "bp_third_correct_qualifier"
        case bpThirdCorrectEliminated = "bp_third_correct_eliminated"
        case bpThirdAllCorrectBonus = "bp_third_all_correct_bonus"
        case bpR32Correct = "bp_r32_correct"
        case bpR16Correct = "bp_r16_correct"
        case bpQfCorrect = "bp_qf_correct"
        case bpSfCorrect = "bp_sf_correct"
        case bpThirdPlaceMatchCorrect = "bp_third_place_match_correct"
        case bpFinalCorrect = "bp_final_correct"
        case bpChampionBonus = "bp_champion_bonus"
        case bpPenaltyCorrect = "bp_penalty_correct"
    }
}
