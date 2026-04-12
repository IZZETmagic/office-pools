import Foundation
import Supabase

// MARK: - Activity Type

enum ActivityType: String, Codable, CaseIterable {
    case mention
    case rankChange = "rank_change"
    case deadlineAlert = "deadline_alert"
    case poolJoined = "pool_joined"
    case levelUp = "level_up"
    case streakMilestone = "streak_milestone"
    case badgeEarned = "badge_earned"
    case predictionResult = "prediction_result"
    case matchdayMvp = "matchday_mvp"
    case predictionSubmitted = "prediction_submitted"
    case pointsAdjusted = "points_adjusted"
    case welcome
}

// MARK: - Activity Item

struct ActivityItem: Codable, Identifiable {
    let activityId: String
    let userId: String
    let poolId: String?
    let activityType: ActivityType
    let title: String
    let body: String?
    let icon: String
    let colorKey: String
    let metadata: [String: AnyJSON]?
    let isRead: Bool
    let createdAt: String

    var id: String { activityId }

    /// Create a synthesized activity item from computed pool data (not from `user_activity` table).
    static func synthesized(
        activityType: ActivityType,
        title: String,
        body: String?,
        icon: String,
        colorKey: String,
        poolId: String?,
        createdAt: String,
        metadata: [String: AnyJSON]?
    ) -> ActivityItem {
        ActivityItem(
            activityId: "\(activityType.rawValue)-\(poolId ?? "none")-\(createdAt)",
            userId: "",
            poolId: poolId,
            activityType: activityType,
            title: title,
            body: body,
            icon: icon,
            colorKey: colorKey,
            metadata: metadata,
            isRead: true,
            createdAt: createdAt
        )
    }

    enum CodingKeys: String, CodingKey {
        case activityId = "activity_id"
        case userId = "user_id"
        case poolId = "pool_id"
        case activityType = "activity_type"
        case title, body, icon
        case colorKey = "color_key"
        case metadata
        case isRead = "is_read"
        case createdAt = "created_at"
    }

    /// Decode metadata into a typed struct based on activityType.
    var parsedMetadata: ParsedActivityMetadata? {
        guard let metadata else { return nil }
        let decoder = JSONDecoder()
        guard let data = try? JSONSerialization.data(withJSONObject: metadata.mapValues(\.value)) else { return nil }

        switch activityType {
        case .mention:
            if let m = try? decoder.decode(MentionMeta.self, from: data) { return .mention(m) }
        case .rankChange:
            if let m = try? decoder.decode(RankChangeMeta.self, from: data) { return .rankChange(m) }
        case .deadlineAlert:
            if let m = try? decoder.decode(DeadlineAlertMeta.self, from: data) { return .deadlineAlert(m) }
        case .poolJoined:
            if let m = try? decoder.decode(PoolJoinedMeta.self, from: data) { return .poolJoined(m) }
        case .levelUp:
            if let m = try? decoder.decode(LevelUpMeta.self, from: data) { return .levelUp(m) }
        case .streakMilestone:
            if let m = try? decoder.decode(StreakMilestoneMeta.self, from: data) { return .streakMilestone(m) }
        case .badgeEarned:
            if let m = try? decoder.decode(BadgeEarnedMeta.self, from: data) { return .badgeEarned(m) }
        case .predictionResult:
            if let m = try? decoder.decode(PredictionResultMeta.self, from: data) { return .predictionResult(m) }
        case .matchdayMvp:
            if let m = try? decoder.decode(MatchdayMvpMeta.self, from: data) { return .matchdayMvp(m) }
        case .predictionSubmitted:
            if let m = try? decoder.decode(PredictionSubmittedMeta.self, from: data) { return .predictionSubmitted(m) }
        case .pointsAdjusted:
            if let m = try? decoder.decode(PointsAdjustedMeta.self, from: data) { return .pointsAdjusted(m) }
        case .welcome:
            return .welcome
        }
        return nil
    }

    /// The pool name extracted from metadata (if available).
    var poolName: String? {
        switch parsedMetadata {
        case .mention(let m):          return m.poolName
        case .rankChange(let m):       return m.poolName
        case .deadlineAlert(let m):    return m.poolName
        case .poolJoined(let m):       return m.poolName
        case .levelUp(let m):          return m.poolName
        case .streakMilestone(let m):  return m.poolName
        case .badgeEarned(let m):      return m.poolName
        case .predictionResult(let m): return m.poolName
        case .matchdayMvp(let m):          return m.poolName
        case .predictionSubmitted(let m): return m.poolName
        case .pointsAdjusted(let m):     return m.poolName
        case .welcome, .none:              return nil
        }
    }
}

// MARK: - Parsed Metadata Enum

enum ParsedActivityMetadata {
    case mention(MentionMeta)
    case rankChange(RankChangeMeta)
    case deadlineAlert(DeadlineAlertMeta)
    case poolJoined(PoolJoinedMeta)
    case levelUp(LevelUpMeta)
    case streakMilestone(StreakMilestoneMeta)
    case badgeEarned(BadgeEarnedMeta)
    case predictionResult(PredictionResultMeta)
    case matchdayMvp(MatchdayMvpMeta)
    case predictionSubmitted(PredictionSubmittedMeta)
    case pointsAdjusted(PointsAdjustedMeta)
    case welcome
}

// MARK: - Metadata Types

struct MentionMeta: Codable {
    let poolName: String
    let senderName: String
    let messagePreview: String?

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
        case senderName = "sender_name"
        case messagePreview = "message_preview"
    }
}

struct RankChangeMeta: Codable {
    let poolName: String
    let oldRank: Int
    let newRank: Int
    let delta: Int

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
        case oldRank = "old_rank"
        case newRank = "new_rank"
        case delta
    }
}

struct DeadlineAlertMeta: Codable {
    let poolName: String
    let roundName: String?
    let deadline: String

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
        case roundName = "round_name"
        case deadline
    }
}

struct PoolJoinedMeta: Codable {
    let poolName: String

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
    }
}

struct LevelUpMeta: Codable {
    let poolName: String
    let newLevel: Int
    let levelName: String

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
        case newLevel = "new_level"
        case levelName = "level_name"
    }
}

struct StreakMilestoneMeta: Codable {
    let poolName: String
    let streakType: String // "hot" or "cold"
    let streakLength: Int

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
        case streakType = "streak_type"
        case streakLength = "streak_length"
    }
}

struct BadgeEarnedMeta: Codable {
    let poolName: String
    let badgeName: String
    let badgeEmoji: String
    let rarity: String

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
        case badgeName = "badge_name"
        case badgeEmoji = "badge_emoji"
        case rarity
    }
}

struct PredictionResultMeta: Codable {
    let poolName: String
    let matchNumber: Int
    let outcome: String // "exact", "winner_gd", "winner", "miss"
    let homeTeam: String
    let awayTeam: String
    let score: String

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
        case matchNumber = "match_number"
        case outcome
        case homeTeam = "home_team"
        case awayTeam = "away_team"
        case score
    }
}

struct MatchdayMvpMeta: Codable {
    let poolName: String
    let matchNumber: Int
    let matchPoints: Int

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
        case matchNumber = "match_number"
        case matchPoints = "match_points"
    }
}

struct PredictionSubmittedMeta: Codable {
    let poolName: String
    let entryName: String?
    let matchCount: Int?

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
        case entryName = "entry_name"
        case matchCount = "match_count"
    }
}

struct PointsAdjustedMeta: Codable {
    let poolName: String
    let adjustment: Int
    let reason: String

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
        case adjustment
        case reason
    }
}
