import Foundation
import Supabase

/// Handles all pool-related Supabase queries.
@MainActor
final class PoolService {
    private let supabase = SupabaseService.shared.client

    /// In-memory cache for pool settings (poolId → settings)
    private static var settingsCache: [String: PoolSettings] = [:]

    // MARK: - Fetch User's Pools

    func fetchUserPools(userId: String) async throws -> [Pool] {
        // Get pool IDs where user is a member
        struct MemberRow: Codable {
            let poolId: String
            enum CodingKeys: String, CodingKey {
                case poolId = "pool_id"
            }
        }

        let memberships: [MemberRow] = try await supabase
            .from("pool_members")
            .select("pool_id")
            .eq("user_id", value: userId)
            .execute()
            .value

        let poolIds = memberships.map(\.poolId)
        print("[PoolService] Found \(poolIds.count) memberships for userId \(userId): \(poolIds)")
        guard !poolIds.isEmpty else { return [] }

        // Fetch each pool individually to avoid one bad decode killing all results
        var pools: [Pool] = []
        for poolId in poolIds {
            do {
                let pool: Pool = try await supabase
                    .from("pools")
                    .select("pool_id, pool_name, pool_code, description, status, is_private, max_participants, max_entries_per_user, tournament_id, prediction_deadline, prediction_mode, created_at, updated_at")
                    .eq("pool_id", value: poolId)
                    .single()
                    .execute()
                    .value
                pools.append(pool)
            } catch {
                print("[PoolService] Failed to decode pool \(poolId): \(error)")
            }
        }

        return pools.sorted { ($0.createdAt) > ($1.createdAt) }
    }

    // MARK: - Fetch Single Pool

    func fetchPool(poolId: String) async throws -> Pool {
        let pool: Pool = try await supabase
            .from("pools")
            .select("pool_id, pool_name, pool_code, description, status, is_private, max_participants, max_entries_per_user, tournament_id, prediction_deadline, prediction_mode, created_at, updated_at")
            .eq("pool_id", value: poolId)
            .single()
            .execute()
            .value

        return pool
    }

    // MARK: - Join Pool by Code

    func joinPool(poolCode: String, userId: String) async throws -> Pool {
        let pools: [Pool] = try await supabase
            .from("pools")
            .select("pool_id, pool_name, pool_code, description, status, is_private, max_participants, max_entries_per_user, tournament_id, prediction_deadline, prediction_mode, created_at, updated_at")
            .eq("pool_code", value: poolCode.uppercased())
            .limit(1)
            .execute()
            .value

        guard let pool = pools.first else {
            throw PoolError.poolNotFound
        }

        // Check if already a member
        struct MemberCheck: Codable {
            let memberId: String
            enum CodingKeys: String, CodingKey {
                case memberId = "member_id"
            }
        }

        let existing: [MemberCheck] = try await supabase
            .from("pool_members")
            .select("member_id")
            .eq("pool_id", value: pool.poolId)
            .eq("user_id", value: userId)
            .execute()
            .value

        if !existing.isEmpty {
            throw PoolError.alreadyMember
        }

        // Insert membership
        struct NewMember: Codable {
            let poolId: String
            let userId: String
            let role: String
            enum CodingKeys: String, CodingKey {
                case poolId = "pool_id"
                case userId = "user_id"
                case role
            }
        }

        try await supabase
            .from("pool_members")
            .insert(NewMember(poolId: pool.poolId, userId: userId, role: "member"))
            .execute()

        return pool
    }

    // MARK: - Search Pools

    func searchPools(query: String) async throws -> [Pool] {
        let pools: [Pool] = try await supabase
            .from("pools")
            .select("pool_id, pool_name, pool_code, description, status, is_private, max_participants, max_entries_per_user, tournament_id, prediction_deadline, prediction_mode, created_at, updated_at")
            .eq("is_private", value: false)
            .eq("status", value: "active")
            .ilike("pool_name", pattern: "%\(query)%")
            .execute()
            .value

        return pools
    }

    // MARK: - Fetch Members

    func fetchMembers(poolId: String) async throws -> [Member] {
        // Select only the columns we model to avoid decoding failures from extra DB columns
        let members: [Member] = try await supabase
            .from("pool_members")
            .select("""
                member_id, pool_id, user_id, role, joined_at, entry_fee_paid,
                users(user_id, username, full_name, email),
                entries:pool_entries(
                    entry_id, member_id, entry_name, entry_number,
                    has_submitted_predictions, predictions_submitted_at,
                    predictions_locked, auto_submitted, predictions_last_saved_at,
                    total_points, point_adjustment, adjustment_reason,
                    current_rank, previous_rank, last_rank_update, created_at
                )
            """)
            .eq("pool_id", value: poolId)
            .execute()
            .value

        return members
    }

    // MARK: - Fetch Matches

    func fetchMatches(tournamentId: String) async throws -> [Match] {
        let matches: [Match] = try await supabase
            .from("matches")
            .select("""
                match_id, tournament_id, match_number, stage, group_letter,
                home_team_id, away_team_id, home_team_placeholder, away_team_placeholder,
                match_date, venue, status, home_score_ft, away_score_ft,
                home_score_pso, away_score_pso, winner_team_id, is_completed, completed_at,
                home_team:teams!home_team_id(country_name, country_code, flag_url),
                away_team:teams!away_team_id(country_name, country_code, flag_url)
            """)
            .eq("tournament_id", value: tournamentId)
            .order("match_number")
            .execute()
            .value

        return matches
    }

    // MARK: - Fetch All Predictions for a Pool

