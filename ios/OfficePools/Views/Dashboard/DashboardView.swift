import SwiftUI

struct DashboardView: View {
    @Bindable var viewModel: DashboardViewModel
    let authService: AuthService

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
            .navigationTitle("My Pools")
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
                    .background(.accent)
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

// MARK: - Pool Row

struct PoolRow: View {
    let pool: Pool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(pool.poolName)
                .font(.headline)

            HStack {
                Label(pool.predictionMode.rawValue.replacingOccurrences(of: "_", with: " ").capitalized,
                      systemImage: modeIcon)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Text(pool.status.capitalized)
                    .font(.caption2.weight(.medium))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(pool.status == "active" ? Color.green.opacity(0.15) : Color.secondary.opacity(0.15))
                    .foregroundStyle(pool.status == "active" ? .green : .secondary)
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 4)
    }

    private var modeIcon: String {
        switch pool.predictionMode {
        case .fullTournament: return "list.bullet"
        case .progressive: return "arrow.forward.circle"
        case .bracketPicker: return "square.grid.2x2"
        }
    }
}
