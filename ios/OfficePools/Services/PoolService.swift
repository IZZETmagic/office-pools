import Foundation
import Supabase

/// Handles all pool-related Supabase queries.
@MainActor
final class PoolService {
    private let supabase = SupabaseService.shared.client

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

    // MARK: - Fetch Pool Settings

    func fetchSettings(poolId: String) async throws -> PoolSettings? {
        // Use array fetch instead of .single() to avoid throwing when no settings exist
        let settings: [PoolSettings] = try await supabase
            .from("pool_settings")
            .select()
            .eq("pool_id", value: poolId)
            .limit(1)
            .execute()
            .value

        return settings.first
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
