import SwiftUI

/// Home tab -- shows greeting, stats, live matches, pool cards, and upcoming matches.
struct HomeView: View {
    let authService: AuthService
    var switchToPoolsTab: () -> Void = {}
    @Environment(UnreadBadgeTracker.self) private var badgeTracker: UnreadBadgeTracker?
    @State private var viewModel = HomeViewModel()

    // Join/Create pool state + scroll tracking
    @State private var showJoinSheet = false
    @State private var showCreateSheet = false
    @State private var scrollOffset: CGFloat = 0
    @State private var joinPoolCode = ""
    @State private var isJoining = false
    @State private var joinError: String?
    @State private var navigationPath = NavigationPath()
    @State private var pendingCreatedPool: Pool?

    // Entrance animation
    @State private var sectionsAppeared = false

    private let poolService = PoolService()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                if viewModel.isLoading && viewModel.poolCards.isEmpty {
                    HomeSkeletonView()
                        .transition(.opacity)
                } else if let error = viewModel.errorMessage, viewModel.poolCards.isEmpty {
                    errorState(error)
                        .transition(.opacity)
                } else {
                    mainContent
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: viewModel.isLoading)
            .navigationBarTitleDisplayMode(.inline)
            .task {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadHomeData(userId: userId)
                    triggerEntranceAnimations()
                }
            }
            .refreshable {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadHomeData(userId: userId)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }
            .onChange(of: badgeTracker?.refreshTrigger) {
                if let userId = authService.appUser?.userId {
                    Task {
                        await viewModel.loadHomeData(userId: userId)
                    }
                }
            }
            .sheet(isPresented: $showJoinSheet) {
                homeJoinPoolSheet
            }
            .fullScreenCover(isPresented: $showCreateSheet, onDismiss: {
                if let pool = pendingCreatedPool {
                    pendingCreatedPool = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        navigationPath.append(pool)
                    }
                }
            }) {
                CreatePoolView(
                    userId: authService.appUser?.userId ?? "",
                    username: authService.appUser?.username ?? "Entry 1"
                ) { pool in
                    pendingCreatedPool = pool
                    Task {
                        if let userId = authService.appUser?.userId {
                            await viewModel.loadHomeData(userId: userId)
                        }
                    }
                }
            }
            .navigationDestination(for: Pool.self) { pool in
                PoolDetailView(
                    viewModel: PoolDetailViewModel(poolId: pool.poolId),
                    authService: authService
                )
            }
            .navigationDestination(for: PoolDeepLink.self) { link in
                PoolDetailView(
                    viewModel: PoolDetailViewModel(poolId: link.pool.poolId),
                    authService: authService,
                    initialTab: link.tab
                )
            }
            .navigationDestination(for: Match.self) { match in
                MatchDetailView(
                    match: match,
                    authService: authService
                )
            }
        }
    }

    // MARK: - Main Content

    private var daysUntilKickoff: Int {
        let kickoff = Calendar.current.date(from: DateComponents(year: 2026, month: 6, day: 11))!
        return max(0, Calendar.current.dateComponents([.day], from: Date(), to: kickoff).day ?? 0)
    }

    /// How far the user scrolls before the header is fully collapsed.
    private let collapseThreshold: CGFloat = 50

    /// 0 = expanded, 1 = fully collapsed.
    private var collapseProgress: CGFloat {
        min(1, max(0, scrollOffset / collapseThreshold))
    }

    private var mainContent: some View {
        VStack(spacing: 0) {
            headerSection
            ScrollView {
                VStack(spacing: 24) {
                    if viewModel.poolCards.isEmpty {
                        emptyStateSection
                            .entranceAnimation(sectionsAppeared, delay: 0.05)
                    } else {
                        quickStatsSection
                            .entranceAnimation(sectionsAppeared, delay: 0.05)

                        liveMatchSection
                            .entranceAnimation(sectionsAppeared, delay: 0.1)

                        if daysUntilKickoff > 0 {
                            CountdownHero(
                                tournamentName: "FIFA World Cup 2026",
                                daysRemaining: daysUntilKickoff
                            )
                            .padding(.horizontal, 20)
                            .entranceAnimation(sectionsAppeared, delay: 0.15)
                        }

                        nextKickoffSection
                            .entranceAnimation(sectionsAppeared, delay: 0.15)

                        predictionsAlertSection
                            .entranceAnimation(sectionsAppeared, delay: 0.2)

                        yourPoolsSection
                            .entranceAnimation(sectionsAppeared, delay: 0.25)

                        inviteFriendsSection
                            .entranceAnimation(sectionsAppeared, delay: 0.3)

                        upcomingMatchesSection
                            .entranceAnimation(sectionsAppeared, delay: 0.35)
                    }
                }
                .padding(.top, 20)
                .padding(.bottom, 32)
                .background {
                    GeometryReader { geo in
                        Color.clear
                            .preference(
                                key: ScrollOffsetKey.self,
                                value: -geo.frame(in: .named("homeScroll")).minY
                            )
                    }
                }
            }
            .coordinateSpace(name: "homeScroll")
            .onPreferenceChange(ScrollOffsetKey.self) { value in
                scrollOffset = value
            }
        }
        .background(Color.sp.snow)
        .navigationBarHidden(true)
    }

    // MARK: - Live Matches

    @ViewBuilder
    private var liveMatchSection: some View {
        if !viewModel.liveMatches.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("Live Now")
                    .font(SPTypography.sectionHeader)
                    .foregroundStyle(Color.sp.ink)
                    .padding(.horizontal, 20)

                ForEach(viewModel.liveMatches) { match in
                    NavigationLink(value: match) {
                        LiveMatchCard(match: match)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 20)
                }
            }
        }
    }

    // MARK: - Empty State

    private var emptyStateSection: some View {
        VStack(spacing: 24) {
            // Hero illustration area
            VStack(spacing: 16) {
                ZStack {
                    // Background circles for depth
                    Circle()
                        .fill(Color.sp.primary.opacity(0.08))
                        .frame(width: 120, height: 120)
                    Circle()
                        .fill(Color.sp.primary.opacity(0.15))
                        .frame(width: 80, height: 80)
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(hex: 0xFBBF24), Color(hex: 0xD97706)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                }

                Text("Better with friends")
                    .font(SPTypography.sectionHeader)
                    .foregroundStyle(Color.sp.ink)

                Text("Create a pool or join one with a code to start predicting the World Cup together.")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 20)
            }

            // CTA buttons
            VStack(spacing: 10) {
                Button {
                    showCreateSheet = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "plus.circle.fill")
                        Text("Create a Pool")
                    }
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.sp.primary)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                }

                Button {
                    showJoinSheet = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "person.badge.plus")
                        Text("Join with Code")
                    }
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.primary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.sp.primary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                }
            }

            // Social proof nudge
            HStack(spacing: 6) {
                Image(systemName: "person.3.fill")
                    .font(.caption2)
                    .foregroundStyle(Color.sp.slate)
                Text("Pools are more fun with 4+ people")
                    .font(SPTypography.caption)
                    .foregroundStyle(Color.sp.slate)
            }
        }
        .padding(24)
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        .padding(.horizontal, 20)
    }

    // MARK: - Next Kickoff

    @ViewBuilder
    private var nextKickoffSection: some View {
        if daysUntilKickoff == 0,
           viewModel.liveMatches.isEmpty,
           let nextMatch = viewModel.nextUpcomingMatch {
            NavigationLink(value: nextMatch) {
                NextKickoffCard(
                    nextMatch: nextMatch,
                    matchesToday: viewModel.matchesToday
                )
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Quick Stats

    @ViewBuilder
    private var quickStatsSection: some View {
        if !viewModel.poolCards.isEmpty {
            HStack(spacing: 10) {
                StatCardView(
                    title: "Streak",
                    value: "\(viewModel.bestStreak)",
                    systemImage: "flame.fill",
                    gradient: [Color(hex: 0xF97316), Color(hex: 0xEF4444)]
                )
                StatCardView(
                    title: "Best Rank",
                    value: viewModel.bestRank.map { "#\($0)" } ?? "--",
                    systemImage: "trophy.fill",
                    gradient: [Color(hex: 0xFBBF24), Color(hex: 0xD97706)]
                )
                StatCardView(
                    title: "Points",
                    value: "\(viewModel.totalPoints)",
                    systemImage: "bolt.fill",
                    gradient: [Color(hex: 0x667EEA), Color(hex: 0x3B6EFF)]
                )
            }
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Predictions Alert

    @ViewBuilder
    private var predictionsAlertSection: some View {
        let poolsNeedingPredictions = viewModel.poolCards.filter(\.needsPredictions)
        if !poolsNeedingPredictions.isEmpty {
            Button {
                switchToPoolsTab()
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(Color.sp.amber)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(poolsNeedingPredictions.count) pool\(poolsNeedingPredictions.count == 1 ? " needs" : "s need") predictions")
                            .font(SPTypography.cardTitle)
                            .foregroundStyle(Color.sp.ink)
                        Text("Submit before the deadline")
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.slate)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.sp.slate)
                }
                .padding(14)
                .background(Color.sp.amberLight)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Invite Friends

    @ViewBuilder
    private var inviteFriendsSection: some View {
        let smallPools = viewModel.poolCards.filter { $0.memberCount < 4 && $0.isAdmin }
        if let pool = smallPools.first {
            let shareText = "Join my World Cup prediction pool on SportPool!\n\nhttps://sportpool.io/join/\(pool.pool.poolCode)"

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: "person.2.fill")
                        .font(.title3)
                        .foregroundStyle(Color.sp.primary)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(pool.pool.poolName) needs more players")
                            .font(SPTypography.cardTitle)
                            .foregroundStyle(Color.sp.ink)
                        Text("\(pool.memberCount) member\(pool.memberCount == 1 ? "" : "s") — invite friends to make it competitive")
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.slate)
                    }

                    Spacer()
                }

                ShareLink(item: shareText) {
                    HStack {
                        Image(systemName: "square.and.arrow.up")
                        Text("Share Invite")
                    }
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.sp.primary)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                }
            }
            .padding(16)
            .background(Color.sp.primaryLight)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Upcoming Matches

    @ViewBuilder
    private var upcomingMatchesSection: some View {
        if !viewModel.upcomingMatches.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("Upcoming Matches")
                    .font(SPTypography.sectionHeader)
                    .foregroundStyle(Color.sp.ink)
                    .padding(.horizontal, 20)

                VStack(spacing: 8) {
                    ForEach(viewModel.upcomingMatches) { match in
                        NavigationLink(value: match) {
                            DashboardMatchCard(match: match)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    // MARK: - Your Pools

    @ViewBuilder
    private var yourPoolsSection: some View {
        if !viewModel.poolCards.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Your Pools")
                        .font(SPTypography.sectionHeader)
                        .foregroundStyle(Color.sp.ink)
                    Spacer()
                    Text("\(viewModel.poolCards.count)")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                }
                .padding(.horizontal, 20)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(viewModel.poolCards) { card in
                            NavigationLink(value: card.pool) {
                                DashboardPoolCard(data: card)
                            }
                            .buttonStyle(.plain)
                            .contextMenu {
                                poolCardContextMenu(for: card)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
    }

    // MARK: - Pool Card Context Menu

    @ViewBuilder
    private func poolCardContextMenu(for card: PoolCardData) -> some View {
        let inviteLink = "https://sportpool.io/join/\(card.pool.poolCode)"

        // Sharing actions
        Section {
            Button {
                UIPasteboard.general.string = card.pool.poolCode
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            } label: {
                Label("Copy Pool Code", systemImage: "doc.on.clipboard")
            }

            Button {
                UIPasteboard.general.string = inviteLink
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            } label: {
                Label("Copy Invite Link", systemImage: "link")
            }

            ShareLink(item: "Join my World Cup prediction pool on SportPool!\n\n\(inviteLink)") {
                Label("Share Invite", systemImage: "square.and.arrow.up")
            }
        }

        // Quick actions
        Section {
            Button {
                navigationPath.append(PoolDeepLink(pool: card.pool, tab: .leaderboard))
            } label: {
                Label("View Leaderboard", systemImage: "list.number")
            }

            if card.needsPredictions {
                Button {
                    navigationPath.append(PoolDeepLink(pool: card.pool, tab: .predictions))
                } label: {
                    Label("Make Predictions", systemImage: "pencil.line")
                }
            }
        }
    }

    // MARK: - Header (sticky with fade)

    private var headerSection: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4 * (1 - collapseProgress)) {
                    HStack(spacing: 0) {
                        Text("Sport")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.ink)
                        Text("Pool")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.primary)
                    }

                    Text("\(viewModel.greeting), \(authService.appUser?.fullName ?? "friend")")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                        .opacity(1 - collapseProgress)
                        .frame(maxHeight: collapseProgress < 1 ? nil : 0, alignment: .top)
                        .clipped()
                }

                Spacer()

                Menu {
                    Button { showJoinSheet = true } label: {
                        Label("Join Pool", systemImage: "person.badge.plus")
                    }
                    Button { showCreateSheet = true } label: {
                        Label("Create Pool", systemImage: "plus.rectangle.on.folder")
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color.sp.ink)
                        .frame(width: 40, height: 40)
                        .background(.ultraThinMaterial)
                        .clipShape(Circle())
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 44 - (12 * collapseProgress))
            .padding(.bottom, 12 - (4 * collapseProgress))
            .background(Color.sp.snow)
        }
        .animation(.easeOut(duration: 0.15), value: collapseProgress)
    }

    // MARK: - Animations

    private func triggerEntranceAnimations() {
        guard !sectionsAppeared else { return }
        withAnimation(.easeOut(duration: 0.45)) {
            sectionsAppeared = true
        }
    }

    // MARK: - Error State

    private func errorState(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Unable to Load", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Try Again") {
                Task {
                    if let userId = authService.appUser?.userId {
                        await viewModel.loadHomeData(userId: userId)
                    }
                }
            }
            .buttonStyle(.borderedProminent)
        }
    }
    // MARK: - Join Pool Sheet

    private var homeJoinPoolSheet: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("Enter a pool code to join")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                TextField("Pool Code", text: $joinPoolCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .padding()
                    .background(.fill.tertiary)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .font(.title3.monospaced())
                    .multilineTextAlignment(.center)

                if let error = joinError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                Button {
                    Task {
                        guard let userId = authService.appUser?.userId else { return }
                        let username = authService.appUser?.username ?? "Entry 1"
                        isJoining = true
                        joinError = nil
                        do {
                            _ = try await poolService.joinPool(poolCode: joinPoolCode, userId: userId, username: username)
                            joinPoolCode = ""
                            showJoinSheet = false
                            // Reload home data to show new pool
                            await viewModel.loadHomeData(userId: userId)
                        } catch {
                            joinError = error.localizedDescription
                        }
                        isJoining = false
                    }
                } label: {
                    Group {
                        if isJoining {
                            ProgressView()
                        } else {
                            Text("Join Pool")
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .font(.headline)
                }
                .disabled(isJoining || joinPoolCode.isEmpty)

                Spacer()
            }
            .padding(24)
            .navigationTitle("Join Pool")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showJoinSheet = false }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Pool Deep Link

struct PoolDeepLink: Hashable {
    let pool: Pool
    let tab: PoolTab
}

// MARK: - Scroll Offset Tracking

private struct ScrollOffsetKey: PreferenceKey {
    nonisolated(unsafe) static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

// MARK: - Entrance Animation Modifier

private struct EntranceAnimationModifier: ViewModifier {
    let appeared: Bool
    let delay: Double

    func body(content: Content) -> some View {
        content
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 16)
            .animation(.easeOut(duration: 0.4).delay(delay), value: appeared)
    }
}

extension View {
    func entranceAnimation(_ appeared: Bool, delay: Double = 0) -> some View {
        modifier(EntranceAnimationModifier(appeared: appeared, delay: delay))
    }
}

#Preview {
    HomeView(authService: AuthService())
}
