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
    case completed = "Completed"
    case archived = "Archived"
}

enum PoolTypeFilter: String, CaseIterable {
    case all = "All"
    case fullTournament = "Full"
    case progressive = "Progressive"
    case bracketPicker = "Bracket"
}

enum PoolPredictionFilter: String, CaseIterable {
    case all = "All"
    case submitted = "Submitted"
    case pending = "Pending"
}

/// View model for the Pools tab — provides filtering, sorting, and join/create UI state.
/// Reads pool card data from the shared AppDataStore.
@MainActor
@Observable
final class DashboardViewModel {
    // UI state
    var isLoading = false
    var errorMessage: String?
    var joinPoolCode = ""
    var showJoinSheet = false
    var showCreateSheet = false
    var isJoining = false

    // Search, filter, sort
    var searchText = ""
    var statusFilter: PoolStatusFilter = .all
    var typeFilter: PoolTypeFilter = .all
    var predictionFilter: PoolPredictionFilter = .all
    var sortBy: PoolSortOption = .newest

    /// True when any filter is active (not all set to .all).
    var hasActiveFilters: Bool {
        statusFilter != .all || typeFilter != .all || predictionFilter != .all
    }

    func clearAllFilters() {
        statusFilter = .all
        typeFilter = .all
        predictionFilter = .all
    }

    private let poolService = PoolService()
    private let homeViewModel = HomeViewModel()

    // MARK: - Filtered & Sorted Pools

    func filteredPools(from poolCards: [PoolCardData]) -> [PoolCardData] {
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
            result = result.filter { $0.pool.status == "open" || $0.pool.status == "active" }
        case .archived:
            result = result.filter { $0.pool.status == "archived" }
        case .completed:
            result = result.filter { $0.pool.status == "completed" }
        }

        // Type filter
        switch typeFilter {
        case .all: break
        case .fullTournament:
            result = result.filter { $0.pool.predictionMode == .fullTournament }
        case .progressive:
            result = result.filter { $0.pool.predictionMode == .progressive }
        case .bracketPicker:
            result = result.filter { $0.pool.predictionMode == .bracketPicker }
        }

        // Prediction filter
        switch predictionFilter {
        case .all: break
        case .submitted:
            result = result.filter { !$0.needsPredictions }
        case .pending:
            result = result.filter { $0.needsPredictions }
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

    // MARK: - Join Pool

    func joinPool(userId: String, username: String, dataStore: AppDataStore) async {
        guard !joinPoolCode.isEmpty else { return }

        isJoining = true
        errorMessage = nil

        do {
            let pool = try await poolService.joinPool(poolCode: joinPoolCode, userId: userId, username: username)

            // Build enriched card for the new pool and add to shared store
            let card = await homeViewModel.buildPoolCard(pool: pool, userId: userId)
            dataStore.addPoolCard(card)

            joinPoolCode = ""
            showJoinSheet = false
        } catch {
            errorMessage = error.localizedDescription
        }

        isJoining = false
    }

    // MARK: - Add Pool (after creation)

    func addPool(_ pool: Pool, userId: String, dataStore: AppDataStore) async {
        let card = await homeViewModel.buildPoolCard(pool: pool, userId: userId)
        dataStore.addPoolCard(card)
    }
}
