import Foundation

/// Shared data layer that preloads all data needed by Home and Pools tabs.
/// Injected via `.environment()` so both tabs read the same data without duplicate fetches.
@MainActor
@Observable
final class AppDataStore {
    // MARK: - Shared State

    var poolCards: [PoolCardData] = []
    var liveMatches: [Match] = []
    var upcomingMatches: [Match] = []
    var bestStreak: Int = 0
    var bestRank: Int? = nil
    var totalPoints: Int = 0
    var pools: [Pool] = []

    /// True while the initial preload is in progress (splash screen stays visible).
    var isPreloading = false
    /// True once the first preload has completed successfully.
    var hasPreloaded = false

    var errorMessage: String?

    // MARK: - Dependencies

    private let poolService = PoolService()
    private let homeViewModel = HomeViewModel()

    // MARK: - Preload Everything

    /// Called once at app launch to fetch all data before showing the main UI.
    func preload(userId: String) async {
        guard !isPreloading else { return }
        isPreloading = true
        errorMessage = nil

        do {
            // 1. Fetch user's pools
            pools = try await poolService.fetchUserPools(userId: userId)

            let tournamentIds = Array(Set(pools.map(\.tournamentId)))

            // 2. Kick off cards, streak, AND matches all concurrently
            let poolsSnapshot = pools
            var cardTasks: [Task<PoolCardData, Never>] = []
            for pool in poolsSnapshot {
                let task = Task {
                    await self.homeViewModel.buildPoolCard(pool: pool, userId: userId)
                }
                cardTasks.append(task)
            }

            let streakTask = Task { await self.homeViewModel.fetchBestStreak(userId: userId) }
            let matchesTask = Task { await self.homeViewModel.fetchMatchesBatch(tournamentIds: tournamentIds) }

            // Collect all card results
            var cards: [PoolCardData] = []
            var allBestRanks: [Int] = []
            var aggregateTotalPoints = 0

            for task in cardTasks {
                let cardData = await task.value
                cards.append(cardData)
                if let rank = cardData.userRank {
                    allBestRanks.append(rank)
                }
                aggregateTotalPoints += cardData.totalPoints
            }

            // Sort cards: branded first, then needs predictions, then by deadline
            cards.sort { a, b in
                let aBrand = a.pool.hasBranding ? 0 : 1
                let bBrand = b.pool.hasBranding ? 0 : 1
                if aBrand != bBrand { return aBrand < bBrand }
                if a.needsPredictions != b.needsPredictions {
                    return a.needsPredictions
                }
                switch (a.deadline, b.deadline) {
                case let (aDate?, bDate?): return aDate < bDate
                case (nil, .some): return false
                case (.some, nil): return true
                case (nil, nil): return false
                }
            }

            poolCards = cards
            bestRank = allBestRanks.min()
            totalPoints = aggregateTotalPoints
            bestStreak = await streakTask.value

            let matchResults = await matchesTask.value
            liveMatches = matchResults.live
            upcomingMatches = matchResults.upcoming

            hasPreloaded = true
        } catch {
            print("[AppDataStore] Preload error: \(error)")
            errorMessage = error.localizedDescription
            // Still mark as preloaded so the app doesn't get stuck on splash
            hasPreloaded = true
        }

        isPreloading = false
    }

    // MARK: - Refresh (pull-to-refresh from any tab)

    func refresh(userId: String) async {
        await preload(userId: userId)
    }

    // MARK: - Computed Helpers

    var nextUpcomingMatch: Match? {
        upcomingMatches.first
    }

    var matchesToday: Int {
        let calendar = Calendar.current
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]

        return upcomingMatches.filter { match in
            if let date = formatter.date(from: match.matchDate) ?? fallback.date(from: match.matchDate) {
                return calendar.isDateInToday(date)
            }
            return false
        }.count
    }

    // MARK: - Mutators (for join/create/delete pool)

    func addPoolCard(_ card: PoolCardData) {
        poolCards.insert(card, at: 0)
    }

    func removePool(poolId: String) {
        poolCards.removeAll { $0.pool.poolId == poolId }
    }
}
