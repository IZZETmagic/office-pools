import Foundation
import Supabase

/// Handles prediction CRUD operations via direct Supabase queries.
@MainActor
final class PredictionService {
    private let supabase = SupabaseService.shared.client

    // MARK: - Fetch Predictions for Entry

    func fetchPredictions(entryId: String) async throws -> [Prediction] {
        let predictions: [Prediction] = try await supabase
            .from("predictions")
            .select()
            .eq("entry_id", value: entryId)
            .execute()
            .value

        return predictions
    }

    // MARK: - Save Draft Predictions (upsert)

    func saveDraft(entryId: String, predictions: [PredictionInput]) async throws {
        struct PredictionUpsert: Codable {
            let entryId: String
            let matchId: String
            let predictedHomeScore: Int
            let predictedAwayScore: Int
            let predictedHomePso: Int?
            let predictedAwayPso: Int?
            let predictedWinnerTeamId: String?

            enum CodingKeys: String, CodingKey {
                case entryId = "entry_id"
                case matchId = "match_id"
                case predictedHomeScore = "predicted_home_score"
                case predictedAwayScore = "predicted_away_score"
                case predictedHomePso = "predicted_home_pso"
                case predictedAwayPso = "predicted_away_pso"
                case predictedWinnerTeamId = "predicted_winner_team_id"
            }
        }

        let rows = predictions.compactMap { input -> PredictionUpsert? in
            guard let home = input.homeScore, let away = input.awayScore else { return nil }
            return PredictionUpsert(
                entryId: entryId,
                matchId: input.matchId,
                predictedHomeScore: home,
                predictedAwayScore: away,
                predictedHomePso: input.homePso,
                predictedAwayPso: input.awayPso,
                predictedWinnerTeamId: input.winnerTeamId
            )
        }

        try await supabase
            .from("predictions")
            .upsert(rows, onConflict: "entry_id,match_id")
            .execute()

        // Update last saved timestamp on entry
        struct EntryUpdate: Codable {
            let predictionsLastSavedAt: String
            enum CodingKeys: String, CodingKey {
                case predictionsLastSavedAt = "predictions_last_saved_at"
            }
        }

        try await supabase
            .from("pool_entries")
            .update(EntryUpdate(predictionsLastSavedAt: ISO8601DateFormatter().string(from: Date())))
            .eq("entry_id", value: entryId)
            .execute()
    }

    // MARK: - Submit Predictions

    func submitPredictions(entryId: String) async throws {
        struct EntrySubmit: Codable {
            let hasSubmittedPredictions: Bool
            let predictionsSubmittedAt: String
            enum CodingKeys: String, CodingKey {
                case hasSubmittedPredictions = "has_submitted_predictions"
                case predictionsSubmittedAt = "predictions_submitted_at"
            }
        }

        try await supabase
            .from("pool_entries")
            .update(EntrySubmit(
                hasSubmittedPredictions: true,
                predictionsSubmittedAt: ISO8601DateFormatter().string(from: Date())
            ))
            .eq("entry_id", value: entryId)
            .execute()
    }

    // MARK: - Manage Entries

    func createEntry(memberId: String, entryName: String, entryNumber: Int) async throws -> Entry {
        struct NewEntry: Codable {
            let memberId: String
            let entryName: String
            let entryNumber: Int
            enum CodingKeys: String, CodingKey {
                case memberId = "member_id"
                case entryName = "entry_name"
                case entryNumber = "entry_number"
            }
        }

        let entry: Entry = try await supabase
            .from("pool_entries")
            .insert(NewEntry(memberId: memberId, entryName: entryName, entryNumber: entryNumber))
            .select()
            .single()
            .execute()
            .value

        return entry
    }

    func deleteEntry(entryId: String) async throws {
        try await supabase
            .from("pool_entries")
            .delete()
            .eq("entry_id", value: entryId)
            .execute()
    }

    func renameEntry(entryId: String, newName: String) async throws {
        struct EntryRename: Codable {
            let entryName: String
            enum CodingKeys: String, CodingKey {
                case entryName = "entry_name"
            }
        }

        try await supabase
            .from("pool_entries")
            .update(EntryRename(entryName: newName))
            .eq("entry_id", value: entryId)
            .execute()
    }
}
