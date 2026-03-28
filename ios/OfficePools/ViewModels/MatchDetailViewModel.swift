import Foundation
import Supabase
import Realtime

/// Info about a user's prediction for a match in a specific pool/entry.
struct MatchPredictionInfo: Identifiable {
    let id: String  // entryId
    let poolName: String
    let poolId: String
    let entryName: String
    let prediction: Prediction?
    let matchPoints: Int?  // Calculated from pool settings, nil if match not completed
    var predictedHomeTeam: String?  // Resolved from bracket for knockout matches
    var predictedAwayTeam: String?  // Resolved from bracket for knockout matches
    var teamsMatch: Bool?  // Whether predicted teams match actual teams (knockout only)
    var breakdownResultType: String?  // "exact", "winner_gd", "winner", "miss", "wrong_teams" from breakdown API
    var breakdownPoints: Int?  // Points from breakdown API (accounts for team mismatch)
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
    private var cachedEntryPoolId: [String: String] = [:]  // entryId → poolId
    private var cachedEntryName: [String: String] = [:]  // entryId → entryName
    private var cachedEntryIds: [String] = []
    private var cachedPredictedTeams: [String: (home: String?, away: String?)] = [:]  // entryId → predicted teams
    private var cachedBreakdownData: [String: (teamsMatch: Bool, resultType: String, points: Int)] = [:]  // entryId → breakdown results

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
            cachedEntryPoolId = [:]
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
                    cachedEntryPoolId[entry.entryId] = pool.poolId
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

        // Fetch breakdown from API for server-computed points and predicted teams
        for entryId in cachedEntryIds {
            guard let poolId = cachedEntryPoolId[entryId] else { continue }
            do {
                let breakdown = try await apiService.fetchPointsBreakdown(poolId: poolId, entryId: entryId)
                if let matchData = breakdown.matchResults.first(where: { $0.matchNumber == match.matchNumber }) {
                    cachedPredictedTeams[entryId] = (home: matchData.predictedHomeTeam, away: matchData.predictedAwayTeam)
                    cachedBreakdownData[entryId] = (
                        teamsMatch: matchData.teamsMatch,
                        resultType: matchData.type,
                        points: matchData.totalPoints
                    )
                }
            } catch {
                print("[MatchDetail] Failed to fetch breakdown for entry \(entryId): \(error)")
            }
        }
        // Rebuild with breakdown data
        rebuildPredictionInfos()

        // Load match stats before finishing load
        do {
            matchStats = try await apiService.fetchMatchStats(matchId: match.matchId)
            print("[MatchDetail] Match stats loaded: \(matchStats?.totalPredictions ?? 0) predictions")
        } catch {
            print("[MatchDetail] Failed to load match stats: \(error)")
        }

        isLoading = false
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

            // Use server-computed points from breakdown API
            if let breakdown = cachedBreakdownData[entryId] {
                points = breakdown.points
            }

            let teams = cachedPredictedTeams[entryId]
            let breakdown = cachedBreakdownData[entryId]
            allInfos.append(MatchPredictionInfo(
                id: entryId,
                poolName: cachedEntryPool[entryId] ?? "Unknown Pool",
                poolId: cachedEntryPoolId[entryId] ?? "",
                entryName: cachedEntryName[entryId] ?? "Entry",
                prediction: pred,
                matchPoints: points,
                predictedHomeTeam: teams?.home,
                predictedAwayTeam: teams?.away,
                teamsMatch: breakdown?.teamsMatch,
                breakdownResultType: breakdown?.resultType,
                breakdownPoints: breakdown?.points
            ))
        }

        predictionInfos = allInfos
    }
}
