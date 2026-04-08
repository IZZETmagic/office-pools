import SwiftUI

/// Pools tab — lists all pools the user has joined, with rich card data.
struct PoolsView: View {
    let authService: AuthService
    @Binding var applyPendingFilter: Bool
    @Environment(UnreadBadgeTracker.self) private var badgeTracker: UnreadBadgeTracker?
    @State private var viewModel = DashboardViewModel()
    @State private var navigationPath = NavigationPath()
    @State private var pendingCreatedPool: Pool?
    @State private var scrollOffset: CGFloat = 0
    @State private var sectionsAppeared = false

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                if viewModel.isLoading && viewModel.poolCards.isEmpty {
                    poolsSkeletonView
                        .transition(.opacity)
                } else if viewModel.poolCards.isEmpty {
                    emptyState
                        .transition(.opacity)
                } else {
                    mainContent
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: viewModel.isLoading)
            .navigationBarHidden(true)
            .navigationDestination(for: Pool.self) { pool in
                PoolDetailView(
                    viewModel: PoolDetailViewModel(poolId: pool.poolId),
                    authService: authService,
                    onPoolDeleted: { poolId in
                        viewModel.removePool(poolId: poolId)
                    }
                )
            }
            .navigationDestination(for: PoolDeepLink.self) { link in
                PoolDetailView(
                    viewModel: PoolDetailViewModel(poolId: link.pool.poolId),
                    authService: authService,
                    initialTab: link.tab
                )
            }
            .sheet(isPresented: $viewModel.showJoinSheet) {
                joinPoolSheet
            }
            .fullScreenCover(isPresented: $viewModel.showCreateSheet, onDismiss: {
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
                            await viewModel.addPool(pool, userId: userId)
                        }
                    }
                }
            }
            .task {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadPools(userId: userId)
                    badgeTracker?.totalUnreadBanter = viewModel.poolCards.reduce(0) { $0 + $1.unreadBanterCount }
                    triggerEntranceAnimations()
                }
            }
            .refreshable {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadPools(userId: userId, forceRefresh: true)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }
            .onChange(of: viewModel.poolCards.map(\.unreadBanterCount)) {
                badgeTracker?.totalUnreadBanter = viewModel.poolCards.reduce(0) { $0 + $1.unreadBanterCount }
            }
            .onChange(of: badgeTracker?.refreshTrigger) {
                if let userId = authService.appUser?.userId {
                    Task {
                        await viewModel.loadPools(userId: userId, forceRefresh: true)
                        badgeTracker?.totalUnreadBanter = viewModel.poolCards.reduce(0) { $0 + $1.unreadBanterCount }
                    }
                }
            }
            .onAppear {
                if applyPendingFilter {
                    viewModel.predictionFilter = .pending
                    applyPendingFilter = false
                }
            }
        }
    }

    // MARK: - Scroll Collapse

    private let collapseThreshold: CGFloat = 50

    private var collapseProgress: CGFloat {
        min(1, max(0, scrollOffset / collapseThreshold))
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4 * (1 - collapseProgress)) {
                    HStack(spacing: 0) {
                        Text("Your")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.ink)
                        Text("Pools")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.primary)
                    }

                    Text("Where the banter begins")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                        .opacity(1 - collapseProgress)
                        .frame(maxHeight: collapseProgress < 1 ? nil : 0, alignment: .top)
                        .clipped()
                }

                Spacer()

                Menu {
                    Button { viewModel.showJoinSheet = true } label: {
                        Label("Join Pool", systemImage: "person.badge.plus")
                    }
                    Button { viewModel.showCreateSheet = true } label: {
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

    // MARK: - Filter Bar

    private var filterBar: some View {
        HStack(spacing: 6) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    // Status filter
                    filterMenu(
                        label: viewModel.statusFilter == .all ? "Status" : viewModel.statusFilter.rawValue,
                        isActive: viewModel.statusFilter != .all
                    ) {
                        ForEach(PoolStatusFilter.allCases, id: \.self) { filter in
                            Button {
                                viewModel.statusFilter = filter
                            } label: {
                                HStack {
                                    Text(filter.rawValue)
                                    if viewModel.statusFilter == filter {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    }

                    // Type filter
                    filterMenu(
                        label: viewModel.typeFilter == .all ? "Type" : viewModel.typeFilter.rawValue,
                        isActive: viewModel.typeFilter != .all
                    ) {
                        ForEach(PoolTypeFilter.allCases, id: \.self) { filter in
                            Button {
                                viewModel.typeFilter = filter
                            } label: {
                                HStack {
                                    Text(filter.rawValue)
                                    if viewModel.typeFilter == filter {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    }

                    // Predictions filter
                    filterMenu(
                        label: viewModel.predictionFilter == .all ? "Predictions" : viewModel.predictionFilter.rawValue,
                        isActive: viewModel.predictionFilter != .all
                    ) {
                        ForEach(PoolPredictionFilter.allCases, id: \.self) { filter in
                            Button {
                                viewModel.predictionFilter = filter
                            } label: {
                                HStack {
                                    Text(filter.rawValue)
                                    if viewModel.predictionFilter == filter {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    }

                    // Clear all — only visible when filters are active
                    if viewModel.hasActiveFilters {
                        Button {
                            viewModel.clearAllFilters()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(Color.sp.slate)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            // Sort menu
            Menu {
                ForEach(PoolSortOption.allCases, id: \.self) { option in
                    Button {
                        viewModel.sortBy = option
                    } label: {
                        HStack {
                            Text(option.rawValue)
                            if viewModel.sortBy == option {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            } label: {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.sp.slate)
                    .frame(width: 32, height: 32)
                    .background(Color.white)
                    .clipShape(Circle())
            }
        }
        .padding(.vertical, 8)
    }

    /// Reusable dropdown filter pill — uses invisible Menu overlay to avoid label animation.
    private func filterMenu<Content: View>(
        label: String,
        isActive: Bool,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 13, weight: isActive ? .bold : .medium, design: .rounded))
            Image(systemName: "chevron.down")
                .font(.system(size: 9, weight: .bold))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(isActive ? Color.sp.primary.opacity(0.12) : Color.white)
        .foregroundStyle(isActive ? Color.sp.primary : Color.sp.slate)
        .clipShape(Capsule())
        .overlay {
            Menu {
                content()
            } label: {
                Color.clear
            }
        }
    }

    // MARK: - Main Content

    private var mainContent: some View {
        VStack(spacing: 0) {
            headerSection

            ScrollView {
                LazyVStack(spacing: 12, pinnedViews: [.sectionHeaders]) {
                    Section {
                        if viewModel.filteredPools.isEmpty {
                            emptyFilterState
                        } else {
                            ForEach(viewModel.filteredPools) { card in
                                NavigationLink(value: card.pool) {
                                    PoolListCardView(data: card)
                                }
                                .buttonStyle(.plain)
                                .contextMenu {
                                    poolCardContextMenu(for: card)
                                }
                            }
                        }
                    } header: {
                        filterBar
                            .background(Color.sp.snow)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
                .entranceAnimation(sectionsAppeared, delay: 0.05)
                .background {
                    GeometryReader { geo in
                        Color.clear
                            .preference(
                                key: PoolsScrollOffsetKey.self,
                                value: -geo.frame(in: .named("poolsScroll")).minY
                            )
                    }
                }
            }
            .coordinateSpace(name: "poolsScroll")
            .onPreferenceChange(PoolsScrollOffsetKey.self) { value in
                scrollOffset = value
            }
        }
        .background(Color.sp.snow)
    }

    // MARK: - Pool Card Context Menu

    @ViewBuilder
    private func poolCardContextMenu(for card: PoolCardData) -> some View {
        let inviteLink = "https://sportpool.io/join/\(card.pool.poolCode)"

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

    // MARK: - Animations

    private func triggerEntranceAnimations() {
        guard !sectionsAppeared else { return }
        withAnimation(.easeOut(duration: 0.45)) {
            sectionsAppeared = true
        }
    }

    // MARK: - Empty States

    private var emptyState: some View {
        VStack(spacing: 0) {
            headerSection
            Spacer()
            VStack(spacing: 24) {
                VStack(spacing: 16) {
                    ZStack {
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

                    Text("No pools yet")
                        .font(SPTypography.sectionHeader)
                        .foregroundStyle(Color.sp.ink)

                    Text("Join a pool with a code or create a new one to get started.")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)
                }

                VStack(spacing: 10) {
                    Button {
                        viewModel.showCreateSheet = true
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
                        viewModel.showJoinSheet = true
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
            }
            .padding(24)
            .padding(.horizontal, 20)
            Spacer()
        }
        .background(Color.sp.snow)
    }

    private var emptyFilterState: some View {
        VStack(spacing: 12) {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .font(.system(size: 28))
                .foregroundStyle(Color.sp.slate)
            Text("No pools match these filters")
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.slate)
            Button("Clear Filters") {
                withAnimation(.easeInOut(duration: 0.2)) {
                    viewModel.clearAllFilters()
                }
            }
            .font(SPTypography.cardTitle)
            .foregroundStyle(Color.sp.primary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    // MARK: - Skeleton Loading

    private var poolsSkeletonView: some View {
        VStack(spacing: 0) {
            // Header skeleton
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    SkeletonBlock(width: 160, height: 28, cornerRadius: 8)
                    SkeletonBlock(width: 60, height: 14, cornerRadius: 6)
                }
                Spacer()
                Circle()
                    .fill(Color(.systemGray5))
                    .frame(width: 40, height: 40)
            }
            .padding(.horizontal, 20)
            .padding(.top, 44)
            .padding(.bottom, 12)

            // Filter bar skeleton
            HStack(spacing: 6) {
                ForEach(0..<4, id: \.self) { _ in
                    SkeletonBlock(width: 70, height: 32, cornerRadius: 16)
                }
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 8)

            // Pool cards skeleton
            ScrollView(showsIndicators: false) {
                VStack(spacing: 12) {
                    ForEach(0..<4, id: \.self) { _ in
                        poolCardSkeleton
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
        }
        .background(Color.sp.snow)
        .shimmer()
    }

    private var poolCardSkeleton: some View {
        VStack(alignment: .leading, spacing: 12) {
            SkeletonBlock(width: 160, height: 16, cornerRadius: 6)
            HStack(spacing: 6) {
                SkeletonBlock(width: 50, height: 20, cornerRadius: 10)
                SkeletonBlock(width: 80, height: 20, cornerRadius: 10)
                Spacer()
            }
            SkeletonBlock(height: 60, cornerRadius: 8)
            HStack {
                SkeletonBlock(width: 120, height: 12, cornerRadius: 4)
                Spacer()
                SkeletonBlock(width: 60, height: 20, cornerRadius: 10)
            }
        }
        .padding(16)
        .background {
            RoundedRectangle(cornerRadius: SPDesign.Radius.lg)
                .fill(Color.white)
        }
    }

    // MARK: - Join Pool Sheet

    private var joinPoolSheet: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("Enter a pool code to join")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)

                TextField("Pool Code", text: $viewModel.joinPoolCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .padding()
                    .background(Color.sp.mist)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                    .font(.title3.monospaced())
                    .multilineTextAlignment(.center)

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(SPTypography.caption)
                        .foregroundStyle(Color.sp.red)
                }

                Button {
                    Task {
                        if let userId = authService.appUser?.userId {
                            await viewModel.joinPool(userId: userId, username: authService.appUser?.username ?? "Entry 1")
                        }
                    }
                } label: {
                    Group {
                        if viewModel.isJoining {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Join Pool")
                        }
                    }
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.sp.primary)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                }
                .disabled(viewModel.isJoining || viewModel.joinPoolCode.isEmpty)
                .opacity(viewModel.joinPoolCode.isEmpty ? 0.5 : 1)

                Spacer()
            }
            .padding(24)
            .navigationTitle("Join Pool")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { viewModel.showJoinSheet = false }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Scroll Offset Tracking

private struct PoolsScrollOffsetKey: PreferenceKey {
    nonisolated(unsafe) static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
