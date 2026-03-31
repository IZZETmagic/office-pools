import Foundation

/// View model for the pool detail screen — manages tabs, members, matches, entries.
@MainActor
@Observable
final class PoolDetailViewModel {
    let poolId: String

    var pool: Pool?
    var members: [Member] = []
    var matches: [Match] = []
    var teams: [Team] = []
    var settings: PoolSettings?
    var currentMember: Member?
    var selectedEntry: Entry?
    var isLoading = true
    var errorMessage: String?

    /// Server-computed leaderboard data
    var leaderboardData: [LeaderboardEntryData] = []
    var leaderboardResponse: LeaderboardResponse?

    /// Progressive round states
    var roundStates: [PoolRoundState] = []
    var roundSubmissions: [String: EntryRoundSubmission] = [:]  // roundKey → submission
    var roundsResponse: APIService.RoundsResponse?

    /// Analytics data (pre-loaded)
    var analyticsData: [String: AnalyticsResponse] = [:]  // entryId → response
    var currentUserId: String?
    private var leaderboardMap: [String: LeaderboardEntryData] = [:]

    private let poolService = PoolService()
    private let apiService = APIService()

    init(poolId: String) {
        self.poolId = poolId
    }

    func load(userId: String) async {
        isLoading = true
        errorMessage = nil
        currentUserId = userId

        // Fetch pool first (required for tournament_id)
        do {
            pool = try await poolService.fetchPool(poolId: poolId)
            print("[PoolDetail] Pool loaded: \(pool?.poolName ?? "nil")")
        } catch {
            print("[PoolDetail] Failed to load pool: \(error)")
            errorMessage = "Failed to load pool: \(error.localizedDescription)"
            isLoading = false
            return
        }

        // Kick off all independent fetches concurrently using Task (inherits @MainActor)
        let tournamentId = pool?.tournamentId ?? ""
        let pid = poolId

        let membersTask = Task { () -> [Member] in
            do {
                let result = try await self.poolService.fetchMembers(poolId: pid)
                print("[PoolDetail] Members loaded: \(result.count)")
                return result
            } catch {
                print("[PoolDetail] Failed to load members: \(error)")
                return []
            }
        }

        let settingsTask = Task { () -> PoolSettings? in
            do {
                let result = try await self.poolService.fetchSettings(poolId: pid)
                print("[PoolDetail] Settings loaded")
                return result
            } catch {
                print("[PoolDetail] Settings not found or failed: \(error)")
                return nil
            }
        }

        let matchesTask = Task { () -> [Match] in
            guard !tournamentId.isEmpty else { return [] }
            do {
                let result = try await self.poolService.fetchMatches(tournamentId: tournamentId)
                print("[PoolDetail] Matches loaded: \(result.count)")
                return result
            } catch {
                print("[PoolDetail] Failed to load matches: \(error)")
                return []
            }
        }

        let teamsTask = Task { () -> [Team] in
            guard !tournamentId.isEmpty else { return [] }
            do {
                let result = try await self.poolService.fetchTeams(tournamentId: tournamentId)
                print("[PoolDetail] Teams loaded: \(result.count)")
                return result
            } catch {
                print("[PoolDetail] Failed to load teams: \(error)")
                return []
            }
        }

        let leaderboardTask = Task { () -> LeaderboardResponse? in
            do {
                let response = try await self.apiService.fetchLeaderboard(poolId: pid)
                print("[PoolDetail] Leaderboard loaded: \(response.entries.count) entries")
                return response
            } catch {
                print("[PoolDetail] Failed to load leaderboard: \(error)")
                return nil
            }
        }

        // Await all results — they've all been running concurrently on the main actor
        members = await membersTask.value
        settings = await settingsTask.value
        matches = await matchesTask.value
        teams = await teamsTask.value

        if let response = await leaderboardTask.value {
            leaderboardResponse = response
            leaderboardData = response.entries
            leaderboardMap = Dictionary(uniqueKeysWithValues: response.entries.map { ($0.entryId, $0) })
        } else {
            leaderboardData = []
            leaderboardMap = [:]
        }

        // Find current user's membership
        currentMember = members.first { $0.userId == userId }
        print("[PoolDetail] Current member: \(currentMember?.users.fullName ?? "not found"), entries: \(currentMember?.entries?.count ?? 0)")

        // Select first entry by default
        selectedEntry = currentMember?.entries?.first

        // Fetch progressive round states if applicable
        if pool?.predictionMode == .progressive {
            await loadRoundStates(entryId: selectedEntry?.entryId)
        }

        isLoading = false

        // Pre-load analytics for all entries concurrently (non-blocking)
        if let entries = currentMember?.entries {
            for entry in entries {
                Task {
                    do {
                        let response = try await self.apiService.fetchAnalytics(poolId: self.poolId, entryId: entry.entryId)
                        self.analyticsData[entry.entryId] = response
                        print("[PoolDetail] Analytics loaded for entry: \(entry.entryName)")
                    } catch {
                        print("[PoolDetail] Failed to load analytics for \(entry.entryName): \(error)")
                    }
                }
            }
        }
    }

