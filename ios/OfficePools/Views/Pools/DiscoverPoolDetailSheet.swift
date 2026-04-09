import SwiftUI

/// Slide-up detail sheet for a discovered pool — shows full info, scoring rules, and join button.
struct DiscoverPoolDetailSheet: View {
    let data: DiscoverPoolData
    let isJoining: Bool
    let onJoin: () -> Void
    let onNavigateToPool: () -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var settings: PoolSettings?
    @State private var isLoadingSettings = true
    @State private var showJoinConfirmation = false

    private let poolService = PoolService()

    // MARK: - Colour helpers

    private var modeColor: Color {
        switch data.pool.predictionMode {
        case .fullTournament: return Color(hex: 0x3B6EFF)
        case .progressive: return Color(hex: 0x059669)
        case .bracketPicker: return Color(hex: 0xD97706)
        }
    }

    private var modeName: String {
        switch data.pool.predictionMode {
        case .fullTournament: return "Full Tournament"
        case .progressive: return "Progressive"
        case .bracketPicker: return "Bracket Picker"
        }
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Pool header
                    poolHeader

                    // Info grid
                    infoGrid

                    // Share section
                    shareSection

                    // Scoring rules
                    scoringSection

                    Spacer(minLength: 80)
                }
                .padding(20)
            }
            .background(Color.sp.snow)
            .safeAreaInset(edge: .bottom) {
                bottomAction
            }
            .navigationTitle(data.pool.poolName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.sp.slate)
                    }
                }
            }
            .task {
                await loadSettings()
            }
            .alert("Join Pool?", isPresented: $showJoinConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Join") {
                    onJoin()
                }
            } message: {
                Text("You'll be added to \"\(data.pool.poolName)\" and can start making predictions right away.")
            }
        }
    }

    // MARK: - Pool Header

    private var poolHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Brand strip
            if data.pool.hasBranding {
                HStack(spacing: 6) {
                    Text(data.pool.brandEmoji ?? "")
                    Text(data.pool.brandName ?? "")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                }
                .foregroundStyle(Color.sp.slate)
            }

            // Mode badge
            HStack(spacing: 8) {
                badgePill(modeName, color: modeColor)
                if data.isAlreadyJoined {
                    badgePill("Joined", color: Color.sp.green)
                }
            }

            // Description
            if let desc = data.pool.description, !desc.isEmpty {
                Text(desc)
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
            }
        }
    }

    // MARK: - Info Grid

    private var infoGrid: some View {
        VStack(spacing: 0) {
            infoRow(icon: "person.2.fill", label: "Players") {
                if let max = data.pool.maxParticipants, max > 0 {
                    Text("\(data.memberCount) / \(max)")
                } else {
                    Text("\(data.memberCount)")
                }
            }

            Divider().padding(.leading, 40)

            infoRow(icon: "ticket.fill", label: "Entries per player") {
                Text("\(data.pool.maxEntriesPerUser)")
            }

            Divider().padding(.leading, 40)

            infoRow(icon: "clock.fill", label: "Deadline") {
                if let deadlineStr = data.pool.predictionDeadline {
                    Text(SPDateFormatter.long(deadlineStr))
                } else {
                    Text("No deadline")
                }
            }

            Divider().padding(.leading, 40)

            infoRow(icon: "eye.fill", label: "Visibility") {
                Text("Public")
            }
        }
        .padding(4)
        .spCard()
    }

    private func infoRow<Content: View>(icon: String, label: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundStyle(Color.sp.primary)
                .frame(width: 24)
            Text(label)
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.slate)
            Spacer()
            content()
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.sp.ink)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    // MARK: - Share Section

    private var shareSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Share")
                .font(SPTypography.cardTitle)
                .foregroundStyle(Color.sp.ink)

            HStack(spacing: 10) {
                // Copy code
                Button {
                    UIPasteboard.general.string = data.pool.poolCode
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "doc.on.clipboard")
                            .font(.system(size: 12))
                        Text(data.pool.poolCode)
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    }
                    .foregroundStyle(Color.sp.primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(Color.sp.primary.opacity(0.08))
                    .clipShape(Capsule())
                }

                // Share link
                let inviteLink = "Join my World Cup prediction pool on SportPool!\n\nhttps://sportpool.io/join/\(data.pool.poolCode)"
                ShareLink(item: inviteLink) {
                    HStack(spacing: 6) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 12))
                        Text("Share")
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                    }
                    .foregroundStyle(Color.sp.primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(Color.sp.primary.opacity(0.08))
                    .clipShape(Capsule())
                }
            }
        }
    }

    // MARK: - Scoring Section

    private var scoringSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Scoring Rules")
                .font(SPTypography.cardTitle)
                .foregroundStyle(Color.sp.ink)

            if isLoadingSettings {
                HStack {
                    ProgressView()
                        .controlSize(.small)
                    Text("Loading scoring rules...")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 20)
            } else if let settings {
                VStack(spacing: 12) {
                    scoringCard("Group Stage") {
                        scoreRow("Exact Score", pts: settings.groupExactScore)
                        scoreRow("Correct Difference", pts: settings.groupCorrectDifference)
                        scoreRow("Correct Result", pts: settings.groupCorrectResult)
                    }

                    scoringCard("Knockout Stage") {
                        scoreRow("Exact Score", pts: settings.knockoutExactScore)
                        scoreRow("Correct Difference", pts: settings.knockoutCorrectDifference)
                        scoreRow("Correct Result", pts: settings.knockoutCorrectResult)
                    }

                    if settings.psoEnabled {
                        scoringCard("Penalty Shootout") {
                            if let pts = settings.psoExactScore { scoreRow("Exact Score", pts: pts) }
                            if let pts = settings.psoCorrectDifference { scoreRow("Correct Difference", pts: pts) }
                            if let pts = settings.psoCorrectResult { scoreRow("Correct Result", pts: pts) }
                        }
                    }
                }
            } else {
                Text("Scoring rules not configured yet.")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 12)
            }
        }
    }

    private func scoringCard<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sp.slate)
            content()
        }
        .padding(14)
        .spCard()
    }

    private func scoreRow(_ label: String, pts: Int) -> some View {
        HStack {
            Text(label)
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.slate)
            Spacer()
            Text("\(pts) pts")
                .font(SPTypography.mono(size: 13, weight: .bold))
                .foregroundStyle(Color.sp.ink)
        }
    }

    // MARK: - Bottom Action

    private var bottomAction: some View {
        VStack(spacing: 0) {
            Divider()
            Group {
                if data.isAlreadyJoined {
                    Button {
                        dismiss()
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            onNavigateToPool()
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.right.circle.fill")
                            Text("Go to Pool")
                        }
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(Color.sp.primary)
                        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                    }
                } else {
                    Button {
                        showJoinConfirmation = true
                    } label: {
                        Group {
                            if isJoining {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                HStack(spacing: 8) {
                                    Image(systemName: "person.badge.plus")
                                    Text("Join Pool")
                                }
                            }
                        }
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(Color.sp.primary)
                        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                    }
                    .disabled(isJoining)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .background(.ultraThinMaterial)
        }
    }

    // MARK: - Badge

    private func badgePill(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(color.opacity(0.1))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    // MARK: - Load Settings

    private func loadSettings() async {
        isLoadingSettings = true
        settings = try? await poolService.fetchSettings(poolId: data.pool.poolId)
        isLoadingSettings = false
    }
}
