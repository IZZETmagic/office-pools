import Foundation

struct Tournament: Codable, Identifiable {
    let tournamentId: String
    let name: String
    let shortName: String
    let tournamentType: String
    let year: Int
    let hostCountries: String?
    let startDate: String
    let endDate: String
    let status: String
    let description: String?

    var id: String { tournamentId }

    /// Parse startDate string into a Date.
    var parsedStartDate: Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return formatter.date(from: String(startDate.prefix(10)))
    }

    /// Parse endDate string into a Date.
    var parsedEndDate: Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return formatter.date(from: String(endDate.prefix(10)))
    }

    /// Formatted date range for display, e.g. "Jun 11 – Jul 19"
    var dateRangeDisplay: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        guard let start = parsedStartDate, let end = parsedEndDate else {
            return "\(startDate) – \(endDate)"
        }
        return "\(formatter.string(from: start)) – \(formatter.string(from: end))"
    }

    enum CodingKeys: String, CodingKey {
        case tournamentId = "tournament_id"
        case name
        case shortName = "short_name"
        case tournamentType = "tournament_type"
        case year
        case hostCountries = "host_countries"
        case startDate = "start_date"
        case endDate = "end_date"
        case status
        case description
    }
}
