import SwiftUI

enum PoolTab: String, CaseIterable {
    case predictions = "Predictions"
    case leaderboard = "Leaderboard"
    case results = "Results"
    case banter = "Banter"
    case settings = "Settings"

    var icon: String {
        switch self {
        case .predictions: return "pencil.line"
        case .leaderboard: return "trophy"
        case .results: return "checkmark.circle"
        case .banter: return "bubble.left.and.bubble.right"
        case .settings: return "gearshape"
        }
    }
}

struct PoolDetailView: View {
    @Bindable var viewModel: PoolDetailViewModel
    let authService: AuthService
    @State private var selectedTab: PoolTab = .predictions

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView("Loading pool...")
            } else if let error = viewModel.errorMessage {
                ContentUnavailableView("Error", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                tabContent
            }
        }
        .navigationTitle(viewModel.pool?.poolName ?? "Pool")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let userId = authService.appUser?.userId {
                await viewModel.load(userId: userId)
            }
        }
    }

    private var tabContent: some View {
        VStack(spacing: 0) {
            // Tab bar
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(visibleTabs, id: \.self) { tab in
                        Button {
                            selectedTab = tab
                        } label: {
                            VStack(spacing: 4) {
                                Image(systemName: tab.icon)
                                    .font(.system(size: 16))
                                Text(tab.rawValue)
                                    .font(.caption2)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .padding(.horizontal, 16)
                            .foregroundStyle(selectedTab == tab ? .accent : .secondary)
                        }
                    }
                }
            }
            .background(.bar)

            Divider()

            // Tab content
            Group {
                switch selectedTab {
                case .predictions:
                    PredictionsTabView(
                        viewModel: PredictionsViewModel(poolId: viewModel.poolId),
                        matches: viewModel.matches,
                        entry: viewModel.selectedEntry
                    )

                case .leaderboard:
                    LeaderboardTabView(leaderboard: viewModel.leaderboard)

                case .results:
                    ResultsTabView(matches: viewModel.matches)

                case .banter:
                    BanterTabView(
                        viewModel: BanterViewModel(poolId: viewModel.poolId),
                        authService: authService
                    )

                case .settings:
                    PoolSettingsTabView(
                        pool: viewModel.pool,
                        settings: viewModel.settings,
                        isAdmin: viewModel.isAdmin
                    )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var visibleTabs: [PoolTab] {
        var tabs: [PoolTab] = [.predictions, .leaderboard, .results, .banter]
        if viewModel.isAdmin {
            tabs.append(.settings)
        }
        return tabs
    }
}
