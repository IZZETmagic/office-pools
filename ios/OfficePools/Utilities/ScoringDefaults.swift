import Foundation

/// Default scoring values applied when creating a new pool.
/// Matches the web's SCORING_DEFAULTS from CreatePoolModal.tsx.
struct ScoringDefaultsPayload: Codable {
    // Group stage
    let groupExactScore: Int
    let groupCorrectDifference: Int
    let groupCorrectResult: Int

    // Knockout stage
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

    // PSO
    let psoEnabled: Bool
    let psoExactScore: Int
    let psoCorrectDifference: Int
    let psoCorrectResult: Int

    // Bonus: Group standings
    let bonusGroupWinnerAndRunnerup: Int
    let bonusGroupWinnerOnly: Int
    let bonusGroupRunnerupOnly: Int
    let bonusBothQualifySwapped: Int
    let bonusOneQualifiesWrongPosition: Int

    // Bonus: Overall qualification
    let bonusAll16Qualified: Int
    let bonus1215Qualified: Int
    let bonus811Qualified: Int

    // Bonus: Bracket & Tournament
    let bonusCorrectBracketPairing: Int
    let bonusMatchWinnerCorrect: Int
    let bonusChampionCorrect: Int
    let bonusSecondPlaceCorrect: Int
    let bonusThirdPlaceCorrect: Int
    let bonusBestPlayerCorrect: Int
    let bonusTopScorerCorrect: Int

    enum CodingKeys: String, CodingKey {
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
        case bonus1215Qualified = "bonus_12_15_qualified"
        case bonus811Qualified = "bonus_8_11_qualified"
        case bonusCorrectBracketPairing = "bonus_correct_bracket_pairing"
        case bonusMatchWinnerCorrect = "bonus_match_winner_correct"
        case bonusChampionCorrect = "bonus_champion_correct"
        case bonusSecondPlaceCorrect = "bonus_second_place_correct"
        case bonusThirdPlaceCorrect = "bonus_third_place_correct"
        case bonusBestPlayerCorrect = "bonus_best_player_correct"
        case bonusTopScorerCorrect = "bonus_top_scorer_correct"
    }

    /// The default scoring values matching the web app.
    static let defaults = ScoringDefaultsPayload(
        groupExactScore: 100,
        groupCorrectDifference: 75,
        groupCorrectResult: 50,
        knockoutExactScore: 200,
        knockoutCorrectDifference: 150,
        knockoutCorrectResult: 100,
        round32Multiplier: 1,
        round16Multiplier: 2,
        quarterFinalMultiplier: 3,
        semiFinalMultiplier: 4,
        thirdPlaceMultiplier: 4,
        finalMultiplier: 8,
        psoEnabled: true,
        psoExactScore: 100,
        psoCorrectDifference: 75,
        psoCorrectResult: 50,
        bonusGroupWinnerAndRunnerup: 150,
        bonusGroupWinnerOnly: 100,
        bonusGroupRunnerupOnly: 50,
        bonusBothQualifySwapped: 75,
        bonusOneQualifiesWrongPosition: 25,
        bonusAll16Qualified: 75,
        bonus1215Qualified: 50,
        bonus811Qualified: 25,
        bonusCorrectBracketPairing: 50,
        bonusMatchWinnerCorrect: 50,
        bonusChampionCorrect: 1000,
        bonusSecondPlaceCorrect: 25,
        bonusThirdPlaceCorrect: 25,
        bonusBestPlayerCorrect: 100,
        bonusTopScorerCorrect: 100
    )
}
