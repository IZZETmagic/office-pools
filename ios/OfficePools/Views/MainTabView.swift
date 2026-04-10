import SwiftUI
import Supabase
import Realtime

/// Tracks total unread banter messages across all pools for tab badge.
@MainActor
@Observable
final class UnreadBadgeTracker {
    var totalUnreadBanter: Int = 0
    /// Incremented when a chat is marked as read, signaling views to refresh their unread counts.
    var refreshTrigger: Int = 0
    /// The pool currently being viewed in chat (so we don't increment for it).
    var activePoolId: String?

    private let supabase = SupabaseService.shared.client
    private var channel: RealtimeChannelV2?
    private var subscription: RealtimeSubscription?
    private var currentUserId: String?

    /// Subscribe to all pool_messages inserts for the user's pools.
    func startListening(userId: String, poolIds: [String]) async {
        // Don't re-subscribe if already listening
        guard channel == nil else { return }
        currentUserId = userId

        let ch = supabase.channel("global-banter-badge")

        subscription = ch.onPostgresChange(
            InsertAction.self,
            schema: "public",
            table: "pool_messages"
        ) { [weak self] action in
            let decoder = JSONDecoder()
            if let message: PoolMessage = try? action.decodeRecord(decoder: decoder) {
                Task { @MainActor in
                    guard let self else { return }
                    // Only count messages from other users and not for the active chat
                    if message.userId != self.currentUserId && message.poolId != self.activePoolId {
                        self.totalUnreadBanter += 1
                        self.refreshTrigger += 1
                    }
                }
            }
        }

        try? await ch.subscribeWithError()
        channel = ch
    }

    func stopListening() async {
        if let channel {
            await channel.unsubscribe()
            subscription = nil
            self.channel = nil
        }
    }

    /// Fetch total unread count across all pools on app launch.
    func fetchInitialCount(userId: String) async {
        do {
            struct MemberPool: Codable {
                let poolId: String
                enum CodingKeys: String, CodingKey {
                    case poolId = "pool_id"
                }
            }
            struct ReadRow: Codable {
                let lastReadAt: String?
                enum CodingKeys: String, CodingKey {
                    case lastReadAt = "last_read_at"
                }
            }
            struct MessageId: Codable {
                let messageId: String
                enum CodingKeys: String, CodingKey {
                    case messageId = "message_id"
                }
            }

            // Get all pools the user is in
            let memberships: [MemberPool] = try await supabase
                .from("pool_members")
                .select("pool_id")
                .eq("user_id", value: userId)
                .execute()
                .value

            var total = 0
            for membership in memberships {
                let readRows: [ReadRow] = try await supabase
                    .from("pool_members")
                    .select("last_read_at")
                    .eq("pool_id", value: membership.poolId)
                    .eq("user_id", value: userId)
                    .limit(1)
                    .execute()
                    .value

                let lastReadAt = readRows.first?.lastReadAt

                if let lastReadAt {
                    let msgs: [MessageId] = try await supabase
                        .from("pool_messages")
                        .select("message_id")
                        .eq("pool_id", value: membership.poolId)
                        .gt("created_at", value: lastReadAt)
                        .neq("user_id", value: userId)
                        .execute()
                        .value
                    total += msgs.count
                } else {
                    let msgs: [MessageId] = try await supabase
                        .from("pool_messages")
                        .select("message_id")
                        .eq("pool_id", value: membership.poolId)
                        .neq("user_id", value: userId)
                        .execute()
                        .value
                    total += msgs.count
                }
            }

            totalUnreadBanter = total
        } catch {
            print("[BadgeTracker] Failed to fetch initial unread count: \(error)")
        }
    }
}

/// Root tab bar navigation — the main app shell after login.
struct MainTabView: View {
    let authService: AuthService

    @State var selectedTab: AppTab = .home
    @State private var badgeTracker = UnreadBadgeTracker()
    @State private var poolsPendingFilter = false

    /// Deep link navigation state for the Pools tab
    @State private var poolsDeepLinkPoolId: String?
    @State private var poolsDeepLinkTab: PoolTab?
    @State private var deepLinkTrigger: Int = 0

    /// Navigation router for deep linking from push notifications
    private let router = NavigationRouter.shared

    @Environment(AppDataStore.self) private var dataStore

    init(authService: AuthService) {
        self.authService = authService
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab("Home", systemImage: "house.fill", value: .home) {
                HomeView(authService: authService, switchToPoolsTab: {
                    poolsPendingFilter = true
                    selectedTab = .pools
                })
            }

            Tab("Pools", systemImage: "trophy.fill", value: .pools) {
                PoolsView(
                    authService: authService,
                    applyPendingFilter: $poolsPendingFilter,
                    deepLinkPoolId: $poolsDeepLinkPoolId,
                    deepLinkTab: $poolsDeepLinkTab,
                    deepLinkTrigger: $deepLinkTrigger
                )
            }
            .badge(badgeTracker.totalUnreadBanter)

            Tab("Results", systemImage: "sportscourt.fill", value: .results) {
                ResultsContainerView(authService: authService)
            }

            Tab("Activity", systemImage: "bell.fill", value: .activity) {
                ActivityView(authService: authService)
            }
        }
        .environment(badgeTracker)
        .task {
            if let userId = authService.appUser?.userId {
                // Fetch initial unread count immediately on launch
                await badgeTracker.fetchInitialCount(userId: userId)
                // Start real-time listening for new messages
                await badgeTracker.startListening(userId: userId, poolIds: [])
            }
        }
        .onChange(of: router.pendingDeepLink) { _, newLink in
            guard let link = newLink else { return }
            handleDeepLink(link)
        }
        .onAppear {
            // Check for any deep link that arrived before the view appeared
            if let link = router.pendingDeepLink {
                // Small delay to let the view hierarchy settle
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    handleDeepLink(link)
                }
            }
        }
    }

    private func handleDeepLink(_ link: DeepLink) {
        let _ = router.consumeDeepLink()

        switch link {
        case .pool(let poolId, let tab):
            // Switch to the Pools tab and push into the pool
            poolsDeepLinkPoolId = poolId
            poolsDeepLinkTab = tab
            deepLinkTrigger += 1
            selectedTab = .pools

        case .activity:
            selectedTab = .activity
        }
    }
}

enum AppTab: String, Hashable {
    case home
    case pools
    case results
    case activity
}
