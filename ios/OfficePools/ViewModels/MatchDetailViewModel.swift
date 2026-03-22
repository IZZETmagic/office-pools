import Foundation
import Supabase
import Realtime

/// Info about a user's prediction for a match in a specific pool/entry.
struct MatchPredictionInfo: Identifiable {
    let id: String  // entryId
    let poolName: String
    let entryName: String
    let prediction: Prediction?
    let matchPoints: Int?  // Calculated from pool settings, nil if match not completed
}

/// View model for the match detail page — loads the user's predictions across all pools.
@MainActor
@Observable
final class MatchDetailViewModel {
    var match: Match

    var predictionInfos: [MatchPredictionInfo] = []
    var matchStats: MatchStatsResponse?
    var isLoading = false
    var errorMessage: String?

    private let poolService = PoolService()
    private let predictionService = PredictionService()
    private let apiService = APIService()
    private let supabase = SupabaseService.shared.client
    private var matchChannel: RealtimeChannelV2?
    private var matchSubscription: RealtimeSubscription?

    // Cached data for recalculating points on live updates
    private var cachedPredictions: [String: Prediction] = [:]  // entryId → prediction
    private var cachedEntrySettings: [String: PoolSettings] = [:]  // entryId → settings
    private var cachedEntryPool: [String: String] = [:]  // entryId → poolName
    private var cachedEntryName: [String: String] = [:]  // entryId → entryName
    private var cachedEntryIds: [String] = []

    init(match: Match) {
        self.match = match
    }

    func loadPredictions(userId: String) async {
        isLoading = true
        errorMessage = nil

        do {
            // 1. Get user's pools
            let pools = try await poolService.fetchUserPools(userId: userId)

            // 2. For each pool, get members to find user's entries + fetch pool settings
            cachedEntryIds = []
            cachedEntryPool = [:]
            cachedEntryName = [:]
            cachedEntrySettings = [:]

            for pool in pools {
                let members = try await poolService.fetchMembers(poolId: pool.poolId)
                guard let myMember = members.first(where: { $0.userId == userId }) else { continue }

                // Fetch pool settings for points calculation
                let settings = try await poolService.fetchSettings(poolId: pool.poolId)

                for entry in myMember.entries ?? [] {
                    cachedEntryIds.append(entry.entryId)
                    cachedEntryPool[entry.entryId] = pool.poolName
                    cachedEntryName[entry.entryId] = entry.entryName
                    if let settings = settings {
                        cachedEntrySettings[entry.entryId] = settings
                    }
                }
            }

            // 3. Fetch predictions for this match across all entries
            let predictions = try await predictionService.fetchPredictionsForMatch(
                matchId: match.matchId,
                entryIds: cachedEntryIds
            )
            cachedPredictions = Dictionary(uniqueKeysWithValues: predictions.map { ($0.entryId, $0) })

            // 4. Build display list
            rebuildPredictionInfos()

            print("[MatchDetail] Loaded \(predictions.count) predictions across \(cachedEntryIds.count) entries")
        } catch {
            print("[MatchDetail] Error: \(error)")
            errorMessage = error.localizedDescription
        }

        isLoading = false

        // Load match stats (non-blocking)
        Task {
            do {
                matchStats = try await apiService.fetchMatchStats(matchId: match.matchId)
                print("[MatchDetail] Match stats loaded: \(matchStats?.totalPredictions ?? 0) predictions")
            } catch {
                print("[MatchDetail] Failed to load match stats: \(error)")
            }
        }
    }

    // MARK: - Realtime

    /// Subscribe to realtime updates for this specific match.
    func subscribeToMatchUpdates() async {
        await unsubscribeFromMatchUpdates()

        let channel = supabase.channel("match-detail-\(match.matchId)")

        matchSubscription = channel.onPostgresChange(
            UpdateAction.self,
            schema: "public",
            table: "matches",
            filter: "match_id=eq.\(match.matchId)"
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
        print("[MatchDetail] Subscribed to realtime updates for match #\(match.matchNumber)")
    }

    /// Unsubscribe from realtime updates.
    func unsubscribeFromMatchUpdates() async {
        if let channel = matchChannel {
            await channel.unsubscribe()
            matchSubscription = nil
            matchChannel = nil
        }
    }

    // MARK: - Private

    private func handleMatchUpdate(_ updatedMatch: Match) {
        // Realtime payload doesn't include joined team data, so preserve from existing match
        match = updatedMatch.mergedWithTeamInfo(from: match)
        rebuildPredictionInfos()
        print("[MatchDetail] Match #\(updatedMatch.matchNumber) updated live: status=\(updatedMatch.status), score=\(updatedMatch.scoreDisplay ?? "nil")")
    }

    /// Rebuild the prediction infos using cached data and the current match state.
    private func rebuildPredictionInfos() {
        let isCompleted = match.isCompleted || match.status == "completed" || match.status == "live"
        var allInfos: [MatchPredictionInfo] = []

        for entryId in cachedEntryIds {
            let pred = cachedPredictions[entryId]
            var points: Int? = nil

            if isCompleted,
               let pred = pred,
               let homeActual = match.homeScoreFt,
               let awayActual = match.awayScoreFt,
               let settings = cachedEntrySettings[entryId] {

                let isGroup = match.stage == "group"
                let multiplier = isGroup ? 1.0 : ScoringCalculator.multiplier(for: match.stage, settings: settings)

                let rules = ScoringCalculator.ScoringRules(
                    exactScore: isGroup ? settings.groupExactScore : settings.knockoutExactScore,
                    correctDifference: isGroup ? settings.groupCorrectDifference : settings.knockoutCorrectDifference,
                    correctResult: isGroup ? settings.groupCorrectResult : settings.knockoutCorrectResult,
                    multiplier: multiplier,
                    psoEnabled: settings.psoEnabled,
                    psoExactScore: settings.psoExactScore,
                    psoCorrectDifference: settings.psoCorrectDifference,
                    psoCorrectResult: settings.psoCorrectResult
                )

                let actual = ScoringCalculator.MatchResult(
                    homeScore: homeActual,
                    awayScore: awayActual,
                    homePso: match.homeScorePso,
                    awayPso: match.awayScorePso
                )

                let prediction = ScoringCalculator.PredictionResult(
                    homeScore: pred.predictedHomeScore,
                    awayScore: pred.predictedAwayScore,
                    homePso: pred.predictedHomePso,
                    awayPso: pred.predictedAwayPso
                )

                points = ScoringCalculator.calculatePoints(
                    prediction: prediction,
                    actual: actual,
                    rules: rules
                )
            }

            allInfos.append(MatchPredictionInfo(
                id: entryId,
                poolName: cachedEntryPool[entryId] ?? "Unknown Pool",
                entryName: cachedEntryName[entryId] ?? "Entry",
                prediction: pred,
                matchPoints: points
            ))
        }

        predictionInfos = allInfos
    }
}
