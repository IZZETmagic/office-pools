import Foundation

struct AppUser: Codable, Identifiable {
    let userId: String
    let authUserId: String?
    let username: String
    let fullName: String
    let email: String
    let createdAt: String?

    var id: String { userId }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case authUserId = "auth_user_id"
        case username
        case fullName = "full_name"
        case email
        case createdAt = "created_at"
    }
}

struct UserProfile: Codable {
    let userId: String
    let username: String
    let fullName: String
    let email: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case username
        case fullName = "full_name"
        case email
    }
}
