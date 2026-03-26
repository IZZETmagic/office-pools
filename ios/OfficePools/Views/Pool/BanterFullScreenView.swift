import SwiftUI

struct BanterFullScreenView: View {
    @Bindable var viewModel: BanterViewModel
    let authService: AuthService
    let poolName: String
    let matches: [Match]
    let leaderboardEntries: [LeaderboardEntryData]
    let analyticsData: AnalyticsResponse?
    let entryId: String?
    @Environment(\.dismiss) private var dismiss
    @State private var scrollProxy: ScrollViewProxy?
    @State private var showingQuickActions = false
    @State private var showingMatchPicker = false
    @State private var showingBadgePicker = false
    @FocusState private var isTextFieldFocused: Bool
    @State private var showScrollToBottom = false
    @Namespace private var quickActionAnimation

    private var memberLookup: [String: LeaderboardEntryData] {
        Dictionary(leaderboardEntries.map { ($0.userId, $0) }, uniquingKeysWith: { first, _ in first })
    }

    private func senderInitials(for userId: String) -> String {
        guard let entry = memberLookup[userId] else { return "?" }
        let parts = entry.fullName.split(separator: " ")
        let first = parts.first.map { String($0.prefix(1)) } ?? ""
        let last = parts.count > 1 ? String(parts.last!.prefix(1)) : ""
        return (first + last).uppercased()
    }

