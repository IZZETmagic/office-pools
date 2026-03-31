import Foundation
import Supabase

/// Calls Next.js API routes for server-side operations not yet migrated to Edge Functions.
/// These endpoints require secrets (Resend), service-role access, or complex orchestration.
@MainActor
final class APIService {
    private let supabase = SupabaseService.shared.client
    private let baseURL: String

    init(baseURL: String = Config.apiBaseURL) {
        self.baseURL = baseURL
    }

    // MARK: - Generic Request Helper

    private func request<T: Decodable>(
        _ method: String,
        path: String,
        body: (any Encodable)? = nil
    ) async throws -> T {
        guard let url = URL(string: "\(baseURL)\(path)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Attach Supabase auth token for authenticated requests
        if let session = try? await supabase.auth.session {
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.serverError(statusCode: httpResponse.statusCode, message: errorBody)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }

    private func requestVoid(
        _ method: String,
        path: String,
        body: (any Encodable)? = nil
    ) async throws {
        guard let url = URL(string: "\(baseURL)\(path)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let session = try? await supabase.auth.session {
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw APIError.serverError(statusCode: statusCode, message: errorBody)
        }
    }

    // MARK: - Notification Endpoints

    func notifyPoolJoined(poolId: String, userId: String) async throws {
        struct Body: Encodable {
            let poolId: String
            let userId: String
            enum CodingKeys: String, CodingKey {
                case poolId = "pool_id"
                case userId = "user_id"
            }
        }
        try await requestVoid("POST", path: "/api/notifications/pool-joined", body: Body(poolId: poolId, userId: userId))
    }

    func notifyMention(poolId: String, mentionedUserIds: [String], messageContent: String, senderName: String) async throws {
        struct Body: Encodable {
            let poolId: String
            let mentionedUserIds: [String]
            let messageContent: String
            let senderName: String
            enum CodingKeys: String, CodingKey {
                case poolId = "pool_id"
                case mentionedUserIds = "mentioned_user_ids"
                case messageContent = "message_content"
                case senderName = "sender_name"
            }
        }
        try await requestVoid("POST", path: "/api/notifications/mention", body: Body(
            poolId: poolId, mentionedUserIds: mentionedUserIds,
            messageContent: messageContent, senderName: senderName
        ))
    }

    // MARK: - Leaderboard

    func fetchLeaderboard(poolId: String) async throws -> LeaderboardResponse {
        try await request("GET", path: "/api/pools/\(poolId)/leaderboard")
    }

    func fetchPointsBreakdown(poolId: String, entryId: String) async throws -> PointsBreakdownResponse {
        try await request("GET", path: "/api/pools/\(poolId)/entries/\(entryId)/breakdown")
    }

    func fetchAnalytics(poolId: String, entryId: String) async throws -> AnalyticsResponse {
        try await request("GET", path: "/api/pools/\(poolId)/entries/\(entryId)/analytics")
    }

    func fetchMatchStats(matchId: String) async throws -> MatchStatsResponse {
        try await request("GET", path: "/api/matches/\(matchId)/stats")
    }

    // MARK: - Admin Endpoints

    func calculateBonusPoints(poolId: String) async throws {
        try await requestVoid("POST", path: "/api/pools/\(poolId)/bonus/calculate")
    }

    func calculateBracketScores(poolId: String) async throws {
        try await requestVoid("POST", path: "/api/pools/\(poolId)/bracket-picks/calculate")
    }

    func recalculatePool(poolId: String) async throws {
        try await requestVoid("POST", path: "/api/pools/\(poolId)/recalculate")
    }

    // MARK: - Predictions

    struct SaveDraftResponse: Decodable {
        let saved: Bool
        let lastSaved: String?
        let progress: DraftProgress?

        struct DraftProgress: Decodable {
            let predicted: Int
        }
    }

    func savePredictionDrafts(
        poolId: String,
        entryId: String,
        predictions: [PredictionDraftPayload]
    ) async throws -> SaveDraftResponse {
        struct Body: Encodable {
            let entryId: String
            let predictions: [PredictionDraftPayload]
        }
        return try await request("POST", path: "/api/pools/\(poolId)/predictions", body: Body(
            entryId: entryId,
            predictions: predictions
        ))
    }

    struct SubmitResponse: Decodable {
        let submitted: Bool
        let submittedAt: String?
    }

    func submitPredictions(poolId: String, entryId: String) async throws {
        struct Body: Encodable {
            let entryId: String
        }
        let _: SubmitResponse = try await request("PUT", path: "/api/pools/\(poolId)/predictions", body: Body(entryId: entryId))
    }

    // MARK: - Progressive Round Predictions

    struct RoundSubmitResponse: Decodable {
        let submitted: Bool
        let roundKey: String
        let submittedAt: String?
        let predictedCount: Int?
    }

    /// Submit predictions for a specific round (progressive mode)
    func submitRoundPredictions(poolId: String, entryId: String, roundKey: String) async throws -> RoundSubmitResponse {
        struct Body: Encodable {
            let entryId: String
            let roundKey: String
        }
        return try await request("PUT", path: "/api/pools/\(poolId)/predictions/round", body: Body(
            entryId: entryId,
            roundKey: roundKey
        ))
    }

    struct RoundsResponse: Decodable {
        let mode: String
        let rounds: [RoundData]

        struct RoundData: Decodable {
            let id: String
            let poolId: String
            let roundKey: String
            let state: String
            let deadline: String?
            let openedAt: String?
            let openedBy: String?
            let closedAt: String?
            let completedAt: String?
            let matchCount: Int?
            let completedMatchCount: Int?
            let entrySubmission: EntrySubmissionData?
            let adminStats: AdminStatsData?

            enum CodingKeys: String, CodingKey {
                case id
                case poolId = "pool_id"
                case roundKey = "round_key"
                case state, deadline
                case openedAt = "opened_at"
                case openedBy = "opened_by"
                case closedAt = "closed_at"
                case completedAt = "completed_at"
                case matchCount = "match_count"
                case completedMatchCount = "completed_match_count"
                case entrySubmission = "entry_submission"
                case adminStats = "admin_stats"
            }

            struct EntrySubmissionData: Decodable {
                let hasSubmitted: Bool
                let submittedAt: String?
                let autoSubmitted: Bool
                let predictionCount: Int

                enum CodingKeys: String, CodingKey {
                    case hasSubmitted = "has_submitted"
                    case submittedAt = "submitted_at"
                    case autoSubmitted = "auto_submitted"
                    case predictionCount = "prediction_count"
                }
            }

            struct AdminStatsData: Decodable {
                let totalEntries: Int
                let submittedEntries: Int

                enum CodingKeys: String, CodingKey {
                    case totalEntries = "total_entries"
                    case submittedEntries = "submitted_entries"
                }
            }
        }
    }

    /// Fetch rounds with state, match counts, and entry submission status
    func fetchRounds(poolId: String, entryId: String? = nil) async throws -> RoundsResponse {
        var path = "/api/pools/\(poolId)/rounds"
        if let entryId {
            path += "?entryId=\(entryId)"
        }
        return try await request("GET", path: path)
    }

    struct RoundStateChangeResponse: Decodable {
        let success: Bool
        let roundKey: String
        let newState: String

        enum CodingKeys: String, CodingKey {
            case success
            case roundKey = "round_key"
            case newState = "new_state"
        }
    }

    /// Admin: change round state (open, close, complete, extend_deadline)
    func changeRoundState(poolId: String, roundKey: String, action: String, deadline: String? = nil) async throws -> RoundStateChangeResponse {
        struct Body: Encodable {
            let action: String
            let deadline: String?
        }
        return try await request("POST", path: "/api/pools/\(poolId)/rounds/\(roundKey)/state", body: Body(
            action: action,
            deadline: deadline
        ))
    }

    // MARK: - Contact

    func sendContactForm(name: String, email: String, message: String) async throws {
        struct Body: Encodable {
            let name: String
            let email: String
            let message: String
        }
        try await requestVoid("POST", path: "/api/contact", body: Body(name: name, email: email, message: message))
    }
}

// MARK: - Errors

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case serverError(statusCode: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL."
        case .invalidResponse: return "Invalid response from server."
        case .serverError(let code, let message): return "Server error (\(code)): \(message)"
        }
    }
}
