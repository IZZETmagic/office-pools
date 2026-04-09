import Foundation

/// Response from GET /api/pools/:poolId/entries/:entryId/bracket-analytics
struct BPAnalyticsResponse: Codable {
    let xp: BPXPData
    let poolComparison: BPPoolComparisonData?

    enum CodingKeys: String, CodingKey {
        case xp
        case poolComparison = "pool_comparison"
    }
}

// MARK: - BP XP Data

struct BPXPData: Codable {
    let totalXp: Int
    let totalGroupBaseXp: Int
    let totalGroupBonusXp: Int
    let totalThirdPlaceXp: Int
    let totalKnockoutBaseXp: Int
    let totalKnockoutBonusXp: Int
    let totalBadgeXp: Int
    let currentLevel: LevelInfo
    let nextLevel: LevelInfo?
    let xpToNextLevel: Int
    let levelProgress: Double
    let bonusEvents: [BPBonusEvent]
    let earnedBadges: [BadgeInfo]
    let allBadges: [BadgeInfo]
    let levels: [LevelInfo]
    let groupXp: [BPGroupXPSummary]
    let thirdPlaceXp: [BPThirdPlaceXPItem]
    let thirdPlacePerfectBonusXp: Int
    let knockoutXp: [BPKnockoutXPItem]

    enum CodingKeys: String, CodingKey {
        case totalXp = "total_xp"
        case totalGroupBaseXp = "total_group_base_xp"
        case totalGroupBonusXp = "total_group_bonus_xp"
        case totalThirdPlaceXp = "total_third_place_xp"
        case totalKnockoutBaseXp = "total_knockout_base_xp"
        case totalKnockoutBonusXp = "total_knockout_bonus_xp"
        case totalBadgeXp = "total_badge_xp"
        case currentLevel = "current_level"
        case nextLevel = "next_level"
        case xpToNextLevel = "xp_to_next_level"
        case levelProgress = "level_progress"
        case bonusEvents = "bonus_events"
        case earnedBadges = "earned_badges"
        case allBadges = "all_badges"
        case levels
        case groupXp = "group_xp"
        case thirdPlaceXp = "third_place_xp"
        case thirdPlacePerfectBonusXp = "third_place_perfect_bonus_xp"
        case knockoutXp = "knockout_xp"
    }

    /// Total group XP (base + bonus)
    var totalGroupXp: Int { totalGroupBaseXp + totalGroupBonusXp }
    /// Total knockout XP (base + bonus)
    var totalKnockoutXp: Int { totalKnockoutBaseXp + totalKnockoutBonusXp }
}

// MARK: - BP Bonus Event

struct BPBonusEvent: Codable, Identifiable {
    let type: String
    let label: String
    let emoji: String
    let xp: Int
    let detail: String?

    var id: String { "\(type)-\(label)" }
}

// MARK: - BP Group XP Summary

struct BPGroupXPSummary: Codable, Identifiable {
    let groupLetter: String
    let positions: [BPGroupPositionXP]
    let qualifiersCorrect: Bool
    let qualifiersBonusXp: Int
    let perfectOrder: Bool
    let perfectOrderBonusXp: Int
    let totalGroupXp: Int

    var id: String { groupLetter }

    enum CodingKeys: String, CodingKey {
        case groupLetter = "group_letter"
        case positions
        case qualifiersCorrect = "qualifiers_correct"
        case qualifiersBonusXp = "qualifiers_bonus_xp"
        case perfectOrder = "perfect_order"
        case perfectOrderBonusXp = "perfect_order_bonus_xp"
        case totalGroupXp = "total_group_xp"
    }
}

struct BPGroupPositionXP: Codable, Identifiable {
    let teamId: String
    let predictedPosition: Int
    let actualPosition: Int?
    let correct: Bool
    let xp: Int

    var id: String { teamId }

    enum CodingKeys: String, CodingKey {
        case teamId = "team_id"
        case predictedPosition = "predicted_position"
        case actualPosition = "actual_position"
        case correct, xp
    }
}

// MARK: - BP Third Place XP

struct BPThirdPlaceXPItem: Codable, Identifiable {
    let teamId: String
    let groupLetter: String
    let predictedQualifies: Bool
    let actuallyQualifies: Bool
    let correct: Bool
    let xp: Int

    var id: String { teamId }

    enum CodingKeys: String, CodingKey {
        case teamId = "team_id"
        case groupLetter = "group_letter"
        case predictedQualifies = "predicted_qualifies"
        case actuallyQualifies = "actually_qualifies"
        case correct, xp
    }
}

// MARK: - BP Knockout XP

struct BPKnockoutXPItem: Codable, Identifiable {
    let matchId: String
    let matchNumber: Int
    let stage: String
    let predictedWinner: String
    let actualWinner: String?
    let correct: Bool
    let xp: Int

    var id: String { matchId }

    enum CodingKeys: String, CodingKey {
        case matchId = "match_id"
        case matchNumber = "match_number"
        case stage
        case predictedWinner = "predicted_winner"
        case actualWinner = "actual_winner"
        case correct, xp
    }
}

// MARK: - BP Pool Comparison

struct BPPoolComparisonData: Codable {
    let userOverallAccuracy: Int
    let poolAvgOverallAccuracy: Int
    let userGroupCorrect: Int
    let userGroupTotal: Int
    let poolAvgGroupCorrect: Double
    let userKnockoutCorrect: Int
    let userKnockoutTotal: Int
    let poolAvgKnockoutCorrect: Double
    let userThirdCorrect: Int
    let userThirdTotal: Int
    let poolAvgThirdCorrect: Double
    let consensusCount: Int
    let contrarianCount: Int
    let contrarianWins: Int
    let poolAvgConsensus: Int
    let poolAvgContrarian: Int
    let poolAvgContrarianWins: Int
    let totalEntries: Int
    let totalScoredPicks: Int
    let mostPopularChampion: BPMostPopularChampion?

    enum CodingKeys: String, CodingKey {
        case userOverallAccuracy = "user_overall_accuracy"
        case poolAvgOverallAccuracy = "pool_avg_overall_accuracy"
        case userGroupCorrect = "user_group_correct"
        case userGroupTotal = "user_group_total"
        case poolAvgGroupCorrect = "pool_avg_group_correct"
        case userKnockoutCorrect = "user_knockout_correct"
        case userKnockoutTotal = "user_knockout_total"
        case poolAvgKnockoutCorrect = "pool_avg_knockout_correct"
        case userThirdCorrect = "user_third_correct"
        case userThirdTotal = "user_third_total"
        case poolAvgThirdCorrect = "pool_avg_third_correct"
        case consensusCount = "consensus_count"
        case contrarianCount = "contrarian_count"
        case contrarianWins = "contrarian_wins"
        case poolAvgConsensus = "pool_avg_consensus"
        case poolAvgContrarian = "pool_avg_contrarian"
        case poolAvgContrarianWins = "pool_avg_contrarian_wins"
        case totalEntries = "total_entries"
        case totalScoredPicks = "total_scored_picks"
        case mostPopularChampion = "most_popular_champion"
    }
}

struct BPMostPopularChampion: Codable {
    let teamId: String
    let count: Int
    let pct: Double

    enum CodingKeys: String, CodingKey {
        case teamId = "team_id"
        case count, pct
    }
}
