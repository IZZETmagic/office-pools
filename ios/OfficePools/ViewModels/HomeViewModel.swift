import Foundation
import Supabase

/// Aggregated data for a single pool displayed on the Home tab.
struct PoolCardData: Identifiable {
    let pool: Pool
    let userRank: Int?
    let totalEntries: Int
    let totalPoints: Int
    let formResults: [FormResult] // last 5 match results (newest first)
    let deadline: Date?
    let unreadBanterCount: Int
    let needsPredictions: Bool

    var id: String { pool.poolId }
}

/// Represents a single match result for the form dots display.
enum FormResult {
    case correct   // green - exact or close prediction
    case partial   // yellow - got outcome right
    case incorrect // red - wrong
    case missed    // gray - no prediction submitted

    var color: String {
        switch self {
        case .correct: return "green"
        case .partial: return "yellow"
        case .incorrect: return "red"
        case .missed: return "gray"
        }
    }
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

            // 2. Fetch leaderboard data for each pool + build pool cards
            var cards: [PoolCardData] = []
            var allBestRanks: [Int] = []
            var aggregateTotalPoints = 0
            var aggregateBestStreak = 0

            // Collect unique tournament IDs for match queries
            let tournamentIds = Set(pools.map(\.tournamentId))

            for pool in pools {
                let cardData = await buildPoolCard(pool: pool, userId: userId)
                cards.append(cardData)

                // Aggregate stats
                if let rank = cardData.userRank {
                    allBestRanks.append(rank)
                }
                aggregateTotalPoints += cardData.totalPoints
            }

