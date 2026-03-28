import Foundation
import Supabase

/// View model for the banter/community chat tab.
@MainActor
@Observable
final class BanterViewModel {
    let poolId: String

    var messages: [PoolMessage] = []
    var messageText = ""
    var isLoading = false
    var isSending = false
    var errorMessage: String?
    var unreadCount: Int = 0
    var reactions: [String: [MessageReaction]] = [:]

    private let realtimeService = RealtimeService()
    private let supabase = SupabaseService.shared.client
    private var isLoadingInProgress = false
    private var pollingTask: Task<Void, Never>?
    private var currentUserId: String?

    init(poolId: String) {
        self.poolId = poolId
    }

    func load() async {
        // Skip if already loading
        guard !isLoadingInProgress else { return }
        // If already have messages and polling, just do a background refresh
        let isInitialLoad = messages.isEmpty

        isLoadingInProgress = true
        if isInitialLoad { isLoading = true }

        do {
            let fetched = try await realtimeService.fetchMessages(poolId: poolId)
            messages = fetched
            print("[BanterVM] Loaded \(fetched.count) messages")
        } catch {
            print("[BanterVM] Failed to fetch messages: \(error)")
            if isInitialLoad {
                errorMessage = error.localizedDescription
            }
        }

        if isInitialLoad { isLoading = false }
        isLoadingInProgress = false

        // Subscribe to new messages (re-subscribe if needed)
        await realtimeService.subscribeToMessages(poolId: poolId)

        // Subscribe to reaction changes
        await realtimeService.subscribeToReactions(poolId: poolId) { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                if let userId = self.currentUserId {
                    await self.loadReactions(userId: userId)
                }
            }
        }

        // Watch for new messages from realtime (only one polling task)
        if pollingTask == nil {
            pollingTask = Task {
                var refetchCounter = 0
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(500))

                    // Check for realtime messages
                    if let newMessage = realtimeService.newMessage {
                        if !messages.contains(where: { $0.messageId == newMessage.messageId }) {
                            messages.append(newMessage)
                            print("[BanterVM] Realtime message received: \(newMessage.messageId)")
                        }
                        realtimeService.newMessage = nil
                    }

                    // Fallback polling disabled for testing realtime
                }
            }
        }
    }

    func sendMessage(
        userId: String,
        messageType: MessageType = .text,
        metadata: [String: AnyJSON]? = nil
    ) async {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        isSending = true
        messageText = ""

        // Optimistic update: add message locally immediately
        let optimisticId = UUID().uuidString
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let optimisticMessage = PoolMessage(
            messageId: optimisticId,
            poolId: poolId,
            userId: userId,
            content: text,
            mentions: [],
            createdAt: formatter.string(from: Date()),
            messageType: messageType,
            replyToMessageId: nil,
            metadata: metadata
        )
        messages.append(optimisticMessage)

        do {
            try await realtimeService.sendMessage(
                poolId: poolId,
                userId: userId,
                content: text,
                messageType: messageType.rawValue,
                metadata: metadata
            )
            print("[BanterVM] Message sent successfully")
            // Refetch to replace optimistic message with real one
            if let fetched = try? await realtimeService.fetchMessages(poolId: poolId) {
                messages = fetched
            }
        } catch {
            errorMessage = error.localizedDescription
            // Remove optimistic message and restore text on failure
            messages.removeAll { $0.messageId == optimisticId }
            messageText = text
        }

        isSending = false
    }

    // MARK: - Reactions

    func setCurrentUserId(_ userId: String) {
        currentUserId = userId
    }

    func reactionsForMessage(_ messageId: String) -> [MessageReaction] {
        reactions[messageId] ?? []
    }

    func loadReactions(userId: String) async {
        currentUserId = userId
        let messageIds = messages.map(\.messageId)
        guard !messageIds.isEmpty else { return }
        do {
            reactions = try await realtimeService.fetchReactions(messageIds: messageIds, userId: userId)
        } catch {
            print("[BanterVM] Failed to load reactions: \(error)")
        }
    }

    func toggleReaction(messageId: String, userId: String, emoji: String) {
        // Optimistic update
        var messageReactions = reactions[messageId] ?? []
        if let index = messageReactions.firstIndex(where: { $0.emoji == emoji }) {
            let existing = messageReactions[index]
            if existing.reactedByMe {
                // Remove own reaction
                if existing.count <= 1 {
                    messageReactions.remove(at: index)
                } else {
                    messageReactions[index] = MessageReaction(emoji: emoji, count: existing.count - 1, reactedByMe: false)
                }
            } else {
                // Add own reaction to existing emoji
                messageReactions[index] = MessageReaction(emoji: emoji, count: existing.count + 1, reactedByMe: true)
            }
        } else {
            // New emoji reaction
            messageReactions.append(MessageReaction(emoji: emoji, count: 1, reactedByMe: true))
        }
        reactions[messageId] = messageReactions.isEmpty ? nil : messageReactions

        // Fire network request in background
        Task {
            do {
                try await realtimeService.toggleReaction(messageId: messageId, userId: userId, emoji: emoji)
            } catch {
                print("[BanterVM] Failed to toggle reaction: \(error)")
                // Refetch to reconcile
                await loadReactions(userId: userId)
            }
        }
    }

    func cleanup() async {
        pollingTask?.cancel()
        pollingTask = nil
        await realtimeService.unsubscribeFromMessages()
        await realtimeService.unsubscribeFromReactions()
    }

    // MARK: - Unread Tracking

    func fetchUnreadCount(userId: String) async {
        do {
            struct ReadRow: Codable {
                let lastReadAt: String?
                enum CodingKeys: String, CodingKey {
                    case lastReadAt = "last_read_at"
                }
            }

            let readRows: [ReadRow] = try await supabase
                .from("pool_members")
                .select("last_read_at")
                .eq("pool_id", value: poolId)
                .eq("user_id", value: userId)
                .limit(1)
                .execute()
                .value

            let lastReadAt = readRows.first?.lastReadAt

            struct MessageId: Codable {
                let messageId: String
                enum CodingKeys: String, CodingKey {
                    case messageId = "message_id"
                }
            }

            if let lastReadAt {
                let msgs: [MessageId] = try await supabase
                    .from("pool_messages")
                    .select("message_id")
                    .eq("pool_id", value: poolId)
                    .gt("created_at", value: lastReadAt)
                    .neq("user_id", value: userId)
                    .execute()
                    .value
                unreadCount = msgs.count
            } else {
                let msgs: [MessageId] = try await supabase
                    .from("pool_messages")
                    .select("message_id")
                    .eq("pool_id", value: poolId)
                    .neq("user_id", value: userId)
                    .execute()
                    .value
                unreadCount = msgs.count
            }
        } catch {
            print("[BanterVM] Failed to fetch unread count: \(error)")
        }
    }

    func markAsRead(userId: String) async {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let now = formatter.string(from: Date())

        do {
            try await supabase
                .from("pool_members")
                .update(["last_read_at": now])
                .eq("pool_id", value: poolId)
                .eq("user_id", value: userId)
                .execute()
            unreadCount = 0
        } catch {
            print("[BanterVM] Failed to mark as read: \(error)")
        }
    }
}
