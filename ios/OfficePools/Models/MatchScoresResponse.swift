import Foundation

/// Response from GET /api/matches/:matchId/scores?entry_ids=...
/// Lightweight batch endpoint for match-specific score data across multiple entries.
struct MatchScoresResponse: Codable {
    let matchId: String
    let matchNumber: Int
    let entries: [MatchScoreEntry]

    enum CodingKeys: String, CodingKey {
        case matchId = "match_id"
        case matchNumber = "match_number"
        case entries
    }
}

struct MatchScoreEntry: Codable {
    let entryId: String
    let predictedHomeTeam: String?
    let predictedAwayTeam: String?
    let teamsMatch: Bool
    let resultType: String
    let totalPoints: Int

    enum CodingKeys: String, CodingKey {
        case entryId = "entry_id"
        case predictedHomeTeam = "predicted_home_team"
        case predictedAwayTeam = "predicted_away_team"
        case teamsMatch = "teams_match"
        case resultType = "result_type"
        case totalPoints = "total_points"
    }
}
