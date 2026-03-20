import Foundation

/// View model for the main dashboard — shows user's pools.
@MainActor
@Observable
final class DashboardViewModel {
    var pools: [Pool] = []
    var isLoading = false
    var errorMessage: String?
    var joinPoolCode = ""
    var showJoinSheet = false
    var isJoining = false

    private let poolService = PoolService()

    func loadPools(userId: String) async {
        isLoading = true
        errorMessage = nil

        print("[Dashboard] Loading pools for userId: \(userId)")

        do {
            pools = try await poolService.fetchUserPools(userId: userId)
            print("[Dashboard] Loaded \(pools.count) pools: \(pools.map(\.poolName))")
        } catch {
            print("[Dashboard] ERROR loading pools: \(error)")
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func joinPool(userId: String) async {
        guard !joinPoolCode.isEmpty else { return }

        isJoining = true
        errorMessage = nil

        do {
            let pool = try await poolService.joinPool(poolCode: joinPoolCode, userId: userId)
            pools.insert(pool, at: 0)
            joinPoolCode = ""
            showJoinSheet = false
        } catch {
            errorMessage = error.localizedDescription
        }

        isJoining = false
    }

    var activePools: [Pool] {
        pools.filter { $0.status == "active" }
    }

    var archivedPools: [Pool] {
        pools.filter { $0.status == "archived" }
    }
}
