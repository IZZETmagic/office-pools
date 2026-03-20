import Foundation

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

    private let realtimeService = RealtimeService()

    init(poolId: String) {
        self.poolId = poolId
    }

    func load() async {
        isLoading = true

        do {
            messages = try await realtimeService.fetchMessages(poolId: poolId)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false

        // Subscribe to new messages
        await realtimeService.subscribeToMessages(poolId: poolId)

        // Watch for new messages from realtime
        Task {
            while true {
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
        await realtimeService.unsubscribeFromMessages()
    }
}
