import Foundation

enum MessageType: String, Codable {
    case text
    case predictionShare = "prediction_share"
    case badgeFlex = "badge_flex"
    case standingsDrop = "standings_drop"
    case systemEvent = "system_event"
}

struct PoolMessage: Codable, Identifiable {
    let messageId: String
    let poolId: String
    let userId: String
    let content: String
    let mentions: [String]?
    let createdAt: String
    let messageType: MessageType
    let replyToMessageId: String?

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
