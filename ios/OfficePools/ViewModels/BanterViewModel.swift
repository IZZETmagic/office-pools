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

    // Mention autocomplete state
    var mentionQuery: String? = nil
    var mentionCursorPosition: Int = 0
    var selectedMentionIndex: Int = 0

    private let realtimeService = RealtimeService()
    private let apiService = APIService()
    private let supabase = SupabaseService.shared.client
    private var isLoadingInProgress = false
    private var pollingTask: Task<Void, Never>?
    private var currentUserId: String?
    private var senderName: String?

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
        metadata: [String: AnyJSON]? = nil,
        leaderboardEntries: [LeaderboardEntryData] = []
    ) async {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        // Extract mention user IDs before clearing text
        let mentionedUserIds = parseMentionUserIds(from: text, members: leaderboardEntries)

        isSending = true
        messageText = ""
        mentionQuery = nil

        // Optimistic update: add message locally immediately
        let optimisticId = UUID().uuidString
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let optimisticMessage = PoolMessage(
            messageId: optimisticId,
            poolId: poolId,
            userId: userId,
            content: text,
            mentions: mentionedUserIds,
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
                mentions: mentionedUserIds,
                messageType: messageType.rawValue,
                metadata: metadata
            )
            print("[BanterVM] Message sent successfully")

            // Fire-and-forget push to all pool members
            Task {
                do {
                    try await apiService.notifyMessage(
                        poolId: poolId,
                        messageContent: text,
                        senderName: senderName ?? "Someone"
                    )
                    print("[BanterVM] Message push notification sent")
                } catch {
                    print("[BanterVM] Message push notification failed: \(error)")
                }
            }

            // Fire-and-forget mention notifications
            if !mentionedUserIds.isEmpty {
                Task {
                    do {
                        try await apiService.notifyMention(
                            poolId: poolId,
                            mentionedUserIds: mentionedUserIds,
                            messageContent: text,
                            senderName: senderName ?? "Someone"
                        )
                        print("[BanterVM] Mention notification sent for \(mentionedUserIds.count) user(s)")
                    } catch {
                        print("[BanterVM] Mention notification failed: \(error)")
                    }
                }
            }

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

    func setCurrentUser(userId: String, displayName: String?) {
        currentUserId = userId
        senderName = displayName
    }

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

    // MARK: - Mention Helpers

    /// Detect @mention query from text input. Call this on every text change.
    func updateMentionQuery(text: String) {
        // Find the last @ that starts a mention (preceded by whitespace or start of string)
        guard let atRange = text.range(of: #"(^|\s)@(\w*)$"#, options: .regularExpression) else {
            mentionQuery = nil
            return
        }
        let matched = String(text[atRange])
        // Extract the query part after @
        if let atIndex = matched.lastIndex(of: "@") {
            mentionQuery = String(matched[matched.index(after: atIndex)...]).lowercased()
            mentionCursorPosition = text.distance(from: text.startIndex, to: text.range(of: "@", options: .backwards)!.lowerBound)
            selectedMentionIndex = 0
        } else {
            mentionQuery = nil
        }
    }

    /// Filter leaderboard entries for mention autocomplete.
    func filteredMentionMembers(from entries: [LeaderboardEntryData], currentUserId: String?) -> [LeaderboardEntryData] {
        guard let query = mentionQuery else { return [] }
        return entries
            .filter { entry in
                guard entry.userId != currentUserId else { return false }
                if query.isEmpty { return true }
                return entry.fullName.lowercased().contains(query)
                    || entry.username.lowercased().contains(query)
            }
            .prefix(6)
            .map { $0 }
    }

    /// Insert selected mention into the message text, replacing the @query.
    func insertMention(member: LeaderboardEntryData) {
        let before = String(messageText.prefix(mentionCursorPosition))
        let afterAt = String(messageText.dropFirst(mentionCursorPosition))
        // Remove the @query portion
        let cleaned = afterAt.replacingOccurrences(of: #"@\w*"#, with: "", options: .regularExpression, range: afterAt.startIndex..<afterAt.endIndex)
        messageText = before + "@\(member.username) " + cleaned
        mentionQuery = nil
    }

    /// Extract user IDs from @username mentions in message text.
    func parseMentionUserIds(from text: String, members: [LeaderboardEntryData]) -> [String] {
        let pattern = #"@(\w+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let nsString = text as NSString
        let results = regex.matches(in: text, range: NSRange(location: 0, length: nsString.length))

        var ids = Set<String>()
        for match in results {
            let username = nsString.substring(with: match.range(at: 1)).lowercased()
            if let member = members.first(where: { $0.username.lowercased() == username }) {
                ids.insert(member.userId)
            }
        }
        return Array(ids)
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
