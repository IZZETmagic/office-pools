import Foundation

/// View model for the Discover Pools section — search, filter, and join public pools.
@MainActor
@Observable
final class DiscoverViewModel {
    // Results
    var pools: [DiscoverPoolData] = []
    var isLoading = false
    var hasLoaded = false
    var errorMessage: String?

    // Search & filter
    var searchText = ""
    var modeFilter: PredictionMode?

    // Join state
    var joiningPoolId: String?
    var joinError: String?

    private let poolService = PoolService()
    private let homeViewModel = HomeViewModel()

    // MARK: - Fetch

    func loadPools(userId: String) async {
        isLoading = true
        errorMessage = nil
        do {
            pools = try await poolService.fetchPublicPools(
                query: searchText.trimmingCharacters(in: .whitespacesAndNewlines),
                mode: modeFilter,
                userId: userId
            )
            hasLoaded = true
        } catch {
            errorMessage = "Failed to load pools."
            print("[DiscoverVM] fetchPublicPools error: \(error)")
        }
        isLoading = false
    }

    // MARK: - Join

    func joinPool(_ pool: Pool, userId: String, username: String, dataStore: AppDataStore) async {
        joiningPoolId = pool.poolId
        joinError = nil
        do {
            let joined = try await poolService.joinPool(poolCode: pool.poolCode, userId: userId, username: username)
            let card = await homeViewModel.buildPoolCard(pool: joined, userId: userId)
            dataStore.addPoolCard(card)

            // Mark as joined in local state
            if let idx = pools.firstIndex(where: { $0.pool.poolId == pool.poolId }) {
                pools[idx] = DiscoverPoolData(
                    pool: pools[idx].pool,
                    memberCount: pools[idx].memberCount + 1,
                    isAlreadyJoined: true
                )
            }
        } catch {
            joinError = error.localizedDescription
        }
        joiningPoolId = nil
    }

    // MARK: - Filter helpers

    func clearFilters() {
        searchText = ""
        modeFilter = nil
    }

    var hasActiveFilters: Bool {
        !searchText.isEmpty || modeFilter != nil
    }
}
