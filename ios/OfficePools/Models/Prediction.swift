import Foundation

struct Prediction: Codable, Identifiable {
    let predictionId: String
    let entryId: String
    let matchId: String
    let predictedHomeScore: Int
    let predictedAwayScore: Int
    let predictedHomePso: Int?
    let predictedAwayPso: Int?
    let predictedWinnerTeamId: String?

    var id: String { predictionId }

    var isKnockoutDraw: Bool {
        predictedHomeScore == predictedAwayScore
    }

    enum CodingKeys: String, CodingKey {
        case predictionId = "prediction_id"
        case entryId = "entry_id"
        case matchId = "match_id"
        case predictedHomeScore = "predicted_home_score"
        case predictedAwayScore = "predicted_away_score"
        case predictedHomePso = "predicted_home_pso"
        case predictedAwayPso = "predicted_away_pso"
        case predictedWinnerTeamId = "predicted_winner_team_id"
    }
}

struct PredictionInput {
    var matchId: String
    var homeScore: Int?
    var awayScore: Int?
    var homePso: Int?
    var awayPso: Int?
    var winnerTeamId: String?
}

/// Payload sent to the API for saving prediction drafts.
struct PredictionDraftPayload: Encodable {
    let matchId: String
    let homeScore: Int
    let awayScore: Int
    let homePso: Int?
    let awayPso: Int?
    let winnerTeamId: String?
}
