import Foundation
import Supabase

enum PoolSortOption: String, CaseIterable {
    case newest = "Newest"
    case name = "Name A-Z"
    case points = "Most Points"
}

enum PoolStatusFilter: String, CaseIterable {
    case all = "All"
    case open = "Open"
    case archived = "Archived"
    case completed = "Completed"
}

/// View model for the Pools tab — shows user's pools with rich card data.
@MainActor
@Observable
final class DashboardViewModel {
    var poolCards: [PoolCardData] = []
    var isLoading = false
    var errorMessage: String?
    var joinPoolCode = ""
    var showJoinSheet = false
    var showCreateSheet = false
    var isJoining = false

    // Search, filter, sort
    var searchText = ""
    var statusFilter: PoolStatusFilter = .all
    var sortBy: PoolSortOption = .newest

    private let poolService = PoolService()
    private let apiService = APIService()
    private let supabase = SupabaseService.shared.client
    private let homeViewModel = HomeViewModel()

    // MARK: - Filtered & Sorted Pools

    var filteredPools: [PoolCardData] {
        var result = poolCards

        // Search filter
        if !searchText.isEmpty {
            let query = searchText.lowercased()
            result = result.filter {
                $0.pool.poolName.lowercased().contains(query) ||
                $0.pool.poolCode.lowercased().contains(query)
            }
        }

        // Status filter
        switch statusFilter {
        case .all: break
        case .open:
            result = result.filter { $0.pool.status == "open" }
        case .archived:
            result = result.filter { $0.pool.status == "archived" }
        case .completed:
            result = result.filter { $0.pool.status == "completed" }
        }

        // Sort
        switch sortBy {
        case .newest:
            break
        case .name:
            result.sort { $0.pool.poolName.localizedCaseInsensitiveCompare($1.pool.poolName) == .orderedAscending }
        case .points:
            result.sort { $0.totalPoints > $1.totalPoints }
        }

        // Branded pools first, then pools needing predictions
        result.sort { a, b in
            let aBrand = a.pool.hasBranding ? 0 : 1
            let bBrand = b.pool.hasBranding ? 0 : 1
            if aBrand != bBrand { return aBrand < bBrand }
            if a.needsPredictions != b.needsPredictions {
                return a.needsPredictions
            }
            return false
        }

        return result
    }

    // MARK: - Load Pools

    private var hasLoadedOnce = false

    func loadPools(userId: String, forceRefresh: Bool = false) async {
        // Skip reload if we already have data (unless pull-to-refresh)
        if hasLoadedOnce && !forceRefresh && !poolCards.isEmpty { return }

        isLoading = poolCards.isEmpty
        errorMessage = nil

        do {
            let pools = try await poolService.fetchUserPools(userId: userId)

            // Build all pool cards concurrently
            var cardTasks: [Task<PoolCardData, Never>] = []
            for pool in pools {
                let task = Task {
                    await self.homeViewModel.buildPoolCard(pool: pool, userId: userId)
                }
                cardTasks.append(task)
            }

            var cards: [PoolCardData] = []
            for task in cardTasks {
                cards.append(await task.value)
            }

            poolCards = cards
            hasLoadedOnce = true
        } catch {
            print("[DashboardVM] ERROR loading pools: \(error)")
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Join Pool

    func joinPool(userId: String, username: String) async {
        guard !joinPoolCode.isEmpty else { return }

        isJoining = true
        errorMessage = nil

        do {
            let pool = try await poolService.joinPool(poolCode: joinPoolCode, userId: userId, username: username)

            // Build enriched card for the new pool
            let card = await homeViewModel.buildPoolCard(pool: pool, userId: userId)
            poolCards.insert(card, at: 0)

            joinPoolCode = ""
            showJoinSheet = false
        } catch {
            errorMessage = error.localizedDescription
        }

        isJoining = false
    }

    // MARK: - Add Pool (after creation)

    func addPool(_ pool: Pool, userId: String) async {
        let card = await homeViewModel.buildPoolCard(pool: pool, userId: userId)
        poolCards.insert(card, at: 0)
    }

    // MARK: - Remove Pool (after deletion)

    func removePool(poolId: String) {
        poolCards.removeAll { $0.pool.poolId == poolId }
    }

    /// Force next loadPools to re-fetch from server
    func invalidateCache() {
        hasLoadedOnce = false
    }
}