            // Sort cards: needs predictions first, then by deadline
            cards.sort { a, b in
                if a.needsPredictions != b.needsPredictions {
                    return a.needsPredictions
                }
                // Both need or both don't need predictions — sort by deadline (soonest first)
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

            // 3. Fetch streak from player_scores for the user's entries
            bestStreak = await fetchBestStreak(userId: userId)

            // 4. Fetch live and upcoming matches
            await fetchMatches(tournamentIds: tournamentIds)

        } catch {
            print("[HomeViewModel] Error loading home data: \(error)")
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Build Individual Pool Card

    private func buildPoolCard(pool: Pool, userId: String) async -> PoolCardData {
        var userRank: Int? = nil
        var totalEntries = 0
        var userPoints = 0
        var needsPredictions = false
        var formResults: [FormResult] = []
        var unreadBanter = 0

        do {
            let leaderboard = try await apiService.fetchLeaderboard(poolId: pool.poolId)
            totalEntries = leaderboard.entries.count

            // Find this user's best entry
            let userEntries = leaderboard.entries.filter { $0.userId == userId }
            if let bestEntry = userEntries.min(by: { ($0.currentRank ?? Int.max) < ($1.currentRank ?? Int.max) }) {
                userRank = bestEntry.currentRank
                userPoints = bestEntry.totalPoints
                needsPredictions = !bestEntry.hasSubmittedPredictions
            }

            // Fetch form results (last 5 match scores for the user's entry)
            if let bestEntry = userEntries.first {
                formResults = await fetchFormResults(entryId: bestEntry.entryId, tournamentId: pool.tournamentId)
            }
        } catch {
            print("[HomeViewModel] Failed to fetch leaderboard for pool \(pool.poolId): \(error)")
        }

        // Fetch unread banter count
        unreadBanter = await fetchUnreadBanterCount(poolId: pool.poolId, userId: userId)

        // Parse deadline
        let deadline = parseDate(pool.predictionDeadline)

        return PoolCardData(
            pool: pool,
            userRank: userRank,
            totalEntries: totalEntries,
            totalPoints: userPoints,
            formResults: formResults,
            deadline: deadline,
            unreadBanterCount: unreadBanter,
            needsPredictions: needsPredictions
        )
    }

    // MARK: - Fetch Form Results (Last 5)

    private func fetchFormResults(entryId: String, tournamentId: String) async -> [FormResult] {
        do {
            struct ScoreRow: Codable {
                let matchPoints: Int
                let totalPoints: Int
                let matchId: String

                enum CodingKeys: String, CodingKey {
                    case matchPoints = "match_points"
                    case totalPoints = "total_points"
                    case matchId = "match_id"
                }
            }

            let scores: [ScoreRow] = try await supabase
                .from("player_scores")
                .select("match_points, total_points, match_id")
                .eq("entry_id", value: entryId)
                .order("created_at", ascending: false)
                .limit(5)
                .execute()
                .value

            return scores.map { score in
                if score.matchPoints >= 8 {
                    return .correct
                } else if score.matchPoints >= 3 {
                    return .partial
                } else if score.matchPoints > 0 {
                    return .partial
                } else {
                    return .incorrect
                }
            }
        } catch {
            print("[HomeViewModel] Failed to fetch form results: \(error)")
            return []
        }
    }

    // MARK: - Fetch Best Streak

    private func fetchBestStreak(userId: String) async -> Int {
        do {
            // Get all entry IDs for this user
            struct EntryRow: Codable {
                let entryId: String
                enum CodingKeys: String, CodingKey {
                    case entryId = "entry_id"
                }
            }

            let memberEntries: [EntryRow] = try await supabase
                .from("pool_entries")
                .select("entry_id")
                .eq("member_id", value: userId)
                .execute()
                .value

            // For simplicity, we look at the user's pool_members to get entries
            // Then check player_scores for consecutive non-zero scores
            struct MemberRow: Codable {
                let memberId: String
                enum CodingKeys: String, CodingKey {
                    case memberId = "member_id"
                }
            }

            let memberships: [MemberRow] = try await supabase
                .from("pool_members")
                .select("member_id")
                .eq("user_id", value: userId)
                .execute()
                .value

            let memberIds = memberships.map(\.memberId)
            guard !memberIds.isEmpty else { return 0 }

            // Get entries for these members
            var allEntryIds: [String] = []
            for memberId in memberIds {
                let entries: [EntryRow] = try await supabase
                    .from("pool_entries")
                    .select("entry_id")
                    .eq("member_id", value: memberId)
                    .execute()
                    .value
                allEntryIds.append(contentsOf: entries.map(\.entryId))
            }

            guard !allEntryIds.isEmpty else { return 0 }

            // Get player scores ordered by match, check consecutive non-misses
            var maxStreak = 0
            for entryId in allEntryIds {
                struct ScoreCheck: Codable {
                    let matchPoints: Int
                    enum CodingKeys: String, CodingKey {
                        case matchPoints = "match_points"
                    }
                }

                let scores: [ScoreCheck] = try await supabase
                    .from("player_scores")
                    .select("match_points")
                    .eq("entry_id", value: entryId)
                    .order("created_at", ascending: false)
                    .execute()
                    .value

                // Count consecutive non-zero from the most recent
                var streak = 0
                for score in scores {
                    if score.matchPoints > 0 {
                        streak += 1
                    } else {
                        break
                    }
                }
                maxStreak = max(maxStreak, streak)
            }

            return maxStreak
        } catch {
            print("[HomeViewModel] Failed to fetch streak: \(error)")
            return 0
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

            // Get user's last read timestamp for this pool
            let readRows: [ReadRow] = try await supabase
                .from("banter_read_status")
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

            // Count messages after last_read_at (fetch IDs only for a lightweight query)
            if let lastReadAt {
                let messages: [MessageId] = try await supabase
                    .from("banter_messages")
                    .select("message_id")
                    .eq("pool_id", value: poolId)
                    .gt("created_at", value: lastReadAt)
                    .execute()
                    .value

                return messages.count
            } else {
                // Never read -- count all messages
                let messages: [MessageId] = try await supabase
                    .from("banter_messages")
                    .select("message_id")
                    .eq("pool_id", value: poolId)
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

    private func fetchMatches(tournamentIds: Set<String>) async {
        guard !tournamentIds.isEmpty else { return }

        let matchSelect = """
            match_id, tournament_id, match_number, stage, group_letter,
            home_team_id, away_team_id, home_team_placeholder, away_team_placeholder,
            match_date, venue, status, home_score_ft, away_score_ft,
            home_score_pso, away_score_pso, winner_team_id, is_completed, completed_at,
            home_team:teams!home_team_id(country_name, country_code, flag_url),
            away_team:teams!away_team_id(country_name, country_code, flag_url)
        """

        // Fetch live matches
        do {
            var allLive: [Match] = []
            for tournamentId in tournamentIds {
                let matches: [Match] = try await supabase
                    .from("matches")
                    .select(matchSelect)
                    .eq("tournament_id", value: tournamentId)
                    .eq("status", value: "live")
                    .execute()
                    .value
                allLive.append(contentsOf: matches)
            }
            liveMatches = allLive.sorted { $0.matchNumber < $1.matchNumber }
        } catch {
            print("[HomeViewModel] Failed to fetch live matches: \(error)")
        }

        // Fetch upcoming matches
        do {
            var allUpcoming: [Match] = []
            for tournamentId in tournamentIds {
                let matches: [Match] = try await supabase
                    .from("matches")
                    .select(matchSelect)
                    .eq("tournament_id", value: tournamentId)
                    .in("status", values: ["scheduled", "upcoming"])
                    .order("match_date")
                    .limit(10)
                    .execute()
                    .value
                allUpcoming.append(contentsOf: matches)
            }
            // Sort by date and take first 5
            upcomingMatches = Array(
                allUpcoming
                    .sorted { $0.matchDate < $1.matchDate }
                    .prefix(5)
            )
        } catch {
            print("[HomeViewModel] Failed to fetch upcoming matches: \(error)")
        }
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
