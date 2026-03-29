import SwiftUI

enum PoolTab: String, CaseIterable {
    case predictions = "Predictions"
    case leaderboard = "Leaderboard"
    case form = "Form"
    case banter = "Banter"
    case rules = "Rules"
    case members = "Members"
    case settings = "Settings"

    var icon: String {
        switch self {
        case .predictions: return "pencil.line"
        case .leaderboard: return "trophy"
        case .form: return "chart.bar.xaxis"
        case .banter: return "bubble.left.and.bubble.right"
        case .rules: return "list.number"
        case .members: return "person.3"
        case .settings: return "gearshape"
        }
    }
}

struct PoolDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(UnreadBadgeTracker.self) private var badgeTracker: UnreadBadgeTracker?
    @State var viewModel: PoolDetailViewModel
    let authService: AuthService
    var onPoolDeleted: ((String) -> Void)?  // poolId
    @State private var selectedTab: PoolTab? = .leaderboard
    @State private var showingEntryDetail = false
    @State private var predictionsViewModel: PredictionsViewModel?
    @State private var tabBarHeight: CGFloat = 40
    @State private var showingBanter = false
    @State private var banterViewModel: BanterViewModel?
    @State private var banterPulse = false
    @State private var banterGlowRadius: CGFloat = 12
    @State private var banterSquishY: CGFloat = 1.0
    @State private var banterSquishX: CGFloat = 1.0
    @State private var showingMemberSearch = false

    private func triggerBanterJelly() {
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.prepare()

        // Squish down — like someone poked it
        withAnimation(.easeIn(duration: 0.12)) {
            banterSquishY = 0.7
            banterSquishX = 1.2
        }
        generator.impactOccurred()

        // Spring back with overshoot
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.35, blendDuration: 0)) {
                banterSquishY = 1.0
                banterSquishX = 1.0
            }

            // Second lighter squish for extra bounce
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                let light = UIImpactFeedbackGenerator(style: .light)
                withAnimation(.easeIn(duration: 0.1)) {
                    banterSquishY = 0.85
                    banterSquishX = 1.1
                }
                light.impactOccurred()

                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.4, blendDuration: 0)) {
                        banterSquishY = 1.0
                        banterSquishX = 1.0
                    }
                }
            }
        }
    }

    private func triggerBanterPulse() {
        let generator = UIImpactFeedbackGenerator(style: .soft)
        generator.prepare()

        // Pulse 1
        withAnimation(.easeInOut(duration: 0.3)) {
            banterPulse = true
            banterGlowRadius = 24
        }
        generator.impactOccurred()

        // Return
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation(.easeInOut(duration: 0.3)) {
                banterPulse = false
                banterGlowRadius = 12
            }

            // Pulse 2
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation(.easeInOut(duration: 0.3)) {
                    banterPulse = true
                    banterGlowRadius = 20
                }
                generator.impactOccurred()

                // Return
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        banterPulse = false
                        banterGlowRadius = 12
                    }

                    // Pulse 3 (softer)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                        withAnimation(.easeInOut(duration: 0.25)) {
                            banterPulse = true
                            banterGlowRadius = 16
                        }
                        generator.impactOccurred()

                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                            withAnimation(.easeInOut(duration: 0.4)) {
                                banterPulse = false
                                banterGlowRadius = 12
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var mainContent: some View {
        if viewModel.isLoading {
            ProgressView("Loading pool...")
        } else if let error = viewModel.errorMessage {
            ContentUnavailableView("Error", systemImage: "exclamationmark.triangle", description: Text(error))
        } else {
            ZStack(alignment: .top) {
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 0) {
                        ForEach(visibleTabs, id: \.self) { tab in
                            contentForTab(tab)
                                .safeAreaPadding(.top, tabBarHeight)
                                .containerRelativeFrame(.horizontal)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollIndicators(.hidden)
                .scrollPosition(id: $selectedTab)

                tabBar
            }
            .overlay(alignment: .bottomTrailing) {
                Button {
                    showingBanter = true
                } label: {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(.white)
                        .frame(width: 60, height: 60)
                        .background(
                            Circle()
                                .fill(AppColors.primary500)
                                .shadow(color: AppColors.primary500.opacity(banterPulse ? 0.8 : 0.4), radius: banterGlowRadius, y: 6)
                        )
                        .overlay(
                            Circle()
                                .stroke(.white.opacity(0.3), lineWidth: 1.5)
                        )
                        .scaleEffect(x: banterSquishX, y: banterSquishY)
                        .scaleEffect(banterPulse ? 1.12 : 1.0)
                }
                .overlay(alignment: .topTrailing) {
                    if let vm = banterViewModel, vm.unreadCount > 0 {
                        Text("\(vm.unreadCount)")
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(AppColors.error500, in: Capsule())
                            .offset(x: 4, y: -4)
                            .transition(.scale.combined(with: .opacity))
                    }
                }
                .padding(.trailing, 16)
                .padding(.bottom, 16)
            }
        }
    }

    var body: some View {
        mainContent
        .navigationTitle(viewModel.pool?.poolName ?? "Pool")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if selectedTab == .members {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            showingMemberSearch.toggle()
                        }
                    } label: {
                        Image(systemName: showingMemberSearch ? "xmark" : "magnifyingglass")
                            .font(.system(size: 14, weight: .semibold))
                    }
                }
            }
        }
        .onChange(of: selectedTab) { _, newTab in
            if newTab != .members {
                showingMemberSearch = false
            }
        }
        .navigationDestination(for: Member.self) { member in
            MemberDetailView(
                member: member,
                leaderboardData: viewModel.leaderboardData,
                currentUserId: viewModel.currentUserId ?? "",
                poolService: PoolService(),
                adminCount: viewModel.members.filter(\.isAdmin).count,
                currentUserIsAdmin: viewModel.isAdmin
            )
        }
        .sheet(isPresented: $showingBanter) {
            if let banterVM = banterViewModel {
                BanterFullScreenView(
                    viewModel: banterVM,
                    authService: authService,
                    poolName: viewModel.pool?.poolName ?? "Chat",
                    matches: viewModel.matches,
                    leaderboardEntries: viewModel.leaderboardData,
                    analyticsData: viewModel.selectedEntry.flatMap { viewModel.analyticsData[$0.entryId] },
                    entryId: viewModel.selectedEntry?.entryId
                )
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
            }
        }
        .onChange(of: showingBanter) { _, isShowing in
            if isShowing, let userId = authService.appUser?.userId {
                // Tell the badge tracker we're viewing this pool's chat
                badgeTracker?.activePoolId = viewModel.poolId
                let previousCount = banterViewModel?.unreadCount ?? 0
                Task {
                    await banterViewModel?.markAsRead(userId: userId)
                    // Update tab badge immediately
                    if previousCount > 0 {
                        badgeTracker?.totalUnreadBanter = max(0, (badgeTracker?.totalUnreadBanter ?? 0) - previousCount)
                        badgeTracker?.refreshTrigger += 1
                    }
                }
            }
            if !isShowing, let userId = authService.appUser?.userId {
                // No longer viewing this pool's chat
                badgeTracker?.activePoolId = nil
                // Refresh unread count when returning from chat
                Task {
                    await banterViewModel?.fetchUnreadCount(userId: userId)
                }
            }
        }
        .onChange(of: badgeTracker?.refreshTrigger) {
            // New message arrived — refresh the banter button badge
            if !showingBanter, let userId = authService.appUser?.userId {
                Task {
                    await banterViewModel?.fetchUnreadCount(userId: userId)
                }
                // Pulse glow animation with haptic
                triggerBanterPulse()
            }
        }
        .onAppear {
            if banterViewModel == nil {
                banterViewModel = BanterViewModel(poolId: viewModel.poolId)
            }
            // Fetch unread count for chat button badge
            if let userId = authService.appUser?.userId {
                Task {
                    await banterViewModel?.fetchUnreadCount(userId: userId)
                }
            }
            guard viewModel.pool == nil else { return }  // Already loaded
            Task {
                if let userId = authService.appUser?.userId {
                    print("[PoolDetailView] Loading pool \(viewModel.poolId)")
                    await viewModel.load(userId: userId)
                    if predictionsViewModel == nil {
                        predictionsViewModel = PredictionsViewModel(poolId: viewModel.poolId)
                    }
                } else {
                    viewModel.errorMessage = "Not signed in"
                    viewModel.isLoading = false
                }
            }
        }
        .task {
            // Real-time score subscription — .task ties to view lifecycle automatically
            // (cancelled when view is removed from hierarchy, not on tab switches)
            await viewModel.startScoresSubscription()
        }
    }

    private var tabBar: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 20) {
                    ForEach(visibleTabs, id: \.self) { tab in
                        Button {
                            withAnimation {
                                selectedTab = tab
                            }
                        } label: {
                            Text(tab.rawValue)
                                .font(.subheadline.weight(selectedTab == tab ? .bold : .regular))
                                .foregroundStyle(selectedTab == tab ? .primary : .secondary)
                        }
                        .buttonStyle(.plain)
                        .id(tab)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            .onChange(of: selectedTab) { _, newTab in
                withAnimation(.easeInOut(duration: 0.3)) {
                    proxy.scrollTo(newTab, anchor: .center)
                }
            }
        }
        .background(.ultraThinMaterial)
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .onAppear { tabBarHeight = geo.size.height }
                    .onChange(of: geo.size.height) { _, newHeight in
                        tabBarHeight = newHeight
                    }
            }
        )
    }

    @ViewBuilder
    private func contentForTab(_ tab: PoolTab) -> some View {
        switch tab {
            case .predictions:
                if let predVM = predictionsViewModel {
                    PredictionsTabView(
                        viewModel: predVM,
                        matches: viewModel.matches,
                        teams: viewModel.teams,
                        selectedEntry: Bindable(viewModel).selectedEntry,
                        entries: viewModel.currentMember?.entries ?? [],
                        pool: viewModel.pool,
                        settings: viewModel.settings,
                        computedPoints: viewModel.selectedEntry.flatMap { viewModel.displayPoints(for: $0.entryId) },
                        pointsForEntry: { viewModel.displayPoints(for: $0) },
                        onEntryCreated: {
                            if let userId = authService.appUser?.userId {
                                await viewModel.load(userId: userId)
                            }
                        },
                        showingEntryDetail: $showingEntryDetail
                    )
                } else {
                    ProgressView("Loading...")
                }

            case .leaderboard:
                LeaderboardTabView(
                    poolId: viewModel.poolId,
                    leaderboardData: viewModel.leaderboardData,
                    response: viewModel.leaderboardResponse,
                    currentUserId: viewModel.currentUserId,
                    awardsForEntry: { viewModel.awards(for: $0) },
                    isCurrentUser: { viewModel.isCurrentUser(entryId: $0) }
                )

            case .form:
                FormTabView(
                    poolId: viewModel.poolId,
                    entries: viewModel.currentMember?.entries ?? [],
                    selectedEntry: viewModel.selectedEntry,
                    preloadedAnalytics: viewModel.analyticsData
                )

            case .banter:
                if let banterVM = banterViewModel {
                    BanterTabView(
                        viewModel: banterVM,
                        authService: authService,
                        leaderboardEntries: viewModel.leaderboardData
                    )
                }

            case .rules:
                ScoringRulesTabView(
                    pool: viewModel.pool,
                    settings: viewModel.settings
                )

            case .members:
                MembersTabView(
                    members: viewModel.members,
                    leaderboardData: viewModel.leaderboardData,
                    currentUserId: viewModel.currentUserId ?? "",
                    poolService: PoolService(),
                    showingSearch: $showingMemberSearch
                )

            case .settings:
                PoolSettingsTabView(
                    pool: viewModel.pool,
                    currentUserId: viewModel.currentUserId ?? "",
                    poolService: PoolService(),
                    onPoolDeleted: {
                        onPoolDeleted?(viewModel.poolId)
                        dismiss()
                    }
                )
            }
    }

    private var visibleTabs: [PoolTab] {
        var tabs: [PoolTab] = [.leaderboard, .predictions, .form, .rules]
        if viewModel.isAdmin {
            tabs.append(contentsOf: [.members, .settings])
        }
        return tabs
    }
}

// MARK: - Liquid Glass Bar Modifier

private struct LiquidGlassBar: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular, in: .rect)
        } else {
            content
                .background(.ultraThinMaterial)
        }
    }
}
