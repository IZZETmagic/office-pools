import Foundation

/// Matches the `player_scores` table — stores computed match + bonus points per entry.
struct PlayerScore: Codable, Identifiable {
    let entryId: String
    let matchPoints: Int
    let bonusPoints: Int
    let totalPoints: Int

    var id: String { entryId }

    enum CodingKeys: String, CodingKey {
        case entryId = "entry_id"
        case matchPoints = "match_points"
        case bonusPoints = "bonus_points"
        case totalPoints = "total_points"
    }
}
