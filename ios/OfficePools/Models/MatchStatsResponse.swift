import Foundation

struct MatchStatsResponse: Codable {
    let matchId: String
    let matchNumber: Int
    let totalPredictions: Int
    let homeWinPct: Double
    let drawPct: Double
    let awayWinPct: Double
    let mostPopularScore: PopularScore?
    let topScores: [PopularScore]
    let exactCorrectPct: Double?
    let resultCorrectPct: Double?
    let homeTeam: String?
    let awayTeam: String?

    enum CodingKeys: String, CodingKey {
        case matchId = "match_id"
        case matchNumber = "match_number"
        case totalPredictions = "total_predictions"
        case homeWinPct = "home_win_pct"
        case drawPct = "draw_pct"
        case awayWinPct = "away_win_pct"
        case mostPopularScore = "most_popular_score"
        case topScores = "top_scores"
        case exactCorrectPct = "exact_correct_pct"
        case resultCorrectPct = "result_correct_pct"
        case homeTeam = "home_team"
        case awayTeam = "away_team"
    }
}

struct PopularScore: Codable, Identifiable {
    let home: Int
    let away: Int
    let count: Int
    let pct: Double

    var id: String { "\(home)-\(away)" }
}
