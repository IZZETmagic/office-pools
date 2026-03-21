import Foundation

struct TeamInfo: Codable, Hashable {
    let countryName: String
    let countryCode: String
    let flagUrl: String?

    enum CodingKeys: String, CodingKey {
        case countryName = "country_name"
        case countryCode = "country_code"
        case flagUrl = "flag_url"
    }
}

struct Match: Codable, Identifiable, Hashable {
    func hash(into hasher: inout Hasher) { hasher.combine(matchId) }
    static func == (lhs: Match, rhs: Match) -> Bool { lhs.matchId == rhs.matchId }

    let matchId: String
    let tournamentId: String
    let matchNumber: Int
    let stage: String
    let groupLetter: String?
    let homeTeamId: String?
    let awayTeamId: String?
    let homeTeamPlaceholder: String?
    let awayTeamPlaceholder: String?
    let matchDate: String
    let venue: String?
    let status: String
    let homeScoreFt: Int?
    let awayScoreFt: Int?
    let homeScorePso: Int?
    let awayScorePso: Int?
    let winnerTeamId: String?
    let isCompleted: Bool
    let completedAt: String?
    let homeTeam: TeamInfo?
    let awayTeam: TeamInfo?

    var id: String { matchId }

    var homeDisplayName: String {
        homeTeam?.countryName ?? homeTeamPlaceholder ?? "TBD"
    }

    var awayDisplayName: String {
        awayTeam?.countryName ?? awayTeamPlaceholder ?? "TBD"
    }

    var scoreDisplay: String? {
        guard let home = homeScoreFt, let away = awayScoreFt else { return nil }
        var display = "\(home) - \(away)"
        if let homePso = homeScorePso, let awayPso = awayScorePso {
            display += " (\(homePso)-\(awayPso) PSO)"
        }
        return display
    }

    enum CodingKeys: String, CodingKey {
        case matchId = "match_id"
        case tournamentId = "tournament_id"
        case matchNumber = "match_number"
        case stage
        case groupLetter = "group_letter"
        case homeTeamId = "home_team_id"
        case awayTeamId = "away_team_id"
        case homeTeamPlaceholder = "home_team_placeholder"
        case awayTeamPlaceholder = "away_team_placeholder"
        case matchDate = "match_date"
        case venue
        case status
        case homeScoreFt = "home_score_ft"
        case awayScoreFt = "away_score_ft"
        case homeScorePso = "home_score_pso"
        case awayScorePso = "away_score_pso"
        case winnerTeamId = "winner_team_id"
        case isCompleted = "is_completed"
        case completedAt = "completed_at"
        case homeTeam = "home_team"
        case awayTeam = "away_team"
    }
}

struct Team: Codable, Identifiable {
    let teamId: String
    let countryName: String
    let countryCode: String
    let groupLetter: String
    let fifaRankingPoints: Double
    let flagUrl: String?

    var id: String { teamId }

    enum CodingKeys: String, CodingKey {
        case teamId = "team_id"
        case countryName = "country_name"
        case countryCode = "country_code"
        case groupLetter = "group_letter"
        case fifaRankingPoints = "fifa_ranking_points"
        case flagUrl = "flag_url"
    }
}
