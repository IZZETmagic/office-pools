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

    private let poolService = PoolService()

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

        // Find current user's membership
        currentMember = members.first { $0.userId == userId }
        print("[PoolDetail] Current member: \(currentMember?.users.fullName ?? "not found"), entries: \(currentMember?.entries?.count ?? 0)")

        // Select first entry by default
        selectedEntry = currentMember?.entries?.first

        isLoading = false
    }

    // MARK: - Computed Properties

    var leaderboard: [LeaderboardEntry] {
        members
            .flatMap { member in
                (member.entries ?? []).map { entry in
                    LeaderboardEntry(entry: entry, user: member.users, role: member.role)
                }
            }
            .sorted { ($0.entry.currentRank ?? Int.max) < ($1.entry.currentRank ?? Int.max) }
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
