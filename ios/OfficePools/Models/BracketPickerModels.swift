import Foundation

// MARK: - Bracket Picker Group Ranking

/// A user's predicted position for a team within a group.
/// In bracket picker mode, users rank teams 1-4 instead of predicting scores.
struct BPGroupRanking: Codable, Identifiable {
    let id: String
    let entryId: String
    let teamId: String
    let groupLetter: String
    let predictedPosition: Int

    enum CodingKeys: String, CodingKey {
        case id
        case entryId = "entry_id"
        case teamId = "team_id"
        case groupLetter = "group_letter"
        case predictedPosition = "predicted_position"
    }
}

// MARK: - Bracket Picker Third Place Ranking

/// A user's ranking of one of the 12 third-place teams.
/// Top 8 qualify for the Round of 32; bottom 4 are eliminated.
struct BPThirdPlaceRanking: Codable, Identifiable {
    let id: String
    let entryId: String
    let teamId: String
    let groupLetter: String
    let rank: Int

    enum CodingKeys: String, CodingKey {
        case id
        case entryId = "entry_id"
        case teamId = "team_id"
        case groupLetter = "group_letter"
        case rank
    }
}

// MARK: - Bracket Picker Knockout Pick

/// A user's pick for the winner of a knockout match, plus a penalty prediction.
struct BPKnockoutPick: Codable, Identifiable {
    let id: String
    let entryId: String
    let matchId: String
    let matchNumber: Int
    let winnerTeamId: String
    let predictedPenalty: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case entryId = "entry_id"
        case matchId = "match_id"
        case matchNumber = "match_number"
        case winnerTeamId = "winner_team_id"
        case predictedPenalty = "predicted_penalty"
    }
}

// MARK: - Bracket Picker Save Payload

/// Payload sent to POST /api/pools/{pool_id}/bracket-picks for auto-saving.
struct BracketPicksSavePayload: Encodable {
    let entryId: String
    let groupRankings: [GroupRankingPayload]
    let thirdPlaceRankings: [ThirdPlaceRankingPayload]
    let knockoutPicks: [KnockoutPickPayload]

    enum CodingKeys: String, CodingKey {
        case entryId = "entry_id"
        case groupRankings = "group_rankings"
        case thirdPlaceRankings = "third_place_rankings"
        case knockoutPicks = "knockout_picks"
    }

    struct GroupRankingPayload: Encodable {
        let entryId: String
        let teamId: String
        let groupLetter: String
        let predictedPosition: Int

        enum CodingKeys: String, CodingKey {
            case entryId = "entry_id"
            case teamId = "team_id"
            case groupLetter = "group_letter"
            case predictedPosition = "predicted_position"
        }
    }

    struct ThirdPlaceRankingPayload: Encodable {
        let entryId: String
        let teamId: String
        let groupLetter: String
        let rank: Int

        enum CodingKeys: String, CodingKey {
            case entryId = "entry_id"
            case teamId = "team_id"
            case groupLetter = "group_letter"
            case rank
        }
    }

    struct KnockoutPickPayload: Encodable {
        let entryId: String
        let matchId: String
        let matchNumber: Int
        let winnerTeamId: String
        let predictedPenalty: Bool

        enum CodingKeys: String, CodingKey {
            case entryId = "entry_id"
            case matchId = "match_id"
            case matchNumber = "match_number"
            case winnerTeamId = "winner_team_id"
            case predictedPenalty = "predicted_penalty"
        }
    }
}

// MARK: - Bracket Picks Response

/// Response from GET /api/pools/{pool_id}/bracket-picks
/// Note: top-level keys are camelCase (from the Next.js API),
/// while nested object fields are snake_case (from Supabase).
struct BracketPicksResponse: Decodable {
    let groupRankings: [BPGroupRanking]
    let thirdPlaceRankings: [BPThirdPlaceRanking]
    let knockoutPicks: [BPKnockoutPick]
}

// MARK: - Bracket Picker Wizard Step

enum BPWizardStep: Int, CaseIterable {
    case groupRankings = 0
    case thirdPlace = 1
    case roundOf32 = 2
    case roundOf16 = 3
    case quarterFinals = 4
    case semiFinals = 5
    case thirdFinal = 6
    case review = 7

    var label: String {
        switch self {
        case .groupRankings: return "Rank Groups"
        case .thirdPlace: return "Third Place"
        case .roundOf32: return "Round of 32"
        case .roundOf16: return "Round of 16"
        case .quarterFinals: return "Quarter Finals"
        case .semiFinals: return "Semi Finals"
        case .thirdFinal: return "3rd Place & Final"
        case .review: return "Review & Submit"
        }
    }

    /// The knockout stage keys that correspond to this step.
    var knockoutStageKeys: [String] {
        switch self {
        case .roundOf32: return ["round_32"]
        case .roundOf16: return ["round_16"]
        case .quarterFinals: return ["quarter_final"]
        case .semiFinals: return ["semi_final"]
        case .thirdFinal: return ["third_place", "final"]
        default: return []
        }
    }
}
