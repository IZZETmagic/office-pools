import Foundation

/// View model for the predictions tab — handles editing and submitting predictions.
@MainActor
@Observable
final class PredictionsViewModel {
    let poolId: String

    var predictions: [String: PredictionInput] = [:] // keyed by match_id
    var existingPredictions: [Prediction] = []
    var isLoading = false
    var isSaving = false
    var isSubmitting = false
    var errorMessage: String?
    var lastSaved: Date?

    private let predictionService = PredictionService()

    init(poolId: String) {
        self.poolId = poolId
    }

    func loadPredictions(entryId: String) async {
        isLoading = true
        errorMessage = nil

        do {
            existingPredictions = try await predictionService.fetchPredictions(entryId: entryId)

            // Populate the input map from existing predictions
            for pred in existingPredictions {
                predictions[pred.matchId] = PredictionInput(
                    matchId: pred.matchId,
                    homeScore: pred.predictedHomeScore,
                    awayScore: pred.predictedAwayScore,
                    homePso: pred.predictedHomePso,
                    awayPso: pred.predictedAwayPso,
                    winnerTeamId: pred.predictedWinnerTeamId
                )
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func saveDraft(entryId: String) async {
        isSaving = true
        errorMessage = nil

        do {
            let inputs = Array(predictions.values)
            try await predictionService.saveDraft(entryId: entryId, predictions: inputs)
            lastSaved = Date()
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }

    func submit(entryId: String) async {
        isSubmitting = true
        errorMessage = nil

        do {
            // Save first, then submit
            let inputs = Array(predictions.values)
            try await predictionService.saveDraft(entryId: entryId, predictions: inputs)
            try await predictionService.submitPredictions(entryId: entryId)
        } catch {
            errorMessage = error.localizedDescription
        }

        isSubmitting = false
    }

    func updatePrediction(matchId: String, homeScore: Int?, awayScore: Int?) {
        if var input = predictions[matchId] {
            input.homeScore = homeScore
            input.awayScore = awayScore
            predictions[matchId] = input
        } else {
            predictions[matchId] = PredictionInput(
                matchId: matchId,
                homeScore: homeScore,
                awayScore: awayScore
            )
        }
    }

    func updatePso(matchId: String, homePso: Int?, awayPso: Int?, winnerTeamId: String?) {
        if var input = predictions[matchId] {
            input.homePso = homePso
            input.awayPso = awayPso
            input.winnerTeamId = winnerTeamId
            predictions[matchId] = input
        }
    }

    var hasUnsavedChanges: Bool {
        // Compare current inputs to existing predictions
        for (matchId, input) in predictions {
            let existing = existingPredictions.first { $0.matchId == matchId }
            if existing == nil && (input.homeScore != nil || input.awayScore != nil) {
                return true
            }
            if let existing, input.homeScore != existing.predictedHomeScore || input.awayScore != existing.predictedAwayScore {
                return true
            }
        }
        return false
    }
}
