import Foundation
import Supabase

/// Aggregated data for a single pool displayed on the Home and Pools tabs.
struct PoolCardData: Identifiable {
    let pool: Pool
    let userRank: Int?
    let totalEntries: Int
    let totalPoints: Int
    let formResults: [FormResult] // last 5 match results (newest first)
    let deadline: Date?
    let unreadBanterCount: Int
    let needsPredictions: Bool
    let memberCount: Int
    let isAdmin: Bool
    let levelNumber: Int
    let levelName: String
    let predictionsCompleted: Int
    let predictionsTotal: Int
    let memberInitials: [String] // first 3 members' two-letter initials
    let hitRate: Double?         // prediction accuracy (0-1), from leaderboard
    let exactCount: Int?         // exact score predictions, from leaderboard
    let totalCompleted: Int?     // total scored predictions, from leaderboard

    var id: String { pool.poolId }

    /// Compute level from points (matches web app thresholds).
    static func getLevel(points: Int) -> (number: Int, name: String) {
        if points >= 5000 { return (10, "Legend") }
        if points >= 4000 { return (9, "Master") }
        if points >= 3000 { return (8, "Expert") }
        if points >= 2500 { return (7, "Strategist") }
        if points >= 2000 { return (6, "Tactician") }
        if points >= 1500 { return (5, "Competitor") }
        if points >= 1000 { return (4, "Contender") }
        if points >= 500 { return (3, "Amateur") }
        if points >= 100 { return (2, "Beginner") }
        return (1, "Rookie")
    }
}

/// Represents a single match result for the form dots display.
enum FormResult {
    case exact      // gold/accent - exact score prediction
    case winnerGd   // green - correct winner + goal difference
    case winner     // blue - correct winner only
    case miss       // red - wrong prediction
    case placeholder // gray - no data yet
}

/// View model for the Home tab.
@MainActor
@Observable
final class HomeViewModel {
    // MARK: - Published State

    var isLoading = false
    var errorMessage: String?
    var pools: [Pool] = []
    var poolCards: [PoolCardData] = []
    var liveMatches: [Match] = []
    var upcomingMatches: [Match] = []

    // Aggregate stats
    var bestStreak: Int = 0
    var bestRank: Int? = nil
    var totalPoints: Int = 0

    // MARK: - Dependencies

    private let poolService = PoolService()
    private let apiService = APIService()
    private let supabase = SupabaseService.shared.client

    // MARK: - Greeting

