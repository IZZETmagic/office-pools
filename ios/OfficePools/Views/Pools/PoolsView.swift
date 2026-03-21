import SwiftUI

/// Pools tab — lists all pools the user has joined, with ability to join new ones.
struct PoolsView: View {
    let authService: AuthService
    @State private var viewModel = DashboardViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading pools...")
                } else if viewModel.pools.isEmpty {
                    emptyState
                } else {
                    poolList
                }
            }
            .navigationTitle("Pools")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        viewModel.showJoinSheet = true
                    } label: {
                        Image(systemName: "plus")
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
        List {
            if !viewModel.activePools.isEmpty {
                Section("Active") {
                    ForEach(viewModel.activePools) { pool in
                        NavigationLink(value: pool) {
                            PoolRow(pool: pool)
                        }
                    }
                }
            }

            if !viewModel.archivedPools.isEmpty {
                Section("Archived") {
                    ForEach(viewModel.archivedPools) { pool in
                        NavigationLink(value: pool) {
                            PoolRow(pool: pool)
                        }
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
    }

    // MARK: - Empty State

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
                            await viewModel.joinPool(userId: userId)
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
