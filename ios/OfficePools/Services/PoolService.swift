import Foundation
import Supabase

/// Handles all pool-related Supabase queries.
@MainActor
final class PoolService {
    private let supabase = SupabaseService.shared.client

    /// In-memory cache for pool settings (poolId → settings)
    private static var settingsCache: [String: PoolSettings] = [:]

    // MARK: - Fetch Tournaments

    func fetchTournaments() async throws -> [Tournament] {
        let tournaments: [Tournament] = try await supabase
            .from("tournaments")
            .select("tournament_id, name, short_name, tournament_type, year, host_countries, start_date, end_date, status, description")
            .order("start_date", ascending: false)
            .execute()
            .value
        return tournaments
    }

    // MARK: - Create Pool

    /// Create a new pool with all related records (member, entry, settings, round states).
    /// Mirrors the web's CreatePoolModal.handleCreatePool().
    func createPool(
        poolName: String,
        description: String?,
        tournamentId: String,
        adminUserId: String,
        username: String,
        predictionDeadline: Date,
        predictionMode: PredictionMode,
        isPrivate: Bool,
        maxParticipants: Int?,
        maxEntriesPerUser: Int
    ) async throws -> Pool {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let deadlineISO = formatter.string(from: predictionDeadline)

        // 1. Insert pool
        struct NewPool: Codable {
            let poolName: String
            let description: String?
            let tournamentId: String
            let adminUserId: String
            let predictionDeadline: String
            let predictionMode: String
            let status: String
            let isPrivate: Bool
            let maxParticipants: Int?
            let maxEntriesPerUser: Int

            enum CodingKeys: String, CodingKey {
                case poolName = "pool_name"
                case description
                case tournamentId = "tournament_id"
                case adminUserId = "admin_user_id"
                case predictionDeadline = "prediction_deadline"
                case predictionMode = "prediction_mode"
                case status
                case isPrivate = "is_private"
                case maxParticipants = "max_participants"
                case maxEntriesPerUser = "max_entries_per_user"
            }
        }

        let maxP = (maxParticipants ?? 0) > 0 ? maxParticipants : nil
        let maxE = max(1, min(10, maxEntriesPerUser))

        let pool: Pool = try await supabase
            .from("pools")
            .insert(NewPool(
                poolName: poolName.trimmingCharacters(in: .whitespacesAndNewlines),
                description: description?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true ? nil : description?.trimmingCharacters(in: .whitespacesAndNewlines),
                tournamentId: tournamentId,
                adminUserId: adminUserId,
                predictionDeadline: deadlineISO,
                predictionMode: predictionMode.rawValue,
                status: "open",
                isPrivate: isPrivate,
                maxParticipants: maxP,
                maxEntriesPerUser: maxE
            ))
            .select("pool_id, pool_name, pool_code, description, status, is_private, max_participants, max_entries_per_user, tournament_id, prediction_deadline, prediction_mode, created_at, updated_at, brand_name, brand_emoji, brand_color, brand_accent")
            .single()
            .execute()
            .value

        print("[PoolService] Pool created: \(pool.poolName) (code: \(pool.poolCode))")

        // 2. Add creator as admin member
        struct NewMemberReturn: Codable {
            let memberId: String
            enum CodingKeys: String, CodingKey { case memberId = "member_id" }
        }

        struct NewAdminMember: Codable {
            let poolId: String
            let userId: String
            let role: String
            enum CodingKeys: String, CodingKey {
                case poolId = "pool_id"
                case userId = "user_id"
                case role
            }
        }

        let memberResult: NewMemberReturn = try await supabase
            .from("pool_members")
            .insert(NewAdminMember(poolId: pool.poolId, userId: adminUserId, role: "admin"))
            .select("member_id")
            .single()
            .execute()
            .value

        // 3. Auto-create first entry
        try await createPoolEntry(
            memberId: memberResult.memberId,
            entryName: username.isEmpty ? "Entry 1" : username,
            entryNumber: 1
        )

        // 4. Update pool_settings with defaults (row auto-created by DB trigger)
        try await supabase
            .from("pool_settings")
            .update(ScoringDefaultsPayload.defaults)
            .eq("pool_id", value: pool.poolId)
            .execute()

        // 5. For progressive mode: seed round states and disable bracket pairing bonus
        if predictionMode == .progressive {
            struct RoundState: Codable {
                let poolId: String
                let roundKey: String
                let state: String
                let deadline: String?
                let openedAt: String?
                enum CodingKeys: String, CodingKey {
                    case poolId = "pool_id"
                    case roundKey = "round_key"
                    case state
                    case deadline
                    case openedAt = "opened_at"
                }
            }

            let roundKeys = ["group", "round_32", "round_16", "quarter_final", "semi_final", "third_place", "final"]
            let nowISO = formatter.string(from: Date())
            let roundStates = roundKeys.map { key in
                RoundState(
                    poolId: pool.poolId,
                    roundKey: key,
                    state: key == "group" ? "open" : "locked",
                    deadline: key == "group" ? deadlineISO : nil,
                    openedAt: key == "group" ? nowISO : nil
                )
            }

            try? await supabase
                .from("pool_round_states")
                .insert(roundStates)
                .execute()

            // Disable bracket pairing bonus for progressive pools
            struct BracketPairingUpdate: Codable {
                let bonusCorrectBracketPairing: Int
                enum CodingKeys: String, CodingKey {
                    case bonusCorrectBracketPairing = "bonus_correct_bracket_pairing"
                }
            }
            try? await supabase
                .from("pool_settings")
                .update(BracketPairingUpdate(bonusCorrectBracketPairing: 0))
                .eq("pool_id", value: pool.poolId)
                .execute()
        }

        print("[PoolService] Pool setup complete: \(pool.poolId)")
        return pool
    }

