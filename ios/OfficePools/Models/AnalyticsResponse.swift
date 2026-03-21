import Foundation

/// Response from GET /api/pools/:poolId/entries/:entryId/analytics
struct AnalyticsResponse: Codable {
    let xp: XPData
    let accuracy: AccuracyData
    let streaks: AnalyticsStreakData
    let crowd: CrowdData
    let poolStats: PoolStatsData

    enum CodingKeys: String, CodingKey {
        case xp, accuracy, streaks, crowd
        case poolStats = "pool_stats"
    }
}

// MARK: - XP

struct XPData: Codable {
    let totalXp: Int
    let totalBaseXp: Int
    let totalBonusXp: Int
    let totalBadgeXp: Int
    let currentLevel: LevelInfo
    let nextLevel: LevelInfo?
    let xpToNextLevel: Int
    let levelProgress: Double
    let matchXp: [MatchXPItem]
    let bonusEvents: [BonusXPEvent]
    let earnedBadges: [BadgeInfo]
    let allBadges: [BadgeInfo]
    let levels: [LevelInfo]

    enum CodingKeys: String, CodingKey {
        case totalXp = "total_xp"
        case totalBaseXp = "total_base_xp"
        case totalBonusXp = "total_bonus_xp"
        case totalBadgeXp = "total_badge_xp"
        case currentLevel = "current_level"
        case nextLevel = "next_level"
        case xpToNextLevel = "xp_to_next_level"
        case levelProgress = "level_progress"
        case matchXp = "match_xp"
        case bonusEvents = "bonus_events"
        case earnedBadges = "earned_badges"
        case allBadges = "all_badges"
        case levels
    }
}

struct LevelInfo: Codable, Identifiable {
    let level: Int
    let name: String
    let xpRequired: Int
    let badge: String?

    var id: Int { level }

    enum CodingKeys: String, CodingKey {
        case level, name, badge
        case xpRequired = "xp_required"
    }
}

struct MatchXPItem: Codable, Identifiable {
    let matchNumber: Int
    let stage: String
    let tier: String
    let baseXp: Int
    let multiplier: Double
    let multipliedXp: Int

    var id: Int { matchNumber }

    enum CodingKeys: String, CodingKey {
        case matchNumber = "match_number"
        case stage, tier
        case baseXp = "base_xp"
        case multiplier
        case multipliedXp = "multiplied_xp"
    }
}

struct BonusXPEvent: Codable, Identifiable {
    let type: String
    let label: String
    let xp: Int
    let matchNumber: Int?
    let detail: String?

    var id: String { "\(type)-\(matchNumber ?? 0)-\(label)" }

    enum CodingKeys: String, CodingKey {
        case type, label, xp, detail
        case matchNumber = "match_number"
    }
}

struct BadgeInfo: Codable, Identifiable {
    let id: String
    let name: String
    let xpBonus: Int
    let condition: String
    let rarity: String
    let tier: String

    enum CodingKeys: String, CodingKey {
        case id, name, condition, rarity, tier
        case xpBonus = "xp_bonus"
    }
}

// MARK: - Accuracy

struct AccuracyData: Codable {
    let overall: OverallAccuracy
    let byStage: [StageAccuracy]

    enum CodingKeys: String, CodingKey {
        case overall
        case byStage = "by_stage"
    }
}

struct OverallAccuracy: Codable {
    let totalMatches: Int
    let exact: Int
    let winnerGd: Int
    let winner: Int
    let miss: Int
    let hitRate: Double
    let exactRate: Double
    let totalPoints: Int

    enum CodingKeys: String, CodingKey {
        case exact, winner, miss
        case totalMatches = "total_matches"
        case winnerGd = "winner_gd"
        case hitRate = "hit_rate"
        case exactRate = "exact_rate"
        case totalPoints = "total_points"
    }
}

struct StageAccuracy: Codable, Identifiable {
    let stage: String
    let stageLabel: String
    let total: Int
    let exact: Int
    let winnerGd: Int
    let winner: Int
    let miss: Int
    let hitRate: Double

    var id: String { stage }

    enum CodingKeys: String, CodingKey {
        case stage, total, exact, winner, miss
        case stageLabel = "stage_label"
        case winnerGd = "winner_gd"
        case hitRate = "hit_rate"
    }
}

// MARK: - Streaks

struct AnalyticsStreakData: Codable {
    let currentStreak: AnalyticsStreakInfo
    let longestHotStreak: Int
    let longestColdStreak: Int
    let timeline: [StreakTimelineEntry]

    enum CodingKeys: String, CodingKey {
        case currentStreak = "current_streak"
        case longestHotStreak = "longest_hot_streak"
        case longestColdStreak = "longest_cold_streak"
        case timeline
    }
}

struct AnalyticsStreakInfo: Codable {
    let type: String
    let length: Int
}

struct StreakTimelineEntry: Codable, Identifiable {
    let matchNumber: Int
    let type: String
    let isCorrect: Bool

    var id: Int { matchNumber }

    enum CodingKeys: String, CodingKey {
        case matchNumber = "match_number"
        case type
        case isCorrect = "is_correct"
    }
}

// MARK: - Crowd

struct CrowdData: Codable {
    let totalMatches: Int
    let consensusCount: Int
    let contrarianCount: Int
    let contrarianWins: Int
    let matches: [CrowdMatchItem]

    enum CodingKeys: String, CodingKey {
        case matches
        case totalMatches = "total_matches"
        case consensusCount = "consensus_count"
        case contrarianCount = "contrarian_count"
        case contrarianWins = "contrarian_wins"
    }
}

struct CrowdMatchItem: Codable, Identifiable {
    let matchNumber: Int
    let stage: String
    let homeTeam: String
    let awayTeam: String
    let actualScore: String
    let homeWinPct: Double
    let drawPct: Double
    let awayWinPct: Double
    let isContrarian: Bool
    let isCorrect: Bool

    var id: Int { matchNumber }

    enum CodingKeys: String, CodingKey {
        case stage
        case matchNumber = "match_number"
        case homeTeam = "home_team"
        case awayTeam = "away_team"
        case actualScore = "actual_score"
        case homeWinPct = "home_win_pct"
        case drawPct = "draw_pct"
        case awayWinPct = "away_win_pct"
        case isContrarian = "is_contrarian"
        case isCorrect = "is_correct"
    }
}

// MARK: - Pool Stats

struct PoolStatsData: Codable {
    let avgAccuracy: Double
    let completedMatches: Int
    let totalEntries: Int
    let mostPredictable: [PredictableMatch]
    let leastPredictable: [PredictableMatch]

    enum CodingKeys: String, CodingKey {
        case avgAccuracy = "avg_accuracy"
        case completedMatches = "completed_matches"
        case totalEntries = "total_entries"
        case mostPredictable = "most_predictable"
        case leastPredictable = "least_predictable"
    }
}

struct PredictableMatch: Codable, Identifiable {
    let matchNumber: Int
    let homeTeam: String
    let awayTeam: String
    let actualScore: String
    let hitRate: Double

    var id: Int { matchNumber }

    enum CodingKeys: String, CodingKey {
        case matchNumber = "match_number"
        case homeTeam = "home_team"
        case awayTeam = "away_team"
        case actualScore = "actual_score"
        case hitRate = "hit_rate"
    }
}
