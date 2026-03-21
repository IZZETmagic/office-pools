import Foundation

/// Response from GET /api/pools/:poolId/entries/:entryId/breakdown
struct PointsBreakdownResponse: Codable {
    let entry: BreakdownEntry
    let user: BreakdownUser
    let summary: BreakdownSummary
    let matchResults: [MatchResultData]
    let bonusEntries: [BonusEntryData]
    let poolSettings: BreakdownPoolSettings
    let predictionMode: String

    enum CodingKeys: String, CodingKey {
        case entry, user, summary
        case matchResults = "match_results"
        case bonusEntries = "bonus_entries"
        case poolSettings = "pool_settings"
        case predictionMode = "prediction_mode"
    }
}

struct BreakdownEntry: Codable {
    let entryId: String
    let entryName: String
    let currentRank: Int?
    let pointAdjustment: Int
    let adjustmentReason: String?

    enum CodingKeys: String, CodingKey {
        case entryId = "entry_id"
        case entryName = "entry_name"
        case currentRank = "current_rank"
        case pointAdjustment = "point_adjustment"
        case adjustmentReason = "adjustment_reason"
    }
}

struct BreakdownUser: Codable {
    let fullName: String
    let username: String

    enum CodingKeys: String, CodingKey {
        case fullName = "full_name"
        case username
    }
}

struct BreakdownSummary: Codable {
    let matchPoints: Int
    let bonusPoints: Int
    let pointAdjustment: Int
    let totalPoints: Int

    enum CodingKeys: String, CodingKey {
        case matchPoints = "match_points"
        case bonusPoints = "bonus_points"
        case pointAdjustment = "point_adjustment"
        case totalPoints = "total_points"
    }
}

struct MatchResultData: Codable, Identifiable {
    let matchNumber: Int
    let stage: String
    let homeTeam: String
    let awayTeam: String
    let homeFlagUrl: String?
    let awayFlagUrl: String?
    let actualHome: Int
    let actualAway: Int
    let predictedHome: Int
    let predictedAway: Int
    let actualHomePso: Int?
    let actualAwayPso: Int?
    let predictedHomePso: Int?
    let predictedAwayPso: Int?
    let predictedHomeTeam: String?
    let predictedAwayTeam: String?
    let teamsMatch: Bool
    let type: String  // "exact", "winner_gd", "winner", "miss"
    let basePoints: Int
    let multiplier: Double
    let psoPoints: Int
    let totalPoints: Int

    var id: Int { matchNumber }

    enum CodingKeys: String, CodingKey {
        case matchNumber = "match_number"
        case stage
        case homeTeam = "home_team"
        case awayTeam = "away_team"
        case homeFlagUrl = "home_flag_url"
        case awayFlagUrl = "away_flag_url"
        case actualHome = "actual_home"
        case actualAway = "actual_away"
        case predictedHome = "predicted_home"
        case predictedAway = "predicted_away"
        case actualHomePso = "actual_home_pso"
        case actualAwayPso = "actual_away_pso"
        case predictedHomePso = "predicted_home_pso"
        case predictedAwayPso = "predicted_away_pso"
        case predictedHomeTeam = "predicted_home_team"
        case predictedAwayTeam = "predicted_away_team"
        case teamsMatch = "teams_match"
        case type
        case basePoints = "base_points"
        case multiplier
        case psoPoints = "pso_points"
        case totalPoints = "total_points"
    }
}

struct BonusEntryData: Codable, Identifiable {
    let bonusCategory: String
    let bonusType: String
    let description: String
    let pointsEarned: Int

    var id: String { "\(bonusCategory)-\(bonusType)-\(description)" }

    enum CodingKeys: String, CodingKey {
        case bonusCategory = "bonus_category"
        case bonusType = "bonus_type"
        case description
        case pointsEarned = "points_earned"
    }
}

struct BreakdownPoolSettings: Codable {
    let groupExactScore: Int
    let groupCorrectDifference: Int
    let groupCorrectResult: Int
    let knockoutExactScore: Int
    let knockoutCorrectDifference: Int
    let knockoutCorrectResult: Int
    let round32Multiplier: Double
    let round16Multiplier: Double
    let quarterFinalMultiplier: Double
    let semiFinalMultiplier: Double
    let thirdPlaceMultiplier: Double
    let finalMultiplier: Double
    let psoEnabled: Bool
    let psoExactScore: Int?
    let psoCorrectDifference: Int?
    let psoCorrectResult: Int?

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
    }
}
