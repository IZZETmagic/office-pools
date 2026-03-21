import Foundation
import Supabase
import Realtime

/// View model for the standalone Results tab — fetches matches for the user's active tournament.
@MainActor
@Observable
final class ResultsViewModel {
    var matches: [Match] = []
    var isLoading = false
    var errorMessage: String?

    private let poolService = PoolService()
    private let supabase = SupabaseService.shared.client
    private var matchChannel: RealtimeChannelV2?
    private var matchSubscription: RealtimeSubscription?
    private var tournamentIds: Set<String> = []

    /// Loads matches by finding the user's pools, extracting tournament IDs, and fetching all matches.
    func loadMatches(userId: String) async {
        isLoading = true
        errorMessage = nil

        do {
            // Get the user's pools to find tournament IDs
            let pools = try await poolService.fetchUserPools(userId: userId)

            // Get unique tournament IDs
            tournamentIds = Set(pools.map(\.tournamentId))

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

    /// Subscribe to realtime match updates.
    func subscribeToMatchUpdates() async {
        // Unsubscribe from any existing channel
        await unsubscribeFromMatchUpdates()

        let channel = supabase.channel("results-match-updates")

        matchSubscription = channel.onPostgresChange(
            UpdateAction.self,
            schema: "public",
            table: "matches"
        ) { [weak self] action in
            let decoder = JSONDecoder()
            if let updatedMatch: Match = try? action.decodeRecord(decoder: decoder) {
                Task { @MainActor in
                    self?.handleMatchUpdate(updatedMatch)
                }
            }
        }

        try? await channel.subscribeWithError()
        matchChannel = channel
        print("[ResultsVM] Subscribed to realtime match updates")
    }

    /// Unsubscribe from realtime match updates.
    func unsubscribeFromMatchUpdates() async {
        if let channel = matchChannel {
            await channel.unsubscribe()
            matchSubscription = nil
            matchChannel = nil
            print("[ResultsVM] Unsubscribed from realtime match updates")
        }
    }

    // MARK: - Private

    private func handleMatchUpdate(_ updatedMatch: Match) {
        if let index = matches.firstIndex(where: { $0.matchId == updatedMatch.matchId }) {
            // Preserve team info since realtime payload doesn't include joined data
            matches[index] = updatedMatch.mergedWithTeamInfo(from: matches[index])
            print("[ResultsVM] Match #\(updatedMatch.matchNumber) updated: status=\(updatedMatch.status), score=\(updatedMatch.scoreDisplay ?? "nil")")
        }
    }
}
