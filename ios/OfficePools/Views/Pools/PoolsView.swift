import SwiftUI

/// Pools tab — lists all pools the user has joined, with rich card data.
struct PoolsView: View {
    let authService: AuthService
    @Environment(UnreadBadgeTracker.self) private var badgeTracker: UnreadBadgeTracker?
    @State private var viewModel = DashboardViewModel()
    @State private var navigationPath = NavigationPath()
    @State private var pendingCreatedPool: Pool?

    var body: some View {
        NavigationStack(path: $navigationPath) {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading pools...")
                } else if viewModel.poolCards.isEmpty {
                    emptyState
                } else {
                    mainContent
                }
            }
            .navigationTitle("Pools")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button {
                            viewModel.showJoinSheet = true
                        } label: {
                            Label("Join Pool", systemImage: "person.badge.plus")
                        }
                        Button {
                            viewModel.showCreateSheet = true
                        } label: {
                            Label("Create Pool", systemImage: "square.and.pencil")
                        }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .navigationDestination(for: Pool.self) { pool in
                PoolDetailView(
                    viewModel: PoolDetailViewModel(poolId: pool.poolId),
                    authService: authService,
                    onPoolDeleted: { poolId in
                        viewModel.removePool(poolId: poolId)
                    }
                )
            }
            .sheet(isPresented: $viewModel.showJoinSheet) {
                joinPoolSheet
            }
            .fullScreenCover(isPresented: $viewModel.showCreateSheet, onDismiss: {
                // Navigate after the sheet is fully dismissed so NavigationStack can push
                if let pool = pendingCreatedPool {
                    pendingCreatedPool = nil
                    // Small delay to let SwiftUI finish the dismiss animation
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
                }
            }
            .refreshable {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadPools(userId: userId, forceRefresh: true)
                }
            }
            .onChange(of: viewModel.poolCards.map(\.unreadBanterCount)) {
                badgeTracker?.totalUnreadBanter = viewModel.poolCards.reduce(0) { $0 + $1.unreadBanterCount }
            }
            .onChange(of: badgeTracker?.refreshTrigger) {
                // Re-fetch pool cards when a chat was marked as read
                if let userId = authService.appUser?.userId {
                    Task {
                        await viewModel.loadPools(userId: userId, forceRefresh: true)
                        badgeTracker?.totalUnreadBanter = viewModel.poolCards.reduce(0) { $0 + $1.unreadBanterCount }
                    }
                }
            }
        }
    }

    // MARK: - Main Content

    private var mainContent: some View {
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
                        }
                    }
                } header: {
                    filterBar
                        .padding(.vertical, 8)
                        .background(.clear)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 20)
        }
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        HStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(PoolStatusFilter.allCases, id: \.self) { filter in
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                viewModel.statusFilter = filter
                            }
                        } label: {
                            Text(filter.rawValue)
                                .font(.subheadline.weight(viewModel.statusFilter == filter ? .semibold : .regular))
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                                .background(.ultraThinMaterial, in: Capsule())
                                .foregroundStyle(viewModel.statusFilter == filter ? Color.accentColor : .primary)
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
                Image(systemName: "arrow.up.arrow.down.circle")
                    .font(.caption)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())
                    .foregroundStyle(.primary)
            }
        }
    }

    // MARK: - Empty States

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Pools Yet", systemImage: "trophy")
        } description: {
            Text("Join a pool with a code or create a new one to get started.")
        } actions: {
            HStack(spacing: 12) {
                Button("Join a Pool") {
                    viewModel.showJoinSheet = true
                }
                .buttonStyle(.borderedProminent)

                Button("Create Pool") {
                    viewModel.showCreateSheet = true
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private var emptyFilterState: some View {
        VStack(spacing: 12) {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("No pools match this filter")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button("Clear Filter") {
                viewModel.statusFilter = .all
            }
            .font(.subheadline)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    // MARK: - Join Pool Sheet

    private var joinPoolSheet: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("Enter a pool code to join")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                TextField("Pool Code", text: $viewModel.joinPoolCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .padding()
                    .background(.fill.tertiary)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .font(.title3.monospaced())
                    .multilineTextAlignment(.center)

                if let error = viewModel.errorMessage {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
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
                .disabled(viewModel.isJoining || viewModel.joinPoolCode.isEmpty)

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
