import Foundation

/// Info about a user's prediction for a match in a specific pool/entry.
struct MatchPredictionInfo: Identifiable {
    let id: String  // entryId
    let poolName: String
    let entryName: String
    let prediction: Prediction?
}

/// View model for the match detail page — loads the user's predictions across all pools.
@MainActor
@Observable
final class MatchDetailViewModel {
    let match: Match

    var predictionInfos: [MatchPredictionInfo] = []
    var isLoading = false
    var errorMessage: String?

    private let poolService = PoolService()
    private let predictionService = PredictionService()

    init(match: Match) {
        self.match = match
    }

    func loadPredictions(userId: String) async {
        isLoading = true
        errorMessage = nil

        do {
            // 1. Get user's pools
            let pools = try await poolService.fetchUserPools(userId: userId)

            // 2. For each pool, get members to find user's entries
            var allInfos: [MatchPredictionInfo] = []
            var allEntryIds: [String] = []
            var entryToPool: [String: String] = [:]  // entryId → poolName
            var entryToName: [String: String] = [:]   // entryId → entryName

            for pool in pools {
                let members = try await poolService.fetchMembers(poolId: pool.poolId)
                guard let myMember = members.first(where: { $0.userId == userId }) else { continue }

                for entry in myMember.entries ?? [] {
                    allEntryIds.append(entry.entryId)
                    entryToPool[entry.entryId] = pool.poolName
                    entryToName[entry.entryId] = entry.entryName
                }
            }

            // 3. Fetch predictions for this match across all entries
            let predictions = try await predictionService.fetchPredictionsForMatch(
                matchId: match.matchId,
                entryIds: allEntryIds
            )
            let predictionMap = Dictionary(uniqueKeysWithValues: predictions.map { ($0.entryId, $0) })

            // 4. Build display list
            for entryId in allEntryIds {
                allInfos.append(MatchPredictionInfo(
                    id: entryId,
                    poolName: entryToPool[entryId] ?? "Unknown Pool",
                    entryName: entryToName[entryId] ?? "Entry",
                    prediction: predictionMap[entryId]
                ))
            }

            predictionInfos = allInfos
            print("[MatchDetail] Loaded \(predictions.count) predictions across \(allEntryIds.count) entries")
        } catch {
            print("[MatchDetail] Error: \(error)")
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
