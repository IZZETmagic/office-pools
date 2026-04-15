import Foundation

struct Entry: Codable, Identifiable, Hashable {
    let entryId: String
    let memberId: String
    let entryName: String
    let entryNumber: Int
    let hasSubmittedPredictions: Bool
    let predictionsSubmittedAt: String?
    let predictionsLocked: Bool
    let autoSubmitted: Bool
    let predictionsLastSavedAt: String?
    let totalPoints: Int
    let pointAdjustment: Int
    let adjustmentReason: String?
    let currentRank: Int?
    let previousRank: Int?
    let lastRankUpdate: String?
    let createdAt: String
    let feePaid: Bool
    let feePaidAt: String?

    var id: String { entryId }

    var rankDelta: Int? {
        guard let current = currentRank, let previous = previousRank else { return nil }
        return previous - current // positive = moved up
    }

    enum CodingKeys: String, CodingKey {
        case entryId = "entry_id"
        case memberId = "member_id"
        case entryName = "entry_name"
        case entryNumber = "entry_number"
        case hasSubmittedPredictions = "has_submitted_predictions"
        case predictionsSubmittedAt = "predictions_submitted_at"
        case predictionsLocked = "predictions_locked"
        case autoSubmitted = "auto_submitted"
        case predictionsLastSavedAt = "predictions_last_saved_at"
        case totalPoints = "total_points"
        case pointAdjustment = "point_adjustment"
        case adjustmentReason = "adjustment_reason"
        case currentRank = "current_rank"
        case previousRank = "previous_rank"
        case lastRankUpdate = "last_rank_update"
        case createdAt = "created_at"
        case feePaid = "fee_paid"
        case feePaidAt = "fee_paid_at"
    }
}
