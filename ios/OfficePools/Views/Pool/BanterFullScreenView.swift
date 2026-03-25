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
    @State private var headerHeight: CGFloat = 56
    @State private var showingQuickActions = false
    @State private var showingMatchPicker = false
    @State private var showingBadgePicker = false
    @FocusState private var isTextFieldFocused: Bool
    @Namespace private var quickActionAnimation

    var body: some View {
        NavigationStack {
        ZStack(alignment: .top) {
            // MARK: - Messages
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
                    .padding(.top, headerHeight + 8)
                }
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    inputBar
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

            // MARK: - Floating Glass Header
            header
                .background(
                    GeometryReader { geo in
                        Color.clear.preference(key: HeaderHeightKey.self, value: geo.size.height)
                    }
                )

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

                // Menu anchored to bottom-left
                VStack(spacing: 0) {
                    Spacer()
                    VStack(alignment: .leading, spacing: 0) {
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
                    .background(.regularMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .shadow(color: .black.opacity(0.15), radius: 20, y: 8)
                    .frame(maxWidth: 240)
                    .padding(.leading, 10)
                    .padding(.bottom, 4)
                    .transition(.scale(scale: 0.5, anchor: .bottomLeading).combined(with: .opacity))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(Color(.systemGroupedBackground))
        .onPreferenceChange(HeaderHeightKey.self) { headerHeight = $0 }
        .task {
            await viewModel.load()
            // Scroll to bottom after messages load
            if let lastId = viewModel.messages.last?.messageId {
                try? await Task.sleep(for: .milliseconds(100))
                scrollProxy?.scrollTo(lastId, anchor: .bottom)
            }
        }
        .onDisappear {
            Task { await viewModel.cleanup() }
        }
        .navigationBarHidden(true)
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
                    .frame(width: 30, height: 30)
                    .background(iconColor.gradient)
                    .clipShape(RoundedRectangle(cornerRadius: 7))

                Text(label)
                    .font(.body)
                    .foregroundStyle(.primary)

                Spacer()
            }
            .padding(.horizontal, 14)
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
        guard let leader = leaderboardEntries.first else { return }
        let top5 = leaderboardEntries.prefix(5)
        var text = "📊 Current standings — \(leader.fullName) leads with \(leader.totalPoints) pts!"
        if top5.count > 1 {
            let rest = top5.dropFirst().enumerated().map { idx, entry in
                "\(idx + 2). \(entry.fullName) (\(entry.totalPoints))"
            }.joined(separator: ", ")
            text += "\n\(rest)"
        }
        sendQuickAction(text)
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(poolName)
                    .font(.headline.weight(.bold))
                Text("\(viewModel.messages.count) messages")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 30, height: 30)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
        .modifier(GlassEffectModifier())
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

            // Text field in capsule
            HStack(alignment: .bottom, spacing: 4) {
                TextField("Banter", text: $viewModel.messageText, axis: .vertical)
                    .focused($isTextFieldFocused)
                    .lineLimit(1...6)
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
            .modifier(GlassEffectCapsuleModifier())
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }
}

// MARK: - Glass Effect Modifier

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

private struct GlassEffectModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: .rect)
        } else {
            content
        }
    }
}

// MARK: - Preference Keys

private struct HeaderHeightKey: PreferenceKey {
    nonisolated static let defaultValue: CGFloat = 56
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

