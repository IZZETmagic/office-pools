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
    @Bindable var viewModel: PoolDetailViewModel
    let authService: AuthService
    @State private var selectedTab: PoolTab = .leaderboard
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
        TabView(selection: $selectedTab) {
            ForEach(visibleTabs, id: \.self) { tab in
                contentForTab(tab)
                    .tag(tab)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .safeAreaInset(edge: .top, spacing: 0) {
            tabBar
        }
    }

    private var tabBar: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 20) {
                    ForEach(visibleTabs, id: \.self) { tab in
                        Button {
                            selectedTab = tab
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
                    selectedEntry: viewModel.selectedEntry,
                    preloadedAnalytics: viewModel.analyticsData
                )

            case .banter:
                BanterTabView(
                    viewModel: BanterViewModel(poolId: viewModel.poolId),
                    authService: authService
                )

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
                    poolService: PoolService()
                )

            case .settings:
                PoolSettingsTabView(
                    pool: viewModel.pool,
                    currentUserId: viewModel.currentUserId ?? "",
                    poolService: PoolService(),
                    onPoolDeleted: { dismiss() }
                )
            }
    }

    private var visibleTabs: [PoolTab] {
        var tabs: [PoolTab] = [.leaderboard, .predictions, .form, .banter, .rules]
        if viewModel.isAdmin {
            tabs.append(contentsOf: [.members, .settings])
        }
        return tabs
    }
}
