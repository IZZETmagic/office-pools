import Foundation

struct Member: Codable, Identifiable {
    let memberId: String
    let poolId: String
    let userId: String
    let role: String
    let joinedAt: String
    let entryFeePaid: Bool
    let users: UserProfile
    let entries: [Entry]?

    var id: String { memberId }

    var isAdmin: Bool { role == "admin" }

    enum CodingKeys: String, CodingKey {
        case memberId = "member_id"
        case poolId = "pool_id"
        case userId = "user_id"
        case role
        case joinedAt = "joined_at"
        case entryFeePaid = "entry_fee_paid"
        case users
        case entries
    }
}

struct LeaderboardEntry: Identifiable {
    let entry: Entry
    let user: UserProfile
    let role: String

    var id: String { entry.entryId }
}
