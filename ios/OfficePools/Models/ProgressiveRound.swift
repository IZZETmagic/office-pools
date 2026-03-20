import Foundation

enum RoundKey: String, Codable, CaseIterable {
    case group
    case round32 = "round_32"
    case round16 = "round_16"
    case quarterFinal = "quarter_final"
    case semiFinal = "semi_final"
    case thirdPlace = "third_place"
    case final_ = "final"

    var displayName: String {
        switch self {
        case .group: return "Group Stage"
        case .round32: return "Round of 32"
        case .round16: return "Round of 16"
        case .quarterFinal: return "Quarter Finals"
        case .semiFinal: return "Semi Finals"
        case .thirdPlace: return "Third Place"
        case .final_: return "Final"
        }
    }
}

enum RoundStateValue: String, Codable {
    case locked
    case open
    case inProgress = "in_progress"
    case completed
}

struct PoolRoundState: Codable, Identifiable {
    let id: String
    let poolId: String
    let roundKey: RoundKey
    let state: RoundStateValue
    let deadline: String?
    let openedAt: String?
    let closedAt: String?
    let completedAt: String?
    let openedBy: String?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case poolId = "pool_id"
        case roundKey = "round_key"
        case state
        case deadline
        case openedAt = "opened_at"
        case closedAt = "closed_at"
        case completedAt = "completed_at"
        case openedBy = "opened_by"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct EntryRoundSubmission: Codable, Identifiable {
    let id: String
    let entryId: String
    let roundKey: RoundKey
    let hasSubmitted: Bool
    let submittedAt: String?
    let autoSubmitted: Bool
    let predictionCount: Int

    enum CodingKeys: String, CodingKey {
        case id
        case entryId = "entry_id"
        case roundKey = "round_key"
        case hasSubmitted = "has_submitted"
        case submittedAt = "submitted_at"
        case autoSubmitted = "auto_submitted"
        case predictionCount = "prediction_count"
    }
}