    // MARK: - Real-time Leaderboard

    private let realtimeService = RealtimeService()

    /// Start listening for score changes and auto-refresh leaderboard
    func startScoresSubscription() async {
        realtimeService.onScoresUpdated = { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                await self.refreshLeaderboard()
            }
        }
        await realtimeService.subscribeToScores(poolId: poolId)

        // For progressive pools, also subscribe to round state changes
        if pool?.predictionMode == .progressive {
            realtimeService.onRoundStatesChanged = { [weak self] in
                guard let self else { return }
                Task { @MainActor in
                    print("[PoolDetail] Round state changed via Realtime — refreshing")
                    await self.refreshRoundStates(entryId: self.selectedEntry?.entryId)
                }
            }
            await realtimeService.subscribeToRoundStates(poolId: poolId)
        }
    }

    func stopScoresSubscription() async {
        await realtimeService.unsubscribeFromScores()
        await realtimeService.unsubscribeFromRoundStates()
        realtimeService.onScoresUpdated = nil
        realtimeService.onRoundStatesChanged = nil
    }

    /// Load progressive round states from the API
    func loadRoundStates(entryId: String? = nil) async {
        do {
            let response = try await apiService.fetchRounds(poolId: poolId, entryId: entryId)
            roundsResponse = response
            // Convert API response to PoolRoundState models
            roundStates = response.rounds.compactMap { rd -> PoolRoundState? in
                guard let state = RoundStateValue(rawValue: rd.state) else { return nil }
                guard let roundKey = RoundKey(rawValue: rd.roundKey) else { return nil }
                return PoolRoundState(
                    id: rd.id,
                    poolId: rd.poolId,
                    roundKey: roundKey,
                    state: state,
                    deadline: rd.deadline,
                    openedAt: rd.openedAt,
                    closedAt: rd.closedAt,
                    completedAt: rd.completedAt,
                    openedBy: rd.openedBy,
                    createdAt: "",
                    updatedAt: ""
                )
            }
            // Build submission map
            roundSubmissions = [:]
            for rd in response.rounds {
                if let sub = rd.entrySubmission {
                    roundSubmissions[rd.roundKey] = EntryRoundSubmission(
                        id: rd.id,
                        entryId: entryId ?? "",
                        roundKey: RoundKey(rawValue: rd.roundKey) ?? .group,
                        hasSubmitted: sub.hasSubmitted,
                        submittedAt: sub.submittedAt,
                        autoSubmitted: sub.autoSubmitted,
                        predictionCount: sub.predictionCount
                    )
                }
            }
            print("[PoolDetail] Round states loaded: \(roundStates.count)")
        } catch {
            print("[PoolDetail] Failed to load round states: \(error)")
        }
    }

    /// Refresh round states (e.g. after submission)
    func refreshRoundStates(entryId: String? = nil) async {
        await loadRoundStates(entryId: entryId)
    }

    /// Re-fetch pool settings (e.g. after scoring config change)
    func refreshSettings() async {
        do {
            settings = try await poolService.fetchSettings(poolId: poolId)
            print("[PoolDetail] Settings refreshed")
        } catch {
            print("[PoolDetail] Failed to refresh settings: \(error)")
        }
    }

    /// Re-fetch just the leaderboard data without reloading everything
    func refreshLeaderboard() async {
        do {
            let response = try await apiService.fetchLeaderboard(poolId: poolId)
            leaderboardResponse = response
            leaderboardData = response.entries
            leaderboardMap = Dictionary(uniqueKeysWithValues: response.entries.map { ($0.entryId, $0) })
            print("[PoolDetail] Leaderboard refreshed: \(response.entries.count) entries")
        } catch {
            print("[PoolDetail] Failed to refresh leaderboard: \(error)")
        }
    }

    // MARK: - Computed Properties

    /// Leaderboard built from server-computed data, already sorted by total_points.
    var leaderboard: [LeaderboardEntry] {
        // If we have server data, use it (it's already sorted correctly)
        if !leaderboardData.isEmpty {
            return leaderboardData.map { data in
                // Find the matching member/entry for the LeaderboardEntry struct
                let member = members.first { m in
                    m.entries?.contains { $0.entryId == data.entryId } ?? false
                }
                let entry = member?.entries?.first { $0.entryId == data.entryId }
                let user = member?.users ?? UserProfile(userId: data.userId, username: data.username, fullName: data.fullName, email: "")

                return LeaderboardEntry(
                    entry: entry ?? Entry(
                        entryId: data.entryId, memberId: data.memberId, entryName: data.entryName,
                        entryNumber: data.entryNumber, hasSubmittedPredictions: data.hasSubmittedPredictions,
                        predictionsSubmittedAt: nil, predictionsLocked: false, autoSubmitted: false,
                        predictionsLastSavedAt: nil, totalPoints: data.totalPoints,
                        pointAdjustment: data.pointAdjustment, adjustmentReason: nil,
                        currentRank: data.currentRank, previousRank: data.previousRank,
                        lastRankUpdate: nil, createdAt: ""
                    ),
                    user: user,
                    role: member?.role ?? "member"
                )
            }
        }

        // Fallback: build from members data (uses stale DB points)
        return members
            .flatMap { member in
                (member.entries ?? []).map { entry in
                    LeaderboardEntry(entry: entry, user: member.users, role: member.role)
                }
            }
            .sorted {
                ($0.entry.currentRank ?? Int.max) < ($1.entry.currentRank ?? Int.max)
            }
    }

    /// Get the display points for an entry — uses server-computed values (single source of truth).
    func displayPoints(for entryId: String) -> Int {
        leaderboardMap[entryId]?.totalPoints ?? 0
    }

    /// Get the match points only for an entry.
    func matchPoints(for entryId: String) -> Int {
        leaderboardMap[entryId]?.matchPoints ?? 0
    }

    /// Get the bonus points only for an entry.
    func bonusPoints(for entryId: String) -> Int {
        leaderboardMap[entryId]?.bonusPoints ?? 0
    }

    /// Check if an entry belongs to the current user
    func isCurrentUser(entryId: String) -> Bool {
        guard let userId = currentUserId else { return false }
        guard let data = leaderboardMap[entryId] else { return false }
        return data.userId == userId
    }

    /// Get awards for a specific entry
    func awards(for entryId: String) -> [PoolAward] {
        leaderboardResponse?.awards?.filter { $0.entryId == entryId } ?? []
    }

    var isAdmin: Bool {
        currentMember?.isAdmin ?? false
    }

    var groupStageMatches: [Match] {
        matches.filter { $0.stage == "group" }
    }

    var knockoutMatches: [Match] {
        matches.filter { $0.stage != "group" }
    }

    func matchesByGroup() -> [String: [Match]] {
        Dictionary(grouping: groupStageMatches, by: { $0.groupLetter ?? "?" })
    }

    func matchesByStage() -> [String: [Match]] {
        Dictionary(grouping: knockoutMatches, by: { $0.stage })
    }

}
