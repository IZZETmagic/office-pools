import SwiftUI

struct DashboardView: View {
    @Bindable var viewModel: DashboardViewModel
    let authService: AuthService

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading pools...")
                } else if viewModel.poolCards.isEmpty && viewModel.searchText.isEmpty {
                    emptyState
                } else {
                    poolList
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("My Pools")
            .searchable(text: $viewModel.searchText, prompt: "Search pools...")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        viewModel.showJoinSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }

                ToolbarItem(placement: .cancellationAction) {
                    Menu {
                        NavigationLink("Profile") {
                            ProfileView(authService: authService)
                        }
                        Button("Sign Out", role: .destructive) {
                            Task { try? await authService.signOut() }
                        }
                    } label: {
                        Image(systemName: "person.circle")
                    }
                }
            }
            .sheet(isPresented: $viewModel.showJoinSheet) {
                joinPoolSheet
            }
            .task {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadPools(userId: userId)
                }
            }
            .refreshable {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadPools(userId: userId)
                }
            }
        }
    }

    // MARK: - Pool List

    private var poolList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                // Filter bar
                filterBar
                    .padding(.bottom, 4)

                // Pool cards
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
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .navigationDestination(for: Pool.self) { pool in
            PoolDetailView(
                viewModel: PoolDetailViewModel(poolId: pool.poolId),
                authService: authService
            )
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        HStack(spacing: 8) {
            // Status filter pills
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
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
                                .background(
                                    viewModel.statusFilter == filter
                                        ? Color.accentColor
                                        : Color(.systemBackground)
                                )
                                .foregroundStyle(
                                    viewModel.statusFilter == filter
                                        ? .white
                                        : .primary
                                )
                                .clipShape(Capsule())
                                .shadow(color: .black.opacity(0.04), radius: 2, y: 1)
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
                    .font(.title3)
                    .foregroundStyle(.secondary)
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
            Button("Join a Pool") {
                viewModel.showJoinSheet = true
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var emptyFilterState: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("No pools match your search")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button("Clear Filters") {
                viewModel.searchText = ""
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