    private func parseDate(_ dateString: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: dateString) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: dateString)
    }

    private func shouldShowDateHeader(at index: Int) -> Bool {
        let messages = viewModel.messages
        guard let currentDate = parseDate(messages[index].createdAt) else { return false }
        if index == 0 { return true }
        guard let previousDate = parseDate(messages[index - 1].createdAt) else { return true }
        if !Calendar.current.isDate(currentDate, inSameDayAs: previousDate) { return true }
        return currentDate.timeIntervalSince(previousDate) >= 300
    }

    private func dateHeaderText(for dateString: String) -> String {
        guard let date = parseDate(dateString) else { return "" }
        let calendar = Calendar.current
        let timeFormatter = DateFormatter()
        timeFormatter.timeStyle = .short

        if calendar.isDateInToday(date) {
            return "Today \(timeFormatter.string(from: date))"
        } else if calendar.isDateInYesterday(date) {
            return "Yesterday \(timeFormatter.string(from: date))"
        } else {
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "MMM d"
            return "\(dateFormatter.string(from: date)) \(timeFormatter.string(from: date))"
        }
    }

    private func isFirstInGroup(at index: Int) -> Bool {
        let messages = viewModel.messages
        if index == 0 { return true }
        if messages[index - 1].userId != messages[index].userId { return true }
        if shouldShowDateHeader(at: index) { return true }
        return false
    }

    private func isLastInGroup(at index: Int) -> Bool {
        let messages = viewModel.messages
        if index == messages.count - 1 { return true }
        if messages[index + 1].userId != messages[index].userId { return true }
        if shouldShowDateHeader(at: index + 1) { return true }
        return false
    }

    var body: some View {
        NavigationStack {
        ZStack {
            // MARK: - Messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 4) {
                        ForEach(Array(viewModel.messages.enumerated()), id: \.element.messageId) { index, message in
                            VStack(spacing: 2) {
                                if shouldShowDateHeader(at: index) {
                                    Text(dateHeaderText(for: message.createdAt))
                                        .font(.caption2.weight(.medium))
                                        .foregroundStyle(.secondary)
                                        .padding(.top, index == 0 ? 0 : 8)
                                        .padding(.bottom, 4)
                                }

                                MessageBubble(
                                    message: message,
                                    isOwnMessage: message.userId == authService.appUser?.userId,
                                    senderName: memberLookup[message.userId]?.fullName ?? "",
                                    senderInitials: senderInitials(for: message.userId),
                                    showSenderName: isFirstInGroup(at: index),
                                    showSenderAvatar: isLastInGroup(at: index)
                                )
                            }
                            .id(message.messageId)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top, 8)

                    // Invisible anchor to detect if user scrolled away from bottom
                    Color.clear
                        .frame(height: 1)
                        .id("bottomAnchor")
                        .onScrollVisibilityChange(threshold: 0.0) { visible in
                            withAnimation(.easeInOut(duration: 0.2)) {
                                showScrollToBottom = !visible
                            }
                        }
                }
                .defaultScrollAnchor(.bottom)
                .scrollDismissesKeyboard(.interactively)
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    inputBar
                }
                .overlay(alignment: .bottom) {
                    if showScrollToBottom {
                        Button {
                            withAnimation {
                                proxy.scrollTo("bottomAnchor", anchor: .bottom)
                            }
                        } label: {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.secondary)
                                .frame(width: 36, height: 36)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                                .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
                        }
                        .padding(.bottom, 70)
                        .transition(.scale.combined(with: .opacity))
                    }
                }
                .onAppear { scrollProxy = proxy }
                .onChange(of: viewModel.messages.count) { oldCount, newCount in
                    if let lastId = viewModel.messages.last?.messageId {
                        if oldCount == 0 {
                            // Initial load — jump to bottom after layout
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                                proxy.scrollTo(lastId, anchor: .bottom)
                            }
                        } else {
                            // New message — animate
                            withAnimation {
                                proxy.scrollTo(lastId, anchor: .bottom)
                            }
                        }
                    }
                }
                .onChange(of: isTextFieldFocused) {
                    if isTextFieldFocused, let lastId = viewModel.messages.last?.messageId {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            withAnimation {
                                proxy.scrollTo(lastId, anchor: .bottom)
                            }
                        }
                    }
                }
            }

            // MARK: - Quick Actions Overlay
            if showingQuickActions {
                // Dismiss tap background
                Color.black.opacity(0.15)
                    .ignoresSafeArea()
                    .onTapGesture {
                        withAnimation(.spring(duration: 0.25)) {
                            showingQuickActions = false
                        }
                    }

                // Menu anchored to bottom-left — liquid glass style
                VStack(spacing: 0) {
                    Spacer()
                    VStack(alignment: .leading, spacing: 4) {
                        quickActionRow(icon: "target", iconColor: .orange, label: "Share Prediction") {
                            showingQuickActions = false
                            showingMatchPicker = true
                        }
                        quickActionRow(icon: "trophy.fill", iconColor: .purple, label: "Flex Badges") {
                            showingQuickActions = false
                            showingBadgePicker = true
                        }
                        quickActionRow(icon: "chart.bar.fill", iconColor: .blue, label: "Drop Standings") {
                            showingQuickActions = false
                            sendDropStandings()
                        }
                    }
                    .padding(8)
                    .modifier(GlassEffectQuickActionsModifier())
                    .frame(maxWidth: 240)
                    .padding(.leading, 10)
                    .padding(.bottom, 4)
                    .transition(.scale(scale: 0.5, anchor: .bottomLeading).combined(with: .opacity))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(poolName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task { await viewModel.cleanup() }
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .onAppear {
            Task {
                await viewModel.load()
                // Scroll to bottom after messages load
                if let lastId = viewModel.messages.last?.messageId {
                    try? await Task.sleep(for: .milliseconds(100))
                    scrollProxy?.scrollTo(lastId, anchor: .bottom)
                }
            }
        }
        .sheet(isPresented: $showingMatchPicker) {
            SharePredictionSheet(
                matches: matches,
                entryId: entryId
            ) { text in
                sendQuickAction(text)
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showingBadgePicker) {
            BadgePickerSheet(
                analyticsData: analyticsData
            ) { text in
                sendQuickAction(text)
            }
            .presentationDetents([.medium, .large])
        }
        } // NavigationStack
    }

    // MARK: - Quick Action Row

    private func quickActionRow(icon: String, iconColor: Color, label: String, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.spring(duration: 0.25)) {
                action()
            }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(iconColor.gradient)
                    .clipShape(Circle())

                Text(label)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)

                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Quick Action Send

    private func sendQuickAction(_ text: String) {
        guard let userId = authService.appUser?.userId else { return }
        Task {
            viewModel.messageText = text
            await viewModel.sendMessage(userId: userId)
            if let lastId = viewModel.messages.last?.messageId {
                withAnimation {
                    scrollProxy?.scrollTo(lastId, anchor: .bottom)
                }
            }
        }
    }

    private func sendDropStandings() {
        guard !leaderboardEntries.isEmpty else { return }
        let top5 = leaderboardEntries.prefix(5)
        // Format: 📊 standings
        // name|points|userId per line
        var text = "📊 standings"
        for entry in top5 {
            text += "\n\(entry.fullName)|\(entry.totalPoints)|\(entry.userId)"
        }
        sendQuickAction(text)
    }


    // MARK: - Input Bar

    private var canSend: Bool {
        !viewModel.messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !viewModel.isSending
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 6) {
            // Plus button — Quick Actions
            Button {
                withAnimation(.spring(duration: 0.25)) {
                    showingQuickActions.toggle()
                }
            } label: {
                Image(systemName: showingQuickActions ? "xmark" : "plus")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(.primary)
                    .frame(width: 36, height: 36)
                    .modifier(GlassEffectCircleModifier())
            }

            // Text field
            HStack(alignment: .bottom, spacing: 4) {
                TextField("Banter", text: $viewModel.messageText, axis: .vertical)
                    .focused($isTextFieldFocused)
                    .lineLimit(1...12)
                    .padding(.leading, 12)
                    .padding(.vertical, 8)

                // Send button inside the text field
                Button {
                    Task {
                        if let userId = authService.appUser?.userId {
                            await viewModel.sendMessage(userId: userId)
                            if let lastId = viewModel.messages.last?.messageId {
                                withAnimation {
                                    scrollProxy?.scrollTo(lastId, anchor: .bottom)
                                }
                            }
                        }
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, canSend ? Color.accentColor : Color(.systemGray4))
                }
                .disabled(!canSend)
                .padding(.trailing, 4)
                .padding(.bottom, 2)
            }
            .modifier(GlassEffectRoundedRectModifier())
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }
}

// MARK: - Glass Effect Modifier

private struct GlassEffectQuickActionsModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: .rect(cornerRadius: 20))
        } else {
            content
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .shadow(color: .black.opacity(0.15), radius: 20, y: 8)
        }
    }
}

private struct GlassEffectCircleModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: .circle)
        } else {
            content
        }
    }
}

private struct GlassEffectCapsuleModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: .capsule)
        } else {
            content
        }
    }
}

private struct GlassEffectRoundedRectModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: .rect(cornerRadius: 16))
        } else {
            content
                .background(.fill.tertiary)
                .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }
}

private struct GlassEffectModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: .rect)
        } else {
            content
        }
    }
}

