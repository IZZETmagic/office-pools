import SwiftUI

enum PoolsSegment: String, CaseIterable {
    case myPools = "My Pools"
    case discover = "Discover"
}

/// Pools tab — lists all pools the user has joined, with rich card data.
struct PoolsView: View {
    let authService: AuthService
    @Binding var applyPendingFilter: Bool
    @Environment(UnreadBadgeTracker.self) private var badgeTracker: UnreadBadgeTracker?
    @Environment(AppDataStore.self) private var dataStore
    @State private var viewModel = DashboardViewModel()
    @State private var discoverVM = DiscoverViewModel()
    @State private var navigationPath = NavigationPath()
    @State private var pendingCreatedPool: Pool?
    @State private var scrollOffset: CGFloat = 0
    @State private var sectionsAppeared = false
    @State private var selectedSegment: PoolsSegment = .myPools
    @State private var selectedDiscoverPool: DiscoverPoolData?
    @State private var joinMode: PoolsJoinMode = .code

    private enum PoolsJoinMode { case code, scan }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                if selectedSegment == .discover {
                    discoverContent
                        .transition(.opacity)
                } else if dataStore.poolCards.isEmpty && dataStore.isPreloading {
                    poolsSkeletonView
                        .transition(.opacity)
                } else if dataStore.poolCards.isEmpty {
                    emptyState
                        .transition(.opacity)
                } else {
                    mainContent
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: dataStore.isPreloading)
            .animation(.easeInOut(duration: 0.25), value: selectedSegment)
            .navigationBarHidden(true)
            .navigationDestination(for: Pool.self) { pool in
                PoolDetailView(
                    viewModel: PoolDetailViewModel(poolId: pool.poolId),
                    authService: authService,
                    onPoolDeleted: { poolId in
                        dataStore.removePool(poolId: poolId)
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
                            await viewModel.addPool(pool, userId: userId, dataStore: dataStore)
                        }
                    }
                }
            }
            .task {
                // Data is already preloaded; just update badge and animate
                badgeTracker?.totalUnreadBanter = dataStore.poolCards.reduce(0) { $0 + $1.unreadBanterCount }
                triggerEntranceAnimations()
            }
            .refreshable {
                if let userId = authService.appUser?.userId {
                    await dataStore.refresh(userId: userId)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }
            .onChange(of: dataStore.poolCards.map(\.unreadBanterCount)) {
                badgeTracker?.totalUnreadBanter = dataStore.poolCards.reduce(0) { $0 + $1.unreadBanterCount }
            }
            .onChange(of: badgeTracker?.refreshTrigger) {
                if let userId = authService.appUser?.userId {
                    Task {
                        await dataStore.refresh(userId: userId)
                        badgeTracker?.totalUnreadBanter = dataStore.poolCards.reduce(0) { $0 + $1.unreadBanterCount }
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
                        Text(selectedSegment == .myPools ? "Your" : "Discover")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.ink)
                        Text("Pools")
                            .font(SPTypography.pageTitle)
                            .foregroundStyle(Color.sp.primary)
                    }

                    Text(selectedSegment == .myPools ? "Where the banter begins" : "Find a pool to join")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                        .opacity(1 - collapseProgress)
                        .frame(maxHeight: collapseProgress < 1 ? nil : 0, alignment: .top)
                        .clipped()
                }

                Spacer()

                if selectedSegment == .myPools {
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
            }
            .padding(.horizontal, 20)
            .padding(.top, 44 - (12 * collapseProgress))
            .padding(.bottom, 8 - (4 * collapseProgress))

            // Segment picker
            segmentPicker
                .padding(.horizontal, 20)
                .padding(.bottom, 4)
        }
        .background(Color.sp.snow)
        .animation(.easeOut(duration: 0.15), value: collapseProgress)
    }

    // MARK: - Segment Picker

    private var segmentPicker: some View {
        HStack(spacing: 4) {
            ForEach(PoolsSegment.allCases, id: \.self) { segment in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedSegment = segment
                    }
                    if segment == .discover && !discoverVM.hasLoaded {
                        Task {
                            if let userId = authService.appUser?.userId {
                                await discoverVM.loadPools(userId: userId)
                            }
                        }
                    }
                } label: {
                    Text(segment.rawValue)
                        .font(.system(size: 13, weight: selectedSegment == segment ? .bold : .medium, design: .rounded))
                        .foregroundStyle(selectedSegment == segment ? Color.sp.primary : Color.sp.slate)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 7)
                        .background(selectedSegment == segment ? Color.sp.primary.opacity(0.12) : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
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
                    .background(Color.sp.surface)
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
        .background(isActive ? Color.sp.primary.opacity(0.12) : Color.sp.surface)
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
                        let filtered = viewModel.filteredPools(from: dataStore.poolCards)
                        if filtered.isEmpty {
                            emptyFilterState
                        } else {
                            ForEach(filtered) { card in
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
                .fill(Color.sp.surface)
        }
    }

    // MARK: - Discover Content

    private var discoverContent: some View {
        VStack(spacing: 0) {
            headerSection

            // Search bar
            HStack(spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.sp.slate)
                    TextField("Search public pools...", text: $discoverVM.searchText)
                        .font(.system(size: 14, design: .rounded))
                        .submitLabel(.search)
                        .onSubmit {
                            Task {
                                if let userId = authService.appUser?.userId {
                                    await discoverVM.loadPools(userId: userId)
                                }
                            }
                        }
                    if !discoverVM.searchText.isEmpty {
                        Button {
                            discoverVM.searchText = ""
                            Task {
                                if let userId = authService.appUser?.userId {
                                    await discoverVM.loadPools(userId: userId)
                                }
                            }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(Color.sp.slate)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(Color.sp.surface)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)

            // Mode filter pills
            discoverFilterBar
                .padding(.horizontal, 20)
                .padding(.vertical, 8)

            // Results
            ScrollView {
                LazyVStack(spacing: 12) {
                    if discoverVM.isLoading && !discoverVM.hasLoaded {
                        ForEach(0..<4, id: \.self) { _ in
                            poolCardSkeleton
                        }
                        .shimmer()
                    } else if let error = discoverVM.errorMessage {
                        VStack(spacing: 12) {
                            Image(systemName: "wifi.exclamationmark")
                                .font(.system(size: 28))
                                .foregroundStyle(Color.sp.slate)
                            Text(error)
                                .font(SPTypography.body)
                                .foregroundStyle(Color.sp.slate)
                            Button("Try Again") {
                                Task {
                                    if let userId = authService.appUser?.userId {
                                        await discoverVM.loadPools(userId: userId)
                                    }
                                }
                            }
                            .font(SPTypography.cardTitle)
                            .foregroundStyle(Color.sp.primary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 60)
                    } else if discoverVM.pools.isEmpty && discoverVM.hasLoaded {
                        discoverEmptyState
                    } else {
                        ForEach(discoverVM.pools) { item in
                            Button {
                                selectedDiscoverPool = item
                            } label: {
                                DiscoverPoolCardView(data: item)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .refreshable {
                if let userId = authService.appUser?.userId {
                    await discoverVM.loadPools(userId: userId)
                }
            }
        }
        .background(Color.sp.snow)
        .sheet(item: $selectedDiscoverPool) { item in
            DiscoverPoolDetailSheet(
                data: item,
                isJoining: discoverVM.joiningPoolId == item.pool.poolId,
                onJoin: {
                    Task {
                        if let userId = authService.appUser?.userId {
                            await discoverVM.joinPool(
                                item.pool,
                                userId: userId,
                                username: authService.appUser?.username ?? "Entry 1",
                                dataStore: dataStore
                            )
                            // Refresh the selected item so the sheet updates
                            if let updated = discoverVM.pools.first(where: { $0.pool.poolId == item.pool.poolId }) {
                                selectedDiscoverPool = updated
                            }
                        }
                    }
                },
                onNavigateToPool: {
                    navigationPath.append(item.pool)
                }
            )
        }
    }

    private var discoverFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                discoverModePill("All", mode: nil)
                discoverModePill("Full Tournament", mode: .fullTournament)
                discoverModePill("Progressive", mode: .progressive)
                discoverModePill("Bracket Picker", mode: .bracketPicker)
            }
        }
    }

    private func discoverModePill(_ label: String, mode: PredictionMode?) -> some View {
        let isActive = discoverVM.modeFilter == mode
        return Button {
            discoverVM.modeFilter = mode
            Task {
                if let userId = authService.appUser?.userId {
                    await discoverVM.loadPools(userId: userId)
                }
            }
        } label: {
            Text(label)
                .font(.system(size: 13, weight: isActive ? .bold : .medium, design: .rounded))
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(isActive ? Color.sp.primary.opacity(0.12) : Color.sp.surface)
                .foregroundStyle(isActive ? Color.sp.primary : Color.sp.slate)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var discoverEmptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 28))
                .foregroundStyle(Color.sp.slate)
            Text(discoverVM.hasActiveFilters
                ? "No pools match your search"
                : "No public pools available yet")
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.slate)
            if discoverVM.hasActiveFilters {
                Button("Clear Filters") {
                    discoverVM.clearFilters()
                    Task {
                        if let userId = authService.appUser?.userId {
                            await discoverVM.loadPools(userId: userId)
                        }
                    }
                }
                .font(SPTypography.cardTitle)
                .foregroundStyle(Color.sp.primary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    // MARK: - Join Pool Sheet

    private var joinPoolSheet: some View {
        VStack(spacing: 0) {
            // Drag indicator
            Capsule()
                .fill(Color.sp.silver)
                .frame(width: 36, height: 4)
                .padding(.top, 10)
                .padding(.bottom, 20)

            // Icon + header
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.sp.primaryLight)
                        .frame(width: 64, height: 64)
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(Color.sp.primary)
                }

                Text("Join a Pool")
                    .font(SPTypography.sectionHeader)
                    .foregroundStyle(Color.sp.ink)

                Text("Enter a code or scan a QR to join")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
                    .multilineTextAlignment(.center)
            }
            .padding(.bottom, 24)

            // Mode toggle
            HStack(spacing: 0) {
                poolsJoinModeTab(label: "Pool Code", icon: "keyboard", mode: .code)
                poolsJoinModeTab(label: "Scan QR", icon: "qrcode.viewfinder", mode: .scan)
            }
            .background(Color.sp.mist)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
            .padding(.bottom, 20)

            // Content
            if joinMode == .code {
                poolsJoinCodeContent
            } else {
                poolsJoinScanContent
            }

            Spacer()
        }
        .padding(.horizontal, 24)
        .background(Color.sp.snow)
        .presentationDetents([.medium])
        .presentationDragIndicator(.hidden)
    }

    private func poolsJoinModeTab(label: String, icon: String, mode: PoolsJoinMode) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { joinMode = mode }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                Text(label)
                    .font(SPTypography.cardTitle)
            }
            .foregroundStyle(joinMode == mode ? Color.sp.primary : Color.sp.slate)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(joinMode == mode ? Color.sp.surface : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
        }
        .buttonStyle(.plain)
    }

    private var poolsJoinCodeContent: some View {
        VStack(spacing: 6) {
            TextField("POOL CODE", text: $viewModel.joinPoolCode)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .font(SPTypography.mono(size: 22, weight: .bold))
                .multilineTextAlignment(.center)
                .padding(.vertical, 16)
                .padding(.horizontal, 20)
                .background(Color.sp.mist)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                        .stroke(
                            viewModel.errorMessage != nil ? Color.sp.red :
                                viewModel.joinPoolCode.isEmpty ? Color.clear : Color.sp.primary,
                            lineWidth: 1.5
                        )
                )

            if let error = viewModel.errorMessage {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 10))
                    Text(error)
                        .font(SPTypography.detail)
                }
                .foregroundStyle(Color.sp.red)
                .padding(.top, 2)
            }

            Button {
                Task {
                    if let userId = authService.appUser?.userId {
                        await viewModel.joinPool(userId: userId, username: authService.appUser?.username ?? "Entry 1", dataStore: dataStore)
                    }
                }
            } label: {
                Group {
                    if viewModel.isJoining {
                        ProgressView()
                            .tint(.white)
                    } else {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.right.circle.fill")
                                .font(.system(size: 16))
                            Text("Join Pool")
                        }
                    }
                }
                .font(SPTypography.cardTitle)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(viewModel.joinPoolCode.isEmpty ? Color.sp.silver : Color.sp.primary)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
            }
            .disabled(viewModel.isJoining || viewModel.joinPoolCode.isEmpty)
            .padding(.top, 18)

            Button {
                viewModel.showJoinSheet = false
            } label: {
                Text("Cancel")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
                    .padding(.top, 12)
            }
            .buttonStyle(.plain)
        }
    }

    private var poolsJoinScanContent: some View {
        VStack(spacing: 18) {
            ZStack {
                RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                    .fill(Color.sp.mist)
                    .frame(height: 120)

                VStack(spacing: 10) {
                    Image(systemName: "qrcode.viewfinder")
                        .font(.system(size: 36, weight: .light))
                        .foregroundStyle(Color.sp.primary)

                    Text("Point your camera at a SportPool QR code")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                        .multilineTextAlignment(.center)
                }
            }

            Text("Coming soon")
                .font(SPTypography.detail)
                .foregroundStyle(Color.sp.silver)

            Button {
                viewModel.showJoinSheet = false
            } label: {
                Text("Cancel")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.slate)
                    .padding(.top, 4)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Scroll Offset Tracking

private struct PoolsScrollOffsetKey: PreferenceKey {
    nonisolated(unsafe) static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