    // MARK: - Create Pool Entry

    /// Insert a pool entry for a member. Used by both createPool and joinPool.
    func createPoolEntry(memberId: String, entryName: String, entryNumber: Int) async throws {
        struct NewEntry: Codable {
            let memberId: String
            let entryName: String
            let entryNumber: Int
            enum CodingKeys: String, CodingKey {
                case memberId = "member_id"
                case entryName = "entry_name"
                case entryNumber = "entry_number"
            }
        }

        try await supabase
            .from("pool_entries")
            .insert(NewEntry(memberId: memberId, entryName: entryName, entryNumber: entryNumber))
            .execute()
    }

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

        // Batch fetch all pools in a single query
        let pools: [Pool] = try await supabase
            .from("pools")
            .select("pool_id, pool_name, pool_code, description, status, is_private, max_participants, max_entries_per_user, tournament_id, prediction_deadline, prediction_mode, created_at, updated_at, brand_name, brand_emoji, brand_color, brand_accent")
            .in("pool_id", values: poolIds)
            .execute()
            .value

        return pools.sorted { ($0.createdAt) > ($1.createdAt) }
    }

    // MARK: - Fetch Single Pool

    func fetchPool(poolId: String) async throws -> Pool {
        let pool: Pool = try await supabase
            .from("pools")
            .select("pool_id, pool_name, pool_code, description, status, is_private, max_participants, max_entries_per_user, tournament_id, prediction_deadline, prediction_mode, created_at, updated_at, brand_name, brand_emoji, brand_color, brand_accent")
            .eq("pool_id", value: poolId)
            .single()
            .execute()
            .value

        return pool
    }

    // MARK: - Join Pool by Code

    func joinPool(poolCode: String, userId: String, username: String = "Entry 1") async throws -> Pool {
        let pools: [Pool] = try await supabase
            .from("pools")
            .select("pool_id, pool_name, pool_code, description, status, is_private, max_participants, max_entries_per_user, tournament_id, prediction_deadline, prediction_mode, created_at, updated_at, brand_name, brand_emoji, brand_color, brand_accent")
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

        // Insert membership and get member_id back
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

        struct MemberReturn: Codable {
            let memberId: String
            enum CodingKeys: String, CodingKey { case memberId = "member_id" }
        }

        let memberResult: MemberReturn = try await supabase
            .from("pool_members")
            .insert(NewMember(poolId: pool.poolId, userId: userId, role: "member"))
            .select("member_id")
            .single()
            .execute()
            .value

        // Auto-create first entry (matching web behavior)
        try? await createPoolEntry(
            memberId: memberResult.memberId,
            entryName: username.isEmpty ? "Entry 1" : username,
            entryNumber: 1
        )

        return pool
    }

    // MARK: - Discover / Search Public Pools

    /// Fetch all public, open pools. Optionally filter by name search and prediction mode.
    func fetchPublicPools(
        query: String = "",
        mode: PredictionMode? = nil,
        userId: String
    ) async throws -> [DiscoverPoolData] {
        // 1. Fetch public open pools
        var request = supabase
            .from("pools")
            .select("pool_id, pool_name, pool_code, description, status, is_private, max_participants, max_entries_per_user, tournament_id, prediction_deadline, prediction_mode, created_at, updated_at, brand_name, brand_emoji, brand_color, brand_accent")
            .eq("is_private", value: false)
            .eq("status", value: "open")

        if !query.isEmpty {
            request = request.ilike("pool_name", pattern: "%\(query)%")
        }
        if let mode {
            request = request.eq("prediction_mode", value: mode.rawValue)
        }

        let pools: [Pool] = try await request
            .order("created_at", ascending: false)
            .execute()
            .value

        guard !pools.isEmpty else { return [] }

        // 2. Batch-fetch member counts
        struct MemberCountRow: Codable {
            let poolId: String
            let userId: String
            enum CodingKeys: String, CodingKey {
                case poolId = "pool_id"
                case userId = "user_id"
            }
        }

        let poolIds = pools.map(\.poolId)
        let memberRows: [MemberCountRow] = try await supabase
            .from("pool_members")
            .select("pool_id, user_id")
            .in("pool_id", values: poolIds)
            .execute()
            .value

        // Count members per pool and check which ones the user already joined
        var countByPool: [String: Int] = [:]
        var joinedPoolIds: Set<String> = []
        for row in memberRows {
            countByPool[row.poolId, default: 0] += 1
            if row.userId == userId {
                joinedPoolIds.insert(row.poolId)
            }
        }

        // 3. Assemble results
        return pools.map { pool in
            DiscoverPoolData(
                pool: pool,
                memberCount: countByPool[pool.poolId] ?? 0,
                isAlreadyJoined: joinedPoolIds.contains(pool.poolId)
            )
        }
    }

    func searchPools(query: String) async throws -> [Pool] {
        let pools: [Pool] = try await supabase
            .from("pools")
            .select("pool_id, pool_name, pool_code, description, status, is_private, max_participants, max_entries_per_user, tournament_id, prediction_deadline, prediction_mode, created_at, updated_at, brand_name, brand_emoji, brand_color, brand_accent")
            .eq("is_private", value: false)
            .eq("status", value: "open")
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

        // Strip knockout team assignments until all group matches are complete
        let allGroupsComplete = matches
            .filter { $0.stage == "group" }
            .allSatisfy { $0.isCompleted }

        guard !allGroupsComplete else { return matches }

        return matches.map { m in
            guard m.stage != "group" else { return m }
            return Match(
                matchId: m.matchId,
                tournamentId: m.tournamentId,
                matchNumber: m.matchNumber,
                stage: m.stage,
                groupLetter: m.groupLetter,
                homeTeamId: nil,
                awayTeamId: nil,
                homeTeamPlaceholder: m.homeTeamPlaceholder,
                awayTeamPlaceholder: m.awayTeamPlaceholder,
                matchDate: m.matchDate,
                venue: m.venue,
                status: m.status,
                homeScoreFt: m.homeScoreFt,
                awayScoreFt: m.awayScoreFt,
                homeScorePso: m.homeScorePso,
                awayScorePso: m.awayScorePso,
                winnerTeamId: m.winnerTeamId,
                isCompleted: m.isCompleted,
                completedAt: m.completedAt,
                homeTeam: nil,
                awayTeam: nil
            )
        }
    }

    /// Fetch only group-stage matches for a specific group (for standings calculation).
    func fetchGroupMatches(tournamentId: String, groupLetter: String) async throws -> [Match] {
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
            .eq("group_letter", value: groupLetter)
            .eq("stage", value: "group")
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

    /// Update pool scoring settings
    func updateSettings(poolId: String, updates: [String: AnyJSON]) async throws {
        try await supabase
            .from("pool_settings")
            .update(updates)
            .eq("pool_id", value: poolId)
            .execute()
        // Invalidate cache so next fetch gets fresh data
        PoolService.settingsCache.removeValue(forKey: poolId)
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

    /// Add a point adjustment to the history and update the entry's running total
    func adjustEntryPoints(entryId: String, poolId: String, adjustment: Int, reason: String, createdBy: String) async throws {
        // 1. Insert into point_adjustments history
        struct InsertPayload: Codable {
            let entryId: String
            let poolId: String
            let amount: Int
            let reason: String
            let createdBy: String
            enum CodingKeys: String, CodingKey {
                case entryId = "entry_id"
                case poolId = "pool_id"
                case amount, reason
                case createdBy = "created_by"
            }
        }
        try await supabase
            .from("point_adjustments")
            .insert(InsertPayload(entryId: entryId, poolId: poolId, amount: adjustment, reason: reason, createdBy: createdBy))
            .execute()

        // 2. Fetch sum of all adjustments for this entry
        let adjustments: [PointAdjustment] = try await supabase
            .from("point_adjustments")
            .select()
            .eq("entry_id", value: entryId)
            .execute()
            .value
        let totalAdjustment = adjustments.reduce(0) { $0 + $1.amount }
        let latestReason = adjustments.sorted(by: { $0.createdAt > $1.createdAt }).first?.reason ?? reason

        // 3. Update pool_entries with the new total
        struct UpdatePayload: Codable {
            let pointAdjustment: Int
            let adjustmentReason: String
            enum CodingKeys: String, CodingKey {
                case pointAdjustment = "point_adjustment"
                case adjustmentReason = "adjustment_reason"
            }
        }
        try await supabase
            .from("pool_entries")
            .update(UpdatePayload(pointAdjustment: totalAdjustment, adjustmentReason: latestReason))
            .eq("entry_id", value: entryId)
            .execute()

        // 4. Lite recalc: update scored_total_points and re-rank the pool
        try await supabase.rpc("lite_recalc_entry", params: ["p_entry_id": entryId, "p_pool_id": poolId])
            .execute()
    }

    /// Fetch adjustment history for an entry
    func fetchAdjustments(entryId: String) async throws -> [PointAdjustment] {
        try await supabase
            .from("point_adjustments")
            .select()
            .eq("entry_id", value: entryId)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    /// Delete a single adjustment and recalculate the entry's running total
    func deleteAdjustment(adjustmentId: String, entryId: String, poolId: String) async throws {
        // 1. Delete the adjustment record
        try await supabase
            .from("point_adjustments")
            .delete()
            .eq("id", value: adjustmentId)
            .execute()

        // 2. Re-sum remaining adjustments
        let remaining: [PointAdjustment] = try await supabase
            .from("point_adjustments")
            .select()
            .eq("entry_id", value: entryId)
            .order("created_at", ascending: false)
            .execute()
            .value
        let totalAdjustment = remaining.reduce(0) { $0 + $1.amount }
        let latestReason = remaining.first?.reason ?? ""

        // 3. Update pool_entries with recalculated total
        struct UpdatePayload: Codable {
            let pointAdjustment: Int
            let adjustmentReason: String
            enum CodingKeys: String, CodingKey {
                case pointAdjustment = "point_adjustment"
                case adjustmentReason = "adjustment_reason"
            }
        }
        try await supabase
            .from("pool_entries")
            .update(UpdatePayload(pointAdjustment: totalAdjustment, adjustmentReason: latestReason))
            .eq("entry_id", value: entryId)
            .execute()

        // 4. Lite recalc: update scored_total_points and re-rank the pool
        try await supabase.rpc("lite_recalc_entry", params: ["p_entry_id": entryId, "p_pool_id": poolId])
            .execute()
    }

    /// Unlock a submitted entry so the user can edit predictions again
    func unlockEntry(entryId: String) async throws {
        struct UnlockPayload: Codable {
            let hasSubmittedPredictions: Bool
            let predictionsSubmittedAt: String?
            enum CodingKeys: String, CodingKey {
                case hasSubmittedPredictions = "has_submitted_predictions"
                case predictionsSubmittedAt = "predictions_submitted_at"
            }
        }
        try await supabase
            .from("pool_entries")
            .update(UnlockPayload(hasSubmittedPredictions: false, predictionsSubmittedAt: nil))
            .eq("entry_id", value: entryId)
            .execute()
    }

    // MARK: - Progressive Round States

    /// Fetch all round states for a progressive pool
    func fetchRoundStates(poolId: String) async throws -> [PoolRoundState] {
        let states: [PoolRoundState] = try await supabase
            .from("pool_round_states")
            .select()
            .eq("pool_id", value: poolId)
            .execute()
            .value
        return states
    }

    /// Fetch round submissions for a specific entry
    func fetchRoundSubmissions(entryId: String) async throws -> [EntryRoundSubmission] {
        let submissions: [EntryRoundSubmission] = try await supabase
            .from("entry_round_submissions")
            .select()
            .eq("entry_id", value: entryId)
            .execute()
            .value
        return submissions
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
