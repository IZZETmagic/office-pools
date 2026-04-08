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
    var groupStandings: [GroupStanding] = []
    var teamFlags: [String: String] = [:]  // teamId → flagUrl
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

            // 2. Fetch members + settings for all pools in parallel using async let pairs
            cachedEntryIds = []
            cachedEntryPool = [:]
            cachedEntryPoolId = [:]
            cachedEntryName = [:]
            cachedEntrySettings = [:]

            for pool in pools {
                async let membersTask = poolService.fetchMembers(poolId: pool.poolId)
                async let settingsTask = poolService.fetchSettings(poolId: pool.poolId)

                let members: [Member]
                let settings: PoolSettings?
                do {
                    members = try await membersTask
                    settings = try await settingsTask
                } catch {
                    print("[MatchDetail] Failed to fetch pool data for \(pool.poolName): \(error)")
                    continue
                }

                guard let myMember = members.first(where: { $0.userId == userId }) else { continue }
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

            // 4. Build initial display list (before scores/stats)
            rebuildPredictionInfos()

            print("[MatchDetail] Loaded \(predictions.count) predictions across \(cachedEntryIds.count) entries")
        } catch {
            print("[MatchDetail] Error: \(error)")
            errorMessage = error.localizedDescription
        }

        // 5. Run match scores, match stats, and group standings concurrently
        async let scoresTask: Void = loadMatchScores()
        async let statsTask: Void = loadMatchStatsData()
        async let standingsTask: Void = loadGroupStandingsIfNeeded()

        _ = await (scoresTask, statsTask, standingsTask)

        // Final rebuild with all data
        rebuildPredictionInfos()
        isLoading = false
    }

    /// Batch fetch match-specific scores for all entries in a single API call.
    private func loadMatchScores() async {
        guard !cachedEntryIds.isEmpty else { return }
        do {
            let scores = try await apiService.fetchMatchScores(matchId: match.matchId, entryIds: cachedEntryIds)
            for entry in scores.entries {
                cachedPredictedTeams[entry.entryId] = (home: entry.predictedHomeTeam, away: entry.predictedAwayTeam)
                cachedBreakdownData[entry.entryId] = (
                    teamsMatch: entry.teamsMatch,
                    resultType: entry.resultType,
                    points: entry.totalPoints
                )
            }
            print("[MatchDetail] Batch match scores loaded for \(scores.entries.count) entries")
        } catch {
            print("[MatchDetail] Failed to fetch match scores: \(error)")
        }
    }

    /// Fetch prediction statistics for this match.
    private func loadMatchStatsData() async {
        do {
            matchStats = try await apiService.fetchMatchStats(matchId: match.matchId)
            print("[MatchDetail] Match stats loaded: \(matchStats?.totalPredictions ?? 0) predictions")
        } catch {
            print("[MatchDetail] Failed to load match stats: \(error)")
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

    /// Load group standings if this is a group-stage match.
    private func loadGroupStandingsIfNeeded() async {
        guard let groupLetter = match.groupLetter else { return }
        await loadGroupStandings(groupLetter: groupLetter)
    }

    /// Load live group standings from actual match results for the given group.
    private func loadGroupStandings(groupLetter: String) async {
        do {
            let groupMatches = try await poolService.fetchGroupMatches(tournamentId: match.tournamentId, groupLetter: groupLetter)

            // Build standings from actual results
            var teamStats: [String: GroupStanding] = [:]

            // Initialize all teams from group matches and collect flag URLs
            var flags: [String: String] = [:]
            for m in groupMatches {
                if let id = m.homeTeamId, let team = m.homeTeam {
                    if let url = team.flagUrl { flags[id] = url }
                }
                if let id = m.awayTeamId, let team = m.awayTeam {
                    if let url = team.flagUrl { flags[id] = url }
                }
            }
            teamFlags = flags

            for m in groupMatches {
                if let id = m.homeTeamId, let team = m.homeTeam, teamStats[id] == nil {
                    teamStats[id] = GroupStanding(
                        teamId: id, teamName: team.countryName, countryCode: team.countryCode,
                        groupLetter: groupLetter, played: 0, won: 0, drawn: 0, lost: 0,
                        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
                        conductScore: 0, fifaRankingPoints: 0
                    )
                }
                if let id = m.awayTeamId, let team = m.awayTeam, teamStats[id] == nil {
                    teamStats[id] = GroupStanding(
                        teamId: id, teamName: team.countryName, countryCode: team.countryCode,
                        groupLetter: groupLetter, played: 0, won: 0, drawn: 0, lost: 0,
                        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
                        conductScore: 0, fifaRankingPoints: 0
                    )
                }
            }

            // Tally results from completed/live matches
            for m in groupMatches where m.isCompleted || m.status == "completed" || m.status == "live" {
                guard let homeId = m.homeTeamId, let awayId = m.awayTeamId,
                      let hg = m.homeScoreFt, let ag = m.awayScoreFt else { continue }

                teamStats[homeId]?.played += 1
                teamStats[awayId]?.played += 1
                teamStats[homeId]?.goalsFor += hg
                teamStats[homeId]?.goalsAgainst += ag
                teamStats[awayId]?.goalsFor += ag
                teamStats[awayId]?.goalsAgainst += hg

                if hg > ag {
                    teamStats[homeId]?.won += 1
                    teamStats[awayId]?.lost += 1
                } else if hg < ag {
                    teamStats[awayId]?.won += 1
                    teamStats[homeId]?.lost += 1
                } else {
                    teamStats[homeId]?.drawn += 1
                    teamStats[awayId]?.drawn += 1
                }
            }

            // Compute derived fields and sort
            var standings = teamStats.values.map { s -> GroupStanding in
                var s = s
                s.goalDifference = s.goalsFor - s.goalsAgainst
                s.points = s.won * 3 + s.drawn
                return s
            }

            standings.sort { a, b in
                if a.points != b.points { return a.points > b.points }
                if a.goalDifference != b.goalDifference { return a.goalDifference > b.goalDifference }
                if a.goalsFor != b.goalsFor { return a.goalsFor > b.goalsFor }
                return a.fifaRankingPoints > b.fifaRankingPoints
            }

            groupStandings = standings
            print("[MatchDetail] Group \(groupLetter) standings loaded: \(standings.count) teams")
        } catch {
            print("[MatchDetail] Failed to load group standings: \(error)")
        }
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
