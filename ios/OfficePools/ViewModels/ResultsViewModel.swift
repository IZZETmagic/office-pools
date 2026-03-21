import Foundation

/// View model for the standalone Results tab — fetches matches for the user's active tournament.
@MainActor
@Observable
final class ResultsViewModel {
    var matches: [Match] = []
    var isLoading = false
    var errorMessage: String?

    private let poolService = PoolService()

    /// Loads matches by finding the user's pools, extracting tournament IDs, and fetching all matches.
    func loadMatches(userId: String) async {
        isLoading = true
        errorMessage = nil

        do {
            // Get the user's pools to find tournament IDs
            let pools = try await poolService.fetchUserPools(userId: userId)

            // Get unique tournament IDs
            let tournamentIds = Set(pools.map(\.tournamentId))

            guard !tournamentIds.isEmpty else {
                matches = []
                isLoading = false
                return
            }

            // Fetch matches for all tournaments (usually just one)
            var allMatches: [Match] = []
            for tournamentId in tournamentIds {
                let tournamentMatches = try await poolService.fetchMatches(tournamentId: tournamentId)
                allMatches.append(contentsOf: tournamentMatches)
            }

            matches = allMatches
            print("[ResultsVM] Loaded \(matches.count) matches from \(tournamentIds.count) tournament(s)")
        } catch {
            print("[ResultsVM] Failed to load matches: \(error)")
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
