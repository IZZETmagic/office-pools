import Foundation

/// View model for the pool detail screen — manages tabs, members, matches, entries.
@MainActor
@Observable
final class PoolDetailViewModel {
    let poolId: String

    var pool: Pool?
    var members: [Member] = []
    var matches: [Match] = []
    var settings: PoolSettings?
    var currentMember: Member?
    var selectedEntry: Entry?
    var isLoading = false
    var errorMessage: String?

    /// Server-computed leaderboard data (entryId → LeaderboardEntryData)
    var leaderboardData: [LeaderboardEntryData] = []
    private var leaderboardMap: [String: LeaderboardEntryData] = [:]

    private let poolService = PoolService()
    private let apiService = APIService()

    init(poolId: String) {
        self.poolId = poolId
    }

    func load(userId: String) async {
        isLoading = true
        errorMessage = nil

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

        // Fetch members (independent, don't crash if it fails)
        do {
            members = try await poolService.fetchMembers(poolId: poolId)
            print("[PoolDetail] Members loaded: \(members.count)")
        } catch {
            print("[PoolDetail] Failed to load members: \(error)")
            members = []
        }

        // Fetch settings (independent, optional — pool may not have custom settings)
        do {
            settings = try await poolService.fetchSettings(poolId: poolId)
            print("[PoolDetail] Settings loaded")
        } catch {
            print("[PoolDetail] Settings not found or failed: \(error)")
            settings = nil
        }

        // Fetch matches
        if let tournamentId = pool?.tournamentId {
            do {
                matches = try await poolService.fetchMatches(tournamentId: tournamentId)
                print("[PoolDetail] Matches loaded: \(matches.count)")
            } catch {
                print("[PoolDetail] Failed to load matches: \(error)")
                matches = []
            }
        }

        // Fetch server-computed leaderboard (single source of truth for points)
        do {
            let response = try await apiService.fetchLeaderboard(poolId: poolId)
            leaderboardData = response.entries
            leaderboardMap = Dictionary(uniqueKeysWithValues: response.entries.map { ($0.entryId, $0) })
            print("[PoolDetail] Leaderboard loaded: \(response.entries.count) entries")
        } catch {
            print("[PoolDetail] Failed to load leaderboard: \(error)")
            leaderboardData = []
            leaderboardMap = [:]
        }

        // Find current user's membership
        currentMember = members.first { $0.userId == userId }
        print("[PoolDetail] Current member: \(currentMember?.users.fullName ?? "not found"), entries: \(currentMember?.entries?.count ?? 0)")

        // Select first entry by default
        selectedEntry = currentMember?.entries?.first

        isLoading = false
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
