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

    // MARK: - Admin Endpoints

    func calculateBonusPoints(poolId: String) async throws {
        try await requestVoid("POST", path: "/api/pools/\(poolId)/bonus/calculate")
    }

    func calculateBracketScores(poolId: String) async throws {
        try await requestVoid("POST", path: "/api/pools/\(poolId)/bracket-picks/calculate")
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