    func fetchAllPredictions(poolId: String, members: [Member]) async throws -> [Prediction] {
        // Get all entry IDs from the already-fetched members
        let entryIds = members.flatMap { $0.entries ?? [] }.map(\.entryId)
        guard !entryIds.isEmpty else { return [] }

        // Fetch predictions for each entry
        var allPredictions: [Prediction] = []
        for entryId in entryIds {
            do {
                let preds: [Prediction] = try await supabase
                    .from("predictions")
                    .select("prediction_id, entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id")
                    .eq("entry_id", value: entryId)
                    .execute()
                    .value
                allPredictions.append(contentsOf: preds)
            } catch {
                print("[PoolService] Failed to fetch predictions for entry \(entryId): \(error)")
            }
        }

        print("[PoolService] Fetched \(allPredictions.count) total predictions for \(entryIds.count) entries in pool \(poolId)")
        return allPredictions
    }

    // MARK: - Fetch Player Scores

    func fetchPlayerScores(entryIds: [String]) async throws -> [PlayerScore] {
        guard !entryIds.isEmpty else { return [] }

        let scores: [PlayerScore] = try await supabase
            .from("player_scores")
            .select("entry_id, match_points, bonus_points, total_points")
            .in("entry_id", values: entryIds)
            .execute()
            .value

        return scores
    }

    // MARK: - Fetch Teams

    func fetchTeams(tournamentId: String) async throws -> [Team] {
        let teams: [Team] = try await supabase
            .from("teams")
            .select("team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url")
            .eq("tournament_id", value: tournamentId)
            .execute()
            .value
        return teams
    }

    // MARK: - Fetch Pool Settings

    func fetchSettings(poolId: String) async throws -> PoolSettings? {
        // Return cached settings if available
        if let cached = PoolService.settingsCache[poolId] {
            return cached
        }

        // Use array fetch instead of .single() to avoid throwing when no settings exist
        let settings: [PoolSettings] = try await supabase
            .from("pool_settings")
            .select()
            .eq("pool_id", value: poolId)
            .limit(1)
            .execute()
            .value

        if let result = settings.first {
            PoolService.settingsCache[poolId] = result
        }
        return settings.first
    }

    /// Clear the settings cache (e.g. on logout or pull-to-refresh)
    static func clearSettingsCache() {
        settingsCache.removeAll()
    }

    // MARK: - Admin Operations

    /// Update pool properties
    func updatePool(poolId: String, updates: PoolUpdatePayload) async throws {
        try await supabase
            .from("pools")
            .update(updates)
            .eq("pool_id", value: poolId)
            .execute()
    }

    /// Update a member's role (admin/player)
    func updateMemberRole(memberId: String, role: String) async throws {
        struct RoleUpdate: Codable { let role: String }
        try await supabase
            .from("pool_members")
            .update(RoleUpdate(role: role))
            .eq("member_id", value: memberId)
            .execute()
    }

    /// Remove a member and all their entries/predictions from the pool
    func removeMember(memberId: String) async throws {
        // Fetch entry IDs first
        struct EntryRow: Codable {
            let entryId: String
            enum CodingKeys: String, CodingKey { case entryId = "entry_id" }
        }
        let entries: [EntryRow] = try await supabase
            .from("pool_entries")
            .select("entry_id")
            .eq("member_id", value: memberId)
            .execute()
            .value

        for entry in entries {
            try await supabase.from("predictions").delete().eq("entry_id", value: entry.entryId).execute()
            try await supabase.from("pool_entries").delete().eq("entry_id", value: entry.entryId).execute()
        }

        try await supabase.from("pool_members").delete().eq("member_id", value: memberId).execute()
    }

    /// Adjust points for a specific entry
    func adjustEntryPoints(entryId: String, adjustment: Int, reason: String) async throws {
        struct AdjustPayload: Codable {
            let pointAdjustment: Int
            let adjustmentReason: String
            enum CodingKeys: String, CodingKey {
                case pointAdjustment = "point_adjustment"
                case adjustmentReason = "adjustment_reason"
            }
        }
        try await supabase
            .from("pool_entries")
            .update(AdjustPayload(pointAdjustment: adjustment, adjustmentReason: reason))
            .eq("entry_id", value: entryId)
            .execute()
    }

    /// Delete a pool and all related data (cascade)
    func deletePool(poolId: String) async throws {
        let members = try await fetchMembers(poolId: poolId)
        let entryIds = members.flatMap { $0.entries ?? [] }.map(\.entryId)

        for eid in entryIds {
            try await supabase.from("predictions").delete().eq("entry_id", value: eid).execute()
        }
        for eid in entryIds {
            try await supabase.from("pool_entries").delete().eq("entry_id", value: eid).execute()
        }
        try await supabase.from("pool_members").delete().eq("pool_id", value: poolId).execute()
        try await supabase.from("pool_settings").delete().eq("pool_id", value: poolId).execute()
        try await supabase.from("pools").delete().eq("pool_id", value: poolId).execute()
    }
}

// MARK: - Payloads

struct PoolUpdatePayload: Codable {
    var poolName: String?
    var description: String?
    var status: String?
    var isPrivate: Bool?
    var maxEntriesPerUser: Int?
    var predictionDeadline: String?

    enum CodingKeys: String, CodingKey {
        case poolName = "pool_name"
        case description
        case status
        case isPrivate = "is_private"
        case maxEntriesPerUser = "max_entries_per_user"
        case predictionDeadline = "prediction_deadline"
    }
}

// MARK: - Errors

enum PoolError: LocalizedError {
    case poolNotFound
    case alreadyMember
    case poolFull

    var errorDescription: String? {
        switch self {
        case .poolNotFound: return "No pool found with that code."
        case .alreadyMember: return "You're already a member of this pool."
        case .poolFull: return "This pool has reached its maximum number of participants."
        }
    }
}
