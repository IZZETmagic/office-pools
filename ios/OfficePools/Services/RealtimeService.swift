import Foundation
import Supabase
import Realtime

/// Codable struct for presence tracking.
struct PresencePayload: Codable {
    let userId: String
    let username: String
    let fullName: String
    let onlineAt: String
    let isTyping: Bool

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case username
        case fullName = "full_name"
        case onlineAt = "online_at"
        case isTyping = "is_typing"
    }
}

/// Manages Supabase Realtime subscriptions for presence and live messages.
@MainActor
@Observable
final class RealtimeService {
    private let supabase = SupabaseService.shared.client
    private var presenceChannel: RealtimeChannelV2?
    private var messagesChannel: RealtimeChannelV2?
    private var presenceSubscription: RealtimeSubscription?
    private var messagesSubscription: RealtimeSubscription?

    var onlineMembers: [PresenceState] = []
    var typingUsers: [String] = []
    var newMessage: PoolMessage?

    // MARK: - Presence

    func joinPresence(poolId: String, userId: String, username: String, fullName: String) async {
        let channel = supabase.channel("pool-presence-\(poolId)") { config in
            config.presence.key = userId
        }

        // Register presence listener BEFORE subscribing
        presenceSubscription = channel.onPresenceChange { [weak self] action in
            Task { @MainActor in
                self?.handlePresenceChange(action)
            }
        }

        try? await channel.subscribeWithError()

        // Track after subscribing
        try? await channel.track(PresencePayload(
            userId: userId,
            username: username,
            fullName: fullName,
            onlineAt: ISO8601DateFormatter().string(from: Date()),
            isTyping: false
        ))

        presenceChannel = channel
    }

    func sendTypingIndicator(userId: String, username: String, fullName: String, isTyping: Bool) async {
        guard let channel = presenceChannel else { return }
        try? await channel.track(PresencePayload(
            userId: userId,
            username: username,
            fullName: fullName,
            onlineAt: ISO8601DateFormatter().string(from: Date()),
            isTyping: isTyping
        ))
    }

    func leavePresence() async {
        if let channel = presenceChannel {
            await channel.untrack()
            await channel.unsubscribe()
            presenceSubscription = nil
            presenceChannel = nil
        }
    }

    // MARK: - Messages

    func subscribeToMessages(poolId: String) async {
        let channel = supabase.channel("pool-messages-\(poolId)")

        // Register postgres change listener BEFORE subscribing
        messagesSubscription = channel.onPostgresChange(
            InsertAction.self,
            schema: "public",
            table: "pool_messages",
            filter: "pool_id=eq.\(poolId)"
        ) { [weak self] action in
            let decoder = JSONDecoder()
            if let message: PoolMessage = try? action.decodeRecord(decoder: decoder) {
                Task { @MainActor in
                    self?.newMessage = message
                }
            }
        }

        try? await channel.subscribeWithError()
        messagesChannel = channel
    }

    func unsubscribeFromMessages() async {
        if let channel = messagesChannel {
            await channel.unsubscribe()
            messagesSubscription = nil
            messagesChannel = nil
        }
    }

    // MARK: - Send Message

    func sendMessage(poolId: String, userId: String, content: String, mentions: [String] = []) async throws {
        struct NewMessage: Codable {
            let poolId: String
            let userId: String
            let content: String
            let mentions: [String]
            let messageType: String

            enum CodingKeys: String, CodingKey {
                case poolId = "pool_id"
                case userId = "user_id"
                case content
                case mentions
                case messageType = "message_type"
            }
        }

        try await supabase
            .from("pool_messages")
            .insert(NewMessage(
                poolId: poolId,
                userId: userId,
                content: content,
                mentions: mentions,
                messageType: "text"
            ))
            .execute()
    }

    // MARK: - Fetch Message History

    func fetchMessages(poolId: String, limit: Int = 50) async throws -> [PoolMessage] {
        let messages: [PoolMessage] = try await supabase
            .from("pool_messages")
            .select()
            .eq("pool_id", value: poolId)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value

        return messages.reversed()
    }

    // MARK: - Reactions

    func toggleReaction(messageId: String, userId: String, emoji: String) async throws {
        struct ReactionRow: Codable {
            let reactionId: String
            enum CodingKeys: String, CodingKey {
                case reactionId = "reaction_id"
            }
        }

        let existing: [ReactionRow] = try await supabase
            .from("message_reactions")
            .select("reaction_id")
            .eq("message_id", value: messageId)
            .eq("user_id", value: userId)
            .eq("emoji", value: emoji)
            .execute()
            .value

        if let reaction = existing.first {
            try await supabase
                .from("message_reactions")
                .delete()
                .eq("reaction_id", value: reaction.reactionId)
                .execute()
        } else {
            struct NewReaction: Codable {
                let messageId: String
                let userId: String
                let emoji: String
                enum CodingKeys: String, CodingKey {
                    case messageId = "message_id"
                    case userId = "user_id"
                    case emoji
                }
            }

            try await supabase
                .from("message_reactions")
                .insert(NewReaction(messageId: messageId, userId: userId, emoji: emoji))
                .execute()
        }
    }

    // MARK: - Private

    private func handlePresenceChange(_ action: any PresenceAction) {
        // Parse joins
        if let joined: [PresencePayload] = try? action.decodeJoins(as: PresencePayload.self) {
            for payload in joined {
                if !onlineMembers.contains(where: { $0.userId == payload.userId }) {
                    onlineMembers.append(PresenceState(
                        userId: payload.userId,
                        username: payload.username,
                        fullName: payload.fullName,
                        onlineAt: payload.onlineAt,
                        isTyping: payload.isTyping
                    ))
                }
            }
        }

        // Remove leaves
        if let left: [PresencePayload] = try? action.decodeLeaves(as: PresencePayload.self) {
            let leftIds = Set(left.map(\.userId))
            onlineMembers.removeAll { leftIds.contains($0.userId) }
        }

        // Update typing users
        typingUsers = onlineMembers.filter(\.isTyping).map(\.username)
    }
}
