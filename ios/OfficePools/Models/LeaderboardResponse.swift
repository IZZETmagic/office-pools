import Foundation

/// Response from GET /api/pools/:poolId/leaderboard
struct LeaderboardResponse: Codable {
    let poolId: String
    let predictionMode: String
    let entries: [LeaderboardEntryData]

    enum CodingKeys: String, CodingKey {
        case poolId = "pool_id"
        case predictionMode = "prediction_mode"
        case entries
    }
}

/// A single entry in the server-computed leaderboard.
struct LeaderboardEntryData: Codable, Identifiable {
    let entryId: String
    let entryName: String
    let entryNumber: Int
    let memberId: String
    let userId: String
    let fullName: String
    let username: String
    let matchPoints: Int
    let bonusPoints: Int
    let pointAdjustment: Int
    let totalPoints: Int
    let currentRank: Int?
    let previousRank: Int?
    let hasSubmittedPredictions: Bool

    var id: String { entryId }

    var rankDelta: Int? {
        guard let current = currentRank, let previous = previousRank else { return nil }
        return previous - current
    }

    enum CodingKeys: String, CodingKey {
        case entryId = "entry_id"
        case entryName = "entry_name"
        case entryNumber = "entry_number"
        case memberId = "member_id"
        case userId = "user_id"
        case fullName = "full_name"
        case username
        case matchPoints = "match_points"
        case bonusPoints = "bonus_points"
        case pointAdjustment = "point_adjustment"
        case totalPoints = "total_points"
        case currentRank = "current_rank"
        case previousRank = "previous_rank"
        case hasSubmittedPredictions = "has_submitted_predictions"
    }
}
