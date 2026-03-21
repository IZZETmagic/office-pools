import SwiftUI

enum PoolTab: String, CaseIterable {
    case predictions = "Predictions"
    case leaderboard = "Leaderboard"
    case form = "Form"
    case banter = "Banter"
    case settings = "Settings"

    var icon: String {
        switch self {
        case .predictions: return "pencil.line"
        case .leaderboard: return "trophy"
        case .form: return "chart.bar.xaxis"
        case .banter: return "bubble.left.and.bubble.right"
        case .settings: return "gearshape"
        }
    }
}

struct PoolDetailView: View {
    @Bindable var viewModel: PoolDetailViewModel
    let authService: AuthService
    @State private var selectedTab: PoolTab = .predictions
    @State private var showingEntryDetail = false
    @State private var predictionsViewModel: PredictionsViewModel?

    private var isMultiEntry: Bool {
        (viewModel.pool?.maxEntriesPerUser ?? 1) > 1
    }

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
        .navigationBarBackButtonHidden(isMultiEntry && showingEntryDetail)
        .toolbar {
            if isMultiEntry && showingEntryDetail {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        showingEntryDetail = false
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.body.weight(.semibold))
                    }
                }
            }
        }
        .task {
            if let userId = authService.appUser?.userId {
                await viewModel.load(userId: userId)
                if predictionsViewModel == nil {
                    predictionsViewModel = PredictionsViewModel(poolId: viewModel.poolId)
                }
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
                            .foregroundStyle(selectedTab == tab ? Color.accentColor : .secondary)
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
                    if let predVM = predictionsViewModel {
                        PredictionsTabView(
                            viewModel: predVM,
                            matches: viewModel.matches,
                            teams: viewModel.teams,
                            selectedEntry: $viewModel.selectedEntry,
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
                        selectedEntry: viewModel.selectedEntry
                    )

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
        var tabs: [PoolTab] = [.predictions, .leaderboard, .form, .banter]
        if viewModel.isAdmin {
            tabs.append(.settings)
        }
        return tabs
    }
}
