import Foundation

struct PointAdjustment: Codable, Identifiable {
    let id: String
    let entryId: String
    let poolId: String
    let amount: Int
    let reason: String
    let createdBy: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case entryId = "entry_id"
        case poolId = "pool_id"
        case amount
        case reason
        case createdBy = "created_by"
        case createdAt = "created_at"
    }
}
