import SwiftUI

/// Home tab -- shows greeting, stats, live matches, pool cards, and upcoming matches.
struct HomeView: View {
    let authService: AuthService
    @State private var viewModel = HomeViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.poolCards.isEmpty {
                    loadingState
                } else if let error = viewModel.errorMessage, viewModel.poolCards.isEmpty {
                    errorState(error)
                } else {
                    mainContent
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .task {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadHomeData(userId: userId)
                }
            }
            .refreshable {
                if let userId = authService.appUser?.userId {
                    await viewModel.loadHomeData(userId: userId)
                }
            }
        }
    }

    // MARK: - Main Content

    private var mainContent: some View {
        ZStack(alignment: .top) {
            // Scrollable content (behind header)
            ScrollView {
                VStack(spacing: 24) {
                    liveMatchesSection
                    myPoolsSection
                    upcomingMatchesSection
                }
                .padding(.top, 80)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))

            // Sticky header (floats on top with glass)
            VStack(spacing: 10) {
                HStack {
                    Text("SportPool")
                        .font(.title3.bold())
                    Spacer()
                }

                HStack(spacing: 0) {
                    statItem(icon: "flame.fill", color: .orange, value: "\(viewModel.bestStreak)", label: "streak")

                    Divider()
                        .frame(height: 20)

                    statItem(icon: "trophy.fill", color: .yellow, value: viewModel.bestRank.map { "#\($0)" } ?? "--", label: "rank")

                    Divider()
                        .frame(height: 20)

                    statItem(icon: "bolt.fill", color: .blue, value: formattedPoints(viewModel.totalPoints), label: "pts")
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial)
        }
        .navigationBarHidden(true)
    }

    private func statItem(icon: String, color: Color, value: String, label: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(color)

            Text(value)
                .font(.subheadline.bold().monospacedDigit())

            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func formattedPoints(_ points: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: points)) ?? "\(points)"
    }

    // MARK: - Live Matches Section

    @ViewBuilder
    private var liveMatchesSection: some View {
        if !viewModel.liveMatches.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(.red)
                            .frame(width: 8, height: 8)
                            .modifier(PulsingModifier())

                        Text("Live Matches")
                            .font(.title3.bold())
                    }
                    Spacer()
                }
                .padding(.horizontal, 20)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(viewModel.liveMatches) { match in
                            MatchCardView(match: match, isLive: true)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
    }

    // MARK: - My Pools Section

    @ViewBuilder
    private var myPoolsSection: some View {
        if !viewModel.poolCards.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                // Header with count and action buttons
                HStack {
                    Text("My Pools (\(viewModel.poolCards.count))")
                        .font(.title3.bold())

                    Spacer()

                    HStack(spacing: 8) {
                        Button {
                            // TODO: Navigate to join pool flow
                        } label: {
                            Label("Join", systemImage: "plus.circle")
                                .font(.caption.bold())
                        }
                        .buttonStyle(.bordered)
                        .buttonBorderShape(.capsule)
                        .controlSize(.small)

                        Button {
                            // TODO: Navigate to create pool flow
                        } label: {
                            Label("Create", systemImage: "square.and.pencil")
                                .font(.caption.bold())
                        }
                        .buttonStyle(.bordered)
                        .buttonBorderShape(.capsule)
                        .controlSize(.small)
                    }
                }
                .padding(.horizontal, 20)

                // Horizontal scroll of pool cards
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(viewModel.poolCards) { card in
                            PoolCardView(data: card)
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        } else if !viewModel.isLoading {
            // Empty state for pools
            VStack(spacing: 12) {
                Image(systemName: "trophy")
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)

                Text("No pools yet")
                    .font(.headline)
                    .foregroundStyle(.secondary)

                Text("Join or create a pool to get started.")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)

                HStack(spacing: 12) {
                    Button {
                        // TODO: Navigate to join pool flow
                    } label: {
                        Label("Join a Pool", systemImage: "plus.circle")
                    }
                    .buttonStyle(.borderedProminent)

                    Button {
                        // TODO: Navigate to create pool flow
                    } label: {
                        Label("Create Pool", systemImage: "square.and.pencil")
                    }
                    .buttonStyle(.bordered)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(32)
            .background {
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.secondarySystemBackground))
            }
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Upcoming Matches Section

    @ViewBuilder
    private var upcomingMatchesSection: some View {
        if !viewModel.upcomingMatches.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("Upcoming Matches")
                    .font(.title3.bold())
                    .padding(.horizontal, 20)

                VStack(spacing: 8) {
                    ForEach(viewModel.upcomingMatches) { match in
                        MatchCardView(match: match, isLive: false)
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }

    // MARK: - Loading & Error States

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
            Text("Loading your dashboard...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

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
}

#Preview {
    HomeView(authService: AuthService())
}