    var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good Morning"
        case 12..<17: return "Good Afternoon"
        default: return "Good Evening"
        }
    }

    // MARK: - Load All Data

    func loadHomeData(userId: String) async {
        isLoading = true
        errorMessage = nil

        do {
            // 1. Fetch user's pools
            pools = try await poolService.fetchUserPools(userId: userId)

            // Collect unique tournament IDs for match queries
            let tournamentIds = Array(Set(pools.map(\.tournamentId)))

            // 2. Kick off cards, streak, AND matches all concurrently
            let poolsSnapshot = pools
            var cardTasks: [Task<PoolCardData, Never>] = []
            for pool in poolsSnapshot {
                let task = Task {
                    await self.buildPoolCard(pool: pool, userId: userId)
                }
                cardTasks.append(task)
            }

            let streakTask = Task { await self.fetchBestStreak(userId: userId) }
            let matchesTask = Task { await self.fetchMatches(tournamentIds: tournamentIds) }

            // Collect all card results
            var cards: [PoolCardData] = []
            var allBestRanks: [Int] = []
            var aggregateTotalPoints = 0

            for task in cardTasks {
                let cardData = await task.value
                cards.append(cardData)
                if let rank = cardData.userRank {
                    allBestRanks.append(rank)
                }
                aggregateTotalPoints += cardData.totalPoints
            }

            // Sort cards: branded first, then needs predictions, then by deadline
            cards.sort { a, b in
                let aBrand = a.pool.hasBranding ? 0 : 1
                let bBrand = b.pool.hasBranding ? 0 : 1
                if aBrand != bBrand { return aBrand < bBrand }
                if a.needsPredictions != b.needsPredictions {
                    return a.needsPredictions
                }
                switch (a.deadline, b.deadline) {
                case let (aDate?, bDate?): return aDate < bDate
                case (nil, .some): return false
                case (.some, nil): return true
                case (nil, nil): return false
                }
            }

            poolCards = cards
            bestRank = allBestRanks.min()
            totalPoints = aggregateTotalPoints

            // 3. Collect streak and match results (already running concurrently)
            bestStreak = await streakTask.value
            await matchesTask.value

        } catch {
            print("[HomeViewModel] Error loading home data: \(error)")
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Build Individual Pool Card

    func buildPoolCard(pool: Pool, userId: String) async -> PoolCardData {
        var userRank: Int? = nil
        var totalEntries = 0
        var userPoints = 0
        var needsPredictions = false
        var formResults: [FormResult] = []
        var unreadBanter = 0
        var memberCount = 0
        var isAdmin = false
        var levelNumber = 1
        var levelName = "Rookie"
        var predictionsCompleted = 0
        var predictionsTotal = 0
        var bestEntryId: String?
        var hitRate: Double? = nil
        var exactCount: Int? = nil
        var totalCompleted: Int? = nil

        do {
            let leaderboard = try await apiService.fetchLeaderboard(poolId: pool.poolId)
            totalEntries = leaderboard.entries.count

            // Find this user's best entry
            let userEntries = leaderboard.entries.filter { $0.userId == userId }
            if let bestEntry = userEntries.min(by: { ($0.currentRank ?? Int.max) < ($1.currentRank ?? Int.max) }) {
                userRank = bestEntry.currentRank
                userPoints = bestEntry.totalPoints
                needsPredictions = !bestEntry.hasSubmittedPredictions
                bestEntryId = bestEntry.entryId
                hitRate = bestEntry.hitRate
                exactCount = bestEntry.exactCount
                totalCompleted = bestEntry.totalCompleted

                // Use lastFive from API if available (already computed server-side)
                if let lastFive = bestEntry.lastFive {
                    formResults = lastFive.map { parseFormResult($0) }
                }

                // Use level from API if available
                if let apiLevel = bestEntry.level, let apiLevelName = bestEntry.levelName {
                    levelNumber = apiLevel
                    levelName = apiLevelName
                }
            }

            // Fallback: fetch form from player_scores if API didn't provide it
            if formResults.isEmpty, let bestEntry = userEntries.first {
                formResults = await fetchFormResults(entryId: bestEntry.entryId, tournamentId: pool.tournamentId)
            }
        } catch {
            print("[HomeViewModel] Failed to fetch leaderboard for pool \(pool.poolId): \(error)")
        }

        // Fetch prediction progress
        if let entryId = bestEntryId {
            let progress = await fetchPredictionProgress(
                entryId: entryId,
                poolId: pool.poolId,
                predictionMode: pool.predictionMode,
                tournamentId: pool.tournamentId
            )
            predictionsCompleted = progress.completed
            predictionsTotal = progress.total
        }

        // Fetch member info and unread banter concurrently
        let memberInfoTask = Task { await self.fetchMemberInfo(poolId: pool.poolId, userId: userId) }
        let unreadBanterTask = Task { await self.fetchUnreadBanterCount(poolId: pool.poolId, userId: userId) }

        var memberInitials: [String] = []
        (memberCount, isAdmin, memberInitials) = await memberInfoTask.value
        unreadBanter = await unreadBanterTask.value

        // Parse deadline
        let deadline = parseDate(pool.predictionDeadline)

        // Compute level from points if not already set from API
        if levelNumber == 1 && levelName == "Rookie" && userPoints > 0 {
            let level = PoolCardData.getLevel(points: userPoints)
            levelNumber = level.number
            levelName = level.name
        }

        return PoolCardData(
            pool: pool,
            userRank: userRank,
            totalEntries: totalEntries,
            totalPoints: userPoints,
            formResults: formResults,
            deadline: deadline,
            unreadBanterCount: unreadBanter,
            needsPredictions: needsPredictions,
            memberCount: memberCount,
            isAdmin: isAdmin,
            levelNumber: levelNumber,
            levelName: levelName,
            predictionsCompleted: predictionsCompleted,
            predictionsTotal: predictionsTotal,
            memberInitials: memberInitials,
            hitRate: hitRate,
            exactCount: exactCount,
            totalCompleted: totalCompleted
        )
    }

    // MARK: - Parse Form Result String

    private func parseFormResult(_ value: String) -> FormResult {
        switch value {
        case "exact": return .exact
        case "winner_gd": return .winnerGd
        case "winner": return .winner
        case "miss": return .miss
        default: return .miss
        }
    }

    // MARK: - Fetch Form Results (Last 5)

    private func fetchFormResults(entryId: String, tournamentId: String) async -> [FormResult] {
        do {
            struct ScoreRow: Codable {
                let pointsEarned: Int
                let isExactScore: Bool
                let isCorrectDifference: Bool
                let isCorrectResult: Bool

                enum CodingKeys: String, CodingKey {
                    case pointsEarned = "points_earned"
                    case isExactScore = "is_exact_score"
                    case isCorrectDifference = "is_correct_difference"
                    case isCorrectResult = "is_correct_result"
                }
            }

            let scores: [ScoreRow] = try await supabase
                .from("match_scores")
                .select("points_earned, is_exact_score, is_correct_difference, is_correct_result")
                .eq("entry_id", value: entryId)
                .order("calculated_at", ascending: false)
                .limit(5)
                .execute()
                .value

            return scores.map { score in
                if score.isExactScore {
                    return .exact
                } else if score.isCorrectDifference {
                    return .winnerGd
                } else if score.isCorrectResult {
                    return .winner
                } else {
                    return .miss
                }
            }
        } catch {
            print("[HomeViewModel] Failed to fetch form results: \(error)")
            return []
        }
    }

    // MARK: - Fetch Best Streak

    func fetchBestStreak(userId: String) async -> Int {
        do {
            struct MemberRow: Codable {
                let memberId: String
                enum CodingKeys: String, CodingKey { case memberId = "member_id" }
            }
            struct EntryRow: Codable {
                let entryId: String
                enum CodingKeys: String, CodingKey { case entryId = "entry_id" }
            }
            struct ScoreCheck: Codable {
                let entryId: String
                let pointsEarned: Int
                var matchPoints: Int { pointsEarned }
                enum CodingKeys: String, CodingKey {
                    case entryId = "entry_id"
                    case pointsEarned = "points_earned"
                }
            }

            // 1. Single query: get all member IDs for this user
            let memberships: [MemberRow] = try await supabase
                .from("pool_members")
                .select("member_id")
                .eq("user_id", value: userId)
                .execute()
                .value

            guard !memberships.isEmpty else { return 0 }

            // 2. Single query: get all entry IDs for those members
            let entries: [EntryRow] = try await supabase
                .from("pool_entries")
                .select("entry_id")
                .in("member_id", values: memberships.map(\.memberId))
                .execute()
                .value

            guard !entries.isEmpty else { return 0 }

            // 3. Single query: get ALL match_scores for all entries at once
            let allScores: [ScoreCheck] = try await supabase
                .from("match_scores")
                .select("entry_id, points_earned")
                .in("entry_id", values: entries.map(\.entryId))
                .order("calculated_at", ascending: false)
                .execute()
                .value

            // 4. Group by entry and compute streaks client-side
            let grouped = Dictionary(grouping: allScores, by: \.entryId)
            var maxStreak = 0
            for (_, scores) in grouped {
                var streak = 0
                for score in scores {
                    if score.matchPoints > 0 { streak += 1 } else { break }
                }
                maxStreak = max(maxStreak, streak)
            }

            return maxStreak
        } catch {
            print("[HomeViewModel] Failed to fetch streak: \(error)")
            return 0
        }
    }

    // MARK: - Fetch Member Info (count + admin status)

    func fetchMemberInfo(poolId: String, userId: String) async -> (memberCount: Int, isAdmin: Bool, initials: [String]) {
        do {
            struct MemberRow: Codable {
                let userId: String
                let role: String
                let users: MemberUser

                struct MemberUser: Codable {
                    let fullName: String
                    enum CodingKeys: String, CodingKey {
                        case fullName = "full_name"
                    }
                }

                enum CodingKeys: String, CodingKey {
                    case userId = "user_id"
                    case role
                    case users
                }
            }

            let members: [MemberRow] = try await supabase
                .from("pool_members")
                .select("user_id, role, users(full_name)")
                .eq("pool_id", value: poolId)
                .execute()
                .value

            let isAdmin = members.first(where: { $0.userId == userId })?.role == "admin"

            let initials = Array(members.prefix(3).map { member in
                let parts = member.users.fullName.split(separator: " ")
                if parts.count >= 2 {
                    return "\(parts[0].prefix(1))\(parts[1].prefix(1))".uppercased()
                } else if let first = parts.first {
                    return String(first.prefix(2)).uppercased()
                }
                return "??"
            })

            return (members.count, isAdmin, initials)
        } catch {
            print("[HomeViewModel] Failed to fetch member info for pool \(poolId): \(error)")
            return (0, false, [])
        }
    }

    // MARK: - Fetch Prediction Progress

    private func fetchPredictionProgress(
        entryId: String,
        poolId: String,
        predictionMode: PredictionMode,
        tournamentId: String
    ) async -> (completed: Int, total: Int) {
        do {
            switch predictionMode {
            case .fullTournament, .progressive:
                // Count predictions made
                struct PredictionId: Codable {
                    let predictionId: String
                    enum CodingKeys: String, CodingKey { case predictionId = "prediction_id" }
                }
                let predictions: [PredictionId] = try await supabase
                    .from("predictions")
                    .select("prediction_id")
                    .eq("entry_id", value: entryId)
                    .execute()
                    .value

                // Count total matches in tournament
                struct MatchId: Codable {
                    let matchId: String
                    enum CodingKeys: String, CodingKey { case matchId = "match_id" }
                }

                if predictionMode == .progressive {
                    // For progressive, count only matches in open/completed rounds
                    // Fetch rounds to determine which matches are available
                    let roundsResponse = try await apiService.fetchRounds(poolId: poolId)
                    let availableMatches = roundsResponse.rounds
                        .filter { $0.state == "open" || $0.state == "completed" }
                        .reduce(0) { $0 + ($1.matchCount ?? 0) }
                    return (predictions.count, availableMatches)
                } else {
                    // Full tournament: all matches
                    let allMatches: [MatchId] = try await supabase
                        .from("matches")
                        .select("match_id")
                        .eq("tournament_id", value: tournamentId)
                        .execute()
                        .value
                    return (predictions.count, allMatches.count)
                }

            case .bracketPicker:
                // Groups: count groups with all 4 positions filled
                struct GroupRanking: Codable {
                    let groupLetter: String
                    enum CodingKeys: String, CodingKey { case groupLetter = "group_letter" }
                }
                let groupRankings: [GroupRanking] = try await supabase
                    .from("bracket_group_rankings")
                    .select("group_letter")
                    .eq("entry_id", value: entryId)
                    .execute()
                    .value

                let groupCounts = Dictionary(grouping: groupRankings, by: \.groupLetter)
                let completedGroups = groupCounts.filter { $0.value.count == 4 }.count

                // Knockout picks
                struct KnockoutPick: Codable {
                    let id: String
                }
                let knockoutPicks: [KnockoutPick] = try await supabase
                    .from("bracket_knockout_picks")
                    .select("id")
                    .eq("entry_id", value: entryId)
                    .execute()
                    .value

                // Total: 12 groups + 32 knockout matches
                return (completedGroups + knockoutPicks.count, 12 + 32)
            }
        } catch {
            print("[HomeViewModel] Failed to fetch prediction progress: \(error)")
            return (0, 0)
        }
    }

    // MARK: - Fetch Unread Banter Count

    private func fetchUnreadBanterCount(poolId: String, userId: String) async -> Int {
        do {
            struct ReadRow: Codable {
                let lastReadAt: String?
                enum CodingKeys: String, CodingKey {
                    case lastReadAt = "last_read_at"
                }
            }

            // Get user's last_read_at from pool_members
            let readRows: [ReadRow] = try await supabase
                .from("pool_members")
                .select("last_read_at")
                .eq("pool_id", value: poolId)
                .eq("user_id", value: userId)
                .limit(1)
                .execute()
                .value

            let lastReadAt = readRows.first?.lastReadAt

            struct MessageId: Codable {
                let messageId: String
                enum CodingKeys: String, CodingKey {
                    case messageId = "message_id"
                }
            }

            // Count messages after last_read_at from pool_messages
            if let lastReadAt {
                let messages: [MessageId] = try await supabase
                    .from("pool_messages")
                    .select("message_id")
                    .eq("pool_id", value: poolId)
                    .gt("created_at", value: lastReadAt)
                    .neq("user_id", value: userId)
                    .execute()
                    .value

                return messages.count
            } else {
                // Never read -- count all messages
                let messages: [MessageId] = try await supabase
                    .from("pool_messages")
                    .select("message_id")
                    .eq("pool_id", value: poolId)
                    .neq("user_id", value: userId)
                    .execute()
                    .value

                return messages.count
            }
        } catch {
            print("[HomeViewModel] Failed to fetch unread banter count: \(error)")
            return 0
        }
    }

    // MARK: - Fetch Matches

    private func fetchMatches(tournamentIds: [String]) async {
        guard !tournamentIds.isEmpty else { return }

        let matchSelect = """
            match_id, tournament_id, match_number, stage, group_letter,
            home_team_id, away_team_id, home_team_placeholder, away_team_placeholder,
            match_date, venue, status, home_score_ft, away_score_ft,
            home_score_pso, away_score_pso, winner_team_id, is_completed, completed_at,
            home_team:teams!home_team_id(country_name, country_code, flag_url),
            away_team:teams!away_team_id(country_name, country_code, flag_url)
        """

        // Fetch live and upcoming matches concurrently with single queries each
        let liveTask = Task {
            do {
                let matches: [Match] = try await self.supabase
                    .from("matches")
                    .select(matchSelect)
                    .in("tournament_id", values: tournamentIds)
                    .eq("status", value: "live")
                    .execute()
                    .value
                return matches.sorted { $0.matchNumber < $1.matchNumber }
            } catch {
                print("[HomeViewModel] Failed to fetch live matches: \(error)")
                return [Match]()
            }
        }

        let upcomingTask = Task {
            do {
                let matches: [Match] = try await self.supabase
                    .from("matches")
                    .select(matchSelect)
                    .in("tournament_id", values: tournamentIds)
                    .in("status", values: ["scheduled", "upcoming"])
                    .order("match_date")
                    .limit(5)
                    .execute()
                    .value
                return matches
            } catch {
                print("[HomeViewModel] Failed to fetch upcoming matches: \(error)")
                return [Match]()
            }
        }

        liveMatches = await liveTask.value
        upcomingMatches = await upcomingTask.value
    }

    // MARK: - Batch Match Fetch (returns data for AppDataStore)

    func fetchMatchesBatch(tournamentIds: [String]) async -> (live: [Match], upcoming: [Match]) {
        guard !tournamentIds.isEmpty else { return ([], []) }

        let matchSelect = """
            match_id, tournament_id, match_number, stage, group_letter,
            home_team_id, away_team_id, home_team_placeholder, away_team_placeholder,
            match_date, venue, status, home_score_ft, away_score_ft,
            home_score_pso, away_score_pso, winner_team_id, is_completed, completed_at,
            home_team:teams!home_team_id(country_name, country_code, flag_url),
            away_team:teams!away_team_id(country_name, country_code, flag_url)
        """

        let liveTask = Task {
            do {
                let matches: [Match] = try await self.supabase
                    .from("matches")
                    .select(matchSelect)
                    .in("tournament_id", values: tournamentIds)
                    .eq("status", value: "live")
                    .execute()
                    .value
                return matches.sorted { $0.matchNumber < $1.matchNumber }
            } catch {
                print("[HomeViewModel] Failed to fetch live matches: \(error)")
                return [Match]()
            }
        }

        let upcomingTask = Task {
            do {
                let matches: [Match] = try await self.supabase
                    .from("matches")
                    .select(matchSelect)
                    .in("tournament_id", values: tournamentIds)
                    .in("status", values: ["scheduled", "upcoming"])
                    .order("match_date")
                    .limit(5)
                    .execute()
                    .value
                return matches
            } catch {
                print("[HomeViewModel] Failed to fetch upcoming matches: \(error)")
                return [Match]()
            }
        }

        return (await liveTask.value, await upcomingTask.value)
    }

    // MARK: - Next Kickoff

    /// The next upcoming match (soonest by date).
    var nextUpcomingMatch: Match? {
        upcomingMatches.first
    }

    /// Number of matches scheduled for today (used for "X more matches today" label).
    var matchesToday: Int {
        let calendar = Calendar.current
        return upcomingMatches.filter { match in
            guard let date = parseDate(match.matchDate) else { return false }
            return calendar.isDateInToday(date)
        }.count
    }

    // MARK: - Helpers

    private func parseDate(_ dateString: String?) -> Date? {
        guard let dateString else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: dateString) { return date }
        // Try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: dateString)
    }
}
