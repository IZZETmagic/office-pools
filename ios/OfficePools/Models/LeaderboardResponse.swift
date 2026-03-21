import Foundation

/// Response from GET /api/pools/:poolId/leaderboard
struct LeaderboardResponse: Codable {
    let poolId: String
    let predictionMode: String
    let entries: [LeaderboardEntryData]
    let awards: [PoolAward]?
    let superlatives: [Superlative]?
    let matchdayMvp: MatchdayMVP?
    let matchdayInfo: MatchdayInfo?

    enum CodingKeys: String, CodingKey {
        case poolId = "pool_id"
        case predictionMode = "prediction_mode"
        case entries
        case awards
        case superlatives
        case matchdayMvp = "matchday_mvp"
        case matchdayInfo = "matchday_info"
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

    // Analytics fields (optional — enriched by API)
    let lastFive: [String]?
    let currentStreak: StreakInfo?
    let hitRate: Double?
    let exactCount: Int?
    let level: Int?
    let levelName: String?
    let totalXp: Int?
    let contrarianWins: Int?
    let crowdAgreementPct: Double?
    let totalCompleted: Int?

    var id: String { entryId }

    /// Compute rank movement using the actual sorted position (not the stale DB current_rank)
    func rankDelta(currentPosition: Int) -> Int? {
        guard let previous = previousRank else { return nil }
        return previous - currentPosition
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
        case lastFive = "last_five"
        case currentStreak = "current_streak"
        case hitRate = "hit_rate"
        case exactCount = "exact_count"
        case level
        case levelName = "level_name"
        case totalXp = "total_xp"
        case contrarianWins = "contrarian_wins"
        case crowdAgreementPct = "crowd_agreement_pct"
        case totalCompleted = "total_completed"
    }
}

// MARK: - Supporting Types

struct StreakInfo: Codable {
    let type: String  // "hot", "cold", "none"
    let length: Int
}

struct PoolAward: Codable, Identifiable {
    let type: String
    let emoji: String
    let label: String
    let entryId: String

    var id: String { "\(type)-\(entryId)" }

    enum CodingKeys: String, CodingKey {
        case type, emoji, label
        case entryId = "entry_id"
    }
}

struct Superlative: Codable, Identifiable {
    let type: String
    let emoji: String
    let title: String
    let entryId: String
    let name: String
    let detail: String

    var id: String { type }

    enum CodingKeys: String, CodingKey {
        case type, emoji, title, name, detail
        case entryId = "entry_id"
    }
}

struct MatchdayMVP: Codable {
    let entryId: String
    let entryName: String
    let fullName: String
    let matchPoints: Int
    let matchNumber: Int

    enum CodingKeys: String, CodingKey {
        case entryId = "entry_id"
        case entryName = "entry_name"
        case fullName = "full_name"
        case matchPoints = "match_points"
        case matchNumber = "match_number"
    }
}

struct MatchdayInfo: Codable {
    let lastMatchNumber: Int?
    let nextMatchDate: String?
    let completedCount: Int
    let totalCount: Int

    enum CodingKeys: String, CodingKey {
        case lastMatchNumber = "last_match_number"
        case nextMatchDate = "next_match_date"
        case completedCount = "completed_count"
        case totalCount = "total_count"
    }
}
