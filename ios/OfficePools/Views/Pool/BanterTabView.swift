import SwiftUI

struct BanterTabView: View {
    @Bindable var viewModel: BanterViewModel
    let authService: AuthService
    @State private var scrollProxy: ScrollViewProxy?

    var body: some View {
        VStack(spacing: 0) {
            // Messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(viewModel.messages) { message in
                            MessageBubble(
                                message: message,
                                isOwnMessage: message.userId == authService.appUser?.userId
                            )
                            .id(message.messageId)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .onAppear { scrollProxy = proxy }
                .onChange(of: viewModel.messages.count) {
                    if let lastId = viewModel.messages.last?.messageId {
                        withAnimation {
                            proxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            // Input bar
            HStack(spacing: 12) {
                TextField("Message", text: $viewModel.messageText, axis: .vertical)
                    .lineLimit(1...4)
                    .padding(10)
                    .background(.fill.tertiary)
                    .clipShape(RoundedRectangle(cornerRadius: 20))

                Button {
                    Task {
                        if let userId = authService.appUser?.userId {
                            await viewModel.sendMessage(userId: userId)
                        }
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundColor(viewModel.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .secondary : .accentColor)
                }
                .disabled(viewModel.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isSending)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(.bar)
        }
        .task {
            await viewModel.load()
        }
        .onDisappear {
            Task { await viewModel.cleanup() }
        }
    }
}

struct MessageBubble: View {
    let message: PoolMessage
    let isOwnMessage: Bool

    var body: some View {
        HStack {
            if isOwnMessage { Spacer(minLength: 60) }

            VStack(alignment: isOwnMessage ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .font(.subheadline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(isOwnMessage ? Color.accentColor : Color(.systemGray5))
                    .foregroundStyle(isOwnMessage ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                Text(formatTime(message.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            if !isOwnMessage { Spacer(minLength: 60) }
        }
    }

    private func formatTime(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: dateString) else {
            // Try without fractional seconds
            formatter.formatOptions = [.withInternetDateTime]
            guard let date = formatter.date(from: dateString) else { return "" }
            return timeString(date)
        }
        return timeString(date)
    }

    private func timeString(_ date: Date) -> String {
        let tf = DateFormatter()
        tf.timeStyle = .short
        return tf.string(from: date)
    }
}
