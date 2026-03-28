import Foundation
import Supabase

enum MessageType: String, Codable {
    case text
    case predictionShare = "prediction_share"
    case badgeFlex = "badge_flex"
    case standingsDrop = "standings_drop"
    case systemEvent = "system_event"
}

// MARK: - Metadata Types (matching web types.ts)

struct PredictionShareMetadata: Codable {
    let entryId: String
    let matchId: String
    let matchNumber: Int
    let stage: String
    let predictedHome: Int
    let predictedAway: Int
    let actualHome: Int
    let actualAway: Int
    let outcome: String // "exact" | "correct" | "miss"
    let homeTeamName: String
    let awayTeamName: String
    let homeTeamCode: String
    let awayTeamCode: String
    let homeFlagUrl: String?
    let awayFlagUrl: String?

    enum CodingKeys: String, CodingKey {
        case entryId = "entry_id"
        case matchId = "match_id"
        case matchNumber = "match_number"
        case stage
        case predictedHome = "predicted_home"
        case predictedAway = "predicted_away"
        case actualHome = "actual_home"
        case actualAway = "actual_away"
        case outcome
        case homeTeamName = "home_team_name"
        case awayTeamName = "away_team_name"
        case homeTeamCode = "home_team_code"
        case awayTeamCode = "away_team_code"
        case homeFlagUrl = "home_flag_url"
        case awayFlagUrl = "away_flag_url"
    }
}

struct BadgeFlexItem: Codable {
    let id: String
    let emoji: String
    let name: String
    let tier: String
    let rarity: String
    let xpBonus: Int
}

struct BadgeFlexMetadata: Codable {
    let badges: [BadgeFlexItem]
    let level: Int
    let levelName: String
    let totalXp: Int

    enum CodingKeys: String, CodingKey {
        case badges, level
        case levelName = "level_name"
        case totalXp = "total_xp"
    }
}

struct StandingsDropEntry: Codable {
    let userId: String
    let fullName: String
    let rank: Int
    let points: Int
    let delta: Int

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case fullName = "full_name"
        case rank, points, delta
    }
}

struct StandingsDropMetadata: Codable {
    let entries: [StandingsDropEntry]
    let poolName: String
    let timestamp: String

    enum CodingKeys: String, CodingKey {
        case entries
        case poolName = "pool_name"
        case timestamp
    }
}

// MARK: - Parsed Metadata Enum

enum ParsedMetadata {
    case predictionShare(PredictionShareMetadata)
    case badgeFlex(BadgeFlexMetadata)
    case standingsDrop(StandingsDropMetadata)
}

// MARK: - Pool Message

struct PoolMessage: Codable, Identifiable {
    let messageId: String
    let poolId: String
    let userId: String
    let content: String
    let mentions: [String]?
    let createdAt: String
    let messageType: MessageType
    let replyToMessageId: String?
    let metadata: [String: AnyJSON]?

    var id: String { messageId }

    enum CodingKeys: String, CodingKey {
        case messageId = "message_id"
        case poolId = "pool_id"
        case userId = "user_id"
        case content
        case mentions
        case createdAt = "created_at"
        case messageType = "message_type"
        case replyToMessageId = "reply_to_message_id"
        case metadata
    }

    /// Decode metadata into a typed struct based on messageType
    var parsedMetadata: ParsedMetadata? {
        guard let metadata = metadata else { return nil }
        let decoder = JSONDecoder()
        guard let data = try? JSONSerialization.data(withJSONObject: metadata.mapValues(\.value)) else { return nil }

        switch messageType {
        case .predictionShare:
            if let m = try? decoder.decode(PredictionShareMetadata.self, from: data) {
                return .predictionShare(m)
            }
        case .badgeFlex:
            if let m = try? decoder.decode(BadgeFlexMetadata.self, from: data) {
                return .badgeFlex(m)
            }
        case .standingsDrop:
            if let m = try? decoder.decode(StandingsDropMetadata.self, from: data) {
                return .standingsDrop(m)
            }
        default:
            break
        }
        return nil
    }
}

struct MessageReaction: Codable {
    let emoji: String
    let count: Int
    let reactedByMe: Bool

    enum CodingKeys: String, CodingKey {
        case emoji
        case count
        case reactedByMe = "reacted_by_me"
    }
}

struct MessageWithReactions: Identifiable {
    let message: PoolMessage
    let reactions: [MessageReaction]
    let senderName: String
    let senderUsername: String

    var id: String { message.messageId }
}

struct PresenceState: Identifiable {
    let userId: String
    let username: String
    let fullName: String
    let onlineAt: String
    let isTyping: Bool

    var id: String { userId }
}

struct PinnedMessage: Codable, Identifiable {
    let pinnedId: String
    let poolId: String
    let pinnedBy: String
    let title: String
    let description: String
    let ctaType: String
    let isActive: Bool
    let createdAt: String

    var id: String { pinnedId }

    enum CodingKeys: String, CodingKey {
        case pinnedId = "pinned_id"
        case poolId = "pool_id"
        case pinnedBy = "pinned_by"
        case title
        case description
        case ctaType = "cta_type"
        case isActive = "is_active"
        case createdAt = "created_at"
    }
}
