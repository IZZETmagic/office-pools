import Foundation

enum PredictionMode: String, Codable, CaseIterable {
    case fullTournament = "full_tournament"
    case progressive = "progressive"
    case bracketPicker = "bracket_picker"
}

enum PoolStatus: String, Codable {
    case active
    case archived
    case draft
}

struct Pool: Codable, Identifiable, Hashable {
    let poolId: String
    let poolName: String
    let poolCode: String
    let description: String?
    let status: String
    let isPrivate: Bool
    let maxParticipants: Int?
    let maxEntriesPerUser: Int
    let tournamentId: String
    let predictionDeadline: String?
    let predictionMode: PredictionMode
    let createdAt: String
    let updatedAt: String

    var id: String { poolId }

    enum CodingKeys: String, CodingKey {
        case poolId = "pool_id"
        case poolName = "pool_name"
        case poolCode = "pool_code"
        case description
        case status
        case isPrivate = "is_private"
        case maxParticipants = "max_participants"
        case maxEntriesPerUser = "max_entries_per_user"
        case tournamentId = "tournament_id"
        case predictionDeadline = "prediction_deadline"
        case predictionMode = "prediction_mode"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
