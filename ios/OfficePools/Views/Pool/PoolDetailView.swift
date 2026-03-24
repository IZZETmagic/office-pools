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
    @State var viewModel: PoolDetailViewModel
    let authService: AuthService
    var onPoolDeleted: ((String) -> Void)?  // poolId
    @State private var selectedTab: PoolTab? = .leaderboard
    @State private var showingEntryDetail = false
    @State private var predictionsViewModel: PredictionsViewModel?
    @State private var tabBarHeight: CGFloat = 40
    @State private var showingBanter = false
    @State private var banterViewModel: BanterViewModel?

    private var isMultiEntry: Bool {
        (viewModel.pool?.maxEntriesPerUser ?? 1) > 1
    }

    @ViewBuilder
    private var mainContent: some View {
        if viewModel.isLoading {
            ProgressView("Loading pool...")
        } else if let error = viewModel.errorMessage {
            ContentUnavailableView("Error", systemImage: "exclamationmark.triangle", description: Text(error))
        } else {
            ZStack(alignment: .top) {
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 0) {
                        ForEach(visibleTabs, id: \.self) { tab in
                            contentForTab(tab)
                                .safeAreaPadding(.top, tabBarHeight)
                                .containerRelativeFrame(.horizontal)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollIndicators(.hidden)
                .scrollPosition(id: $selectedTab)

                tabBar
            }
            .overlay(alignment: .bottomTrailing) {
                Button {
                    if banterViewModel == nil {
                        banterViewModel = BanterViewModel(poolId: viewModel.poolId)
                    }
                    showingBanter = true
                } label: {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(.white)
                        .frame(width: 60, height: 60)
                        .background(
                            Circle()
                                .fill(Color.accentColor)
                                .shadow(color: Color.accentColor.opacity(0.4), radius: 12, y: 6)
                        )
                        .overlay(
                            Circle()
                                .stroke(.white.opacity(0.3), lineWidth: 1.5)
                        )
                }
                .padding(.trailing, 16)
                .padding(.bottom, 16)
            }
        }
    }

    var body: some View {
        mainContent
        .navigationTitle(viewModel.pool?.poolName ?? "Pool")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(isMultiEntry && showingEntryDetail)
        .navigationDestination(for: Member.self) { member in
            MemberDetailView(
                member: member,
                leaderboardData: viewModel.leaderboardData,
                currentUserId: viewModel.currentUserId ?? "",
                poolService: PoolService(),
                adminCount: viewModel.members.filter(\.isAdmin).count
            )
        }
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
        .fullScreenCover(isPresented: $showingBanter) {
            BanterFullScreenView(
                viewModel: banterViewModel ?? BanterViewModel(poolId: viewModel.poolId),
                authService: authService,
                poolName: viewModel.pool?.poolName ?? "Chat",
                matches: viewModel.matches,
                leaderboardEntries: viewModel.leaderboardData,
                analyticsData: viewModel.selectedEntry.flatMap { viewModel.analyticsData[$0.entryId] },
                entryId: viewModel.selectedEntry?.entryId
            )
        }
        .onAppear {
            guard viewModel.pool == nil else { return }  // Already loaded
            Task {
                if let userId = authService.appUser?.userId {
                    print("[PoolDetailView] Loading pool \(viewModel.poolId)")
                    await viewModel.load(userId: userId)
                    if predictionsViewModel == nil {
                        predictionsViewModel = PredictionsViewModel(poolId: viewModel.poolId)
                    }
                } else {
                    viewModel.errorMessage = "Not signed in"
                    viewModel.isLoading = false
                }
            }
        }
    }

    private var tabBar: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 20) {
                    ForEach(visibleTabs, id: \.self) { tab in
                        Button {
                            withAnimation {
                                selectedTab = tab
                            }
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
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .onAppear { tabBarHeight = geo.size.height }
                    .onChange(of: geo.size.height) { _, newHeight in
                        tabBarHeight = newHeight
                    }
            }
        )
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
                        selectedEntry: Bindable(viewModel).selectedEntry,
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
                    onPoolDeleted: {
                        onPoolDeleted?(viewModel.poolId)
                        dismiss()
                    }
                )
            }
    }

    private var visibleTabs: [PoolTab] {
        var tabs: [PoolTab] = [.leaderboard, .predictions, .form, .rules]
        if viewModel.isAdmin {
            tabs.append(contentsOf: [.members, .settings])
        }
        return tabs
    }
}

// MARK: - Liquid Glass Bar Modifier

private struct LiquidGlassBar: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular, in: .rect)
        } else {
            content
                .background(.ultraThinMaterial)
        }
    }
}
