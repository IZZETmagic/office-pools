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

    private let realtimeService = RealtimeService()
    private let supabase = SupabaseService.shared.client
    private var isLoadingInProgress = false
    private var pollingTask: Task<Void, Never>?

    init(poolId: String) {
        self.poolId = poolId
    }

    func load() async {
        // Skip if already loading or already have messages with active polling
        guard !isLoadingInProgress else { return }
        if !messages.isEmpty && pollingTask != nil { return }

        isLoadingInProgress = true
        isLoading = true

        do {
            messages = try await realtimeService.fetchMessages(poolId: poolId)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
        isLoadingInProgress = false

        // Subscribe to new messages
        await realtimeService.subscribeToMessages(poolId: poolId)

        // Watch for new messages from realtime (only one polling task)
        if pollingTask == nil {
            pollingTask = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(100))
                    if let newMessage = realtimeService.newMessage {
                        if !messages.contains(where: { $0.messageId == newMessage.messageId }) {
                            messages.append(newMessage)
                        }
                        realtimeService.newMessage = nil
                    }
                }
            }
        }
    }

    func sendMessage(userId: String) async {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        isSending = true
        messageText = ""

        do {
            try await realtimeService.sendMessage(poolId: poolId, userId: userId, content: text)
        } catch {
            errorMessage = error.localizedDescription
            messageText = text // Restore on failure
        }

        isSending = false
    }

    func cleanup() async {
        pollingTask?.cancel()
        pollingTask = nil
        await realtimeService.unsubscribeFromMessages()
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
