import Foundation
import Combine

/// Manages edit state for all predictions in Full Tournament mode.
/// Supports auto-save with debounce, draft saving, and final submission.
@MainActor
@Observable
final class PredictionEditViewModel {
    let poolId: String
    let matches: [Match]
    let teams: [Team]

    /// Current prediction inputs keyed by match_id
    var predictions: [String: PredictionInput] = [:]

    /// Save status for UI feedback
    var saveStatus: SaveStatus = .idle
    var lastSavedAt: Date?
    var errorMessage: String?
    var isSubmitting = false
    var submitSuccess = false

    /// Track which predictions have been modified since last save
    private var dirtyMatchIds: Set<String> = []
    private var debounceTask: Task<Void, Never>?

    private let apiService = APIService()
    private let predictionService = PredictionService()

    enum SaveStatus: Equatable {
        case idle
        case saving
        case saved
        case error(String)
    }

    init(poolId: String, matches: [Match], teams: [Team]) {
        self.poolId = poolId
        self.matches = matches
        self.teams = teams
    }

    // MARK: - Computed Properties

    /// Whether all matches have both home and away scores filled in
    var isComplete: Bool {
        matches.allSatisfy { match in
            guard let pred = predictions[match.matchId] else { return false }
            guard pred.homeScore != nil && pred.awayScore != nil else { return false }
            // Knockout matches with a draw need PSO
            if isKnockoutMatch(match) && pred.homeScore == pred.awayScore {
                return pred.homePso != nil && pred.awayPso != nil && pred.homePso != pred.awayPso
            }
            return true
        }
    }

    /// Count of matches that have both scores filled in
    var completedCount: Int {
        matches.filter { match in
            guard let pred = predictions[match.matchId] else { return false }
            return pred.homeScore != nil && pred.awayScore != nil
        }.count
    }

    var totalCount: Int {
        matches.count
    }

    var progressText: String {
        "\(completedCount)/\(totalCount) predictions complete"
    }

    /// Matches missing predictions
    var incompletePredictions: [Match] {
        matches.filter { match in
            guard let pred = predictions[match.matchId] else { return true }
            if pred.homeScore == nil || pred.awayScore == nil { return true }
            if isKnockoutMatch(match) && pred.homeScore == pred.awayScore {
                if pred.homePso == nil || pred.awayPso == nil || pred.homePso == pred.awayPso {
                    return true
                }
            }
            return false
        }
    }

    // MARK: - Stage Grouping

    /// Ordered list of stage keys for display
    static let stageOrder: [String] = [
        "Group A", "Group B", "Group C", "Group D", "Group E", "Group F",
        "Group G", "Group H", "Group I", "Group J", "Group K", "Group L",
        "Round of 32", "Round of 16", "Quarter-finals", "Semi-finals",
        "Third Place", "Final"
    ]

    /// Groups matches by stage with proper ordering
    var matchesByStage: [(stage: String, matches: [Match])] {
        var grouped: [String: [Match]] = [:]

        for match in matches {
            let key = stageKey(for: match)
            grouped[key, default: []].append(match)
        }

        // Sort each group by match number
        for key in grouped.keys {
            grouped[key]?.sort { $0.matchNumber < $1.matchNumber }
        }

        // Return in the defined stage order, filtering out empty groups
        return Self.stageOrder.compactMap { stage in
            guard let stageMatches = grouped[stage], !stageMatches.isEmpty else { return nil }
            return (stage: stage, matches: stageMatches)
        }
    }

    private func stageKey(for match: Match) -> String {
        if match.stage == "group", let group = match.groupLetter {
            return "Group \(group)"
        }
        switch match.stage {
        case "round_32", "round_of_32": return "Round of 32"
        case "round_16", "round_of_16": return "Round of 16"
        case "quarter_final": return "Quarter-finals"
        case "semi_final": return "Semi-finals"
        case "third_place": return "Third Place"
        case "final": return "Final"
        default: return match.stage.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    func isKnockoutMatch(_ match: Match) -> Bool {
        match.stage != "group"
    }

    // MARK: - Load Existing Predictions

    func loadExisting(entryId: String) async {
        do {
            let existing = try await predictionService.fetchPredictions(entryId: entryId)
            for pred in existing {
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
            errorMessage = "Failed to load predictions: \(error.localizedDescription)"
        }
    }

    // MARK: - Update Prediction

    func updateScore(matchId: String, homeScore: Int?, awayScore: Int?) {
        var input = predictions[matchId] ?? PredictionInput(matchId: matchId)
        input.homeScore = homeScore
        input.awayScore = awayScore

        // Clear PSO if scores no longer tied or if it's a group match
        let match = matches.first { $0.matchId == matchId }
        if let match, !isKnockoutMatch(match) {
            input.homePso = nil
            input.awayPso = nil
            input.winnerTeamId = nil
        } else if homeScore != awayScore {
            input.homePso = nil
            input.awayPso = nil
            input.winnerTeamId = nil
        }

        predictions[matchId] = input
        dirtyMatchIds.insert(matchId)
        scheduleDebouncedSave()
    }

    func updatePso(matchId: String, homePso: Int?, awayPso: Int?) {
        guard var input = predictions[matchId] else { return }
        input.homePso = homePso
        input.awayPso = awayPso

        // Determine winner based on PSO
        if let hPso = homePso, let aPso = awayPso, hPso != aPso {
            let match = matches.first { $0.matchId == matchId }
            input.winnerTeamId = hPso > aPso ? match?.homeTeamId : match?.awayTeamId
        } else {
            input.winnerTeamId = nil
        }

        predictions[matchId] = input
        dirtyMatchIds.insert(matchId)
        scheduleDebouncedSave()
    }

    // MARK: - Auto-Save with Debounce

    private var currentEntryId: String?

    func setEntryId(_ entryId: String) {
        currentEntryId = entryId
    }

    private func scheduleDebouncedSave() {
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            guard let self, let entryId = self.currentEntryId else { return }
            await self.saveDrafts(entryId: entryId)
        }
    }

    // MARK: - Save Drafts via API

    func saveDrafts(entryId: String) async {
        let toSave = dirtyMatchIds.compactMap { matchId -> PredictionInput? in
            predictions[matchId]
        }.filter { $0.homeScore != nil && $0.awayScore != nil }

        guard !toSave.isEmpty else { return }

        saveStatus = .saving
        errorMessage = nil

        do {
            try await predictionService.saveDraft(entryId: entryId, predictions: toSave)
            dirtyMatchIds.removeAll()
            saveStatus = .saved
            lastSavedAt = Date()
        } catch {
            let msg = error.localizedDescription
            saveStatus = .error(msg)
            errorMessage = msg
        }
    }

    // MARK: - Bracket Resolution

    var bracket: BracketResult {
        resolveFullBracket(matches: matches, predictions: predictions, teams: teams)
    }

    var allGroupStandings: [String: [GroupStanding]] {
        bracket.allGroupStandings
    }

    var rankedThirds: [GroupStanding] {
        bracket.rankedThirds
    }

    var qualifiedThirds: [GroupStanding] {
        bracket.qualifiedThirds
    }

    var champion: GroupStanding? {
        bracket.champion
    }

    // MARK: - Stage Completion

    func matchesForWizardStage(_ stage: WizardStage) -> [Match] {
        let stageKeys = stage.stageKeys
        return matches.filter { match in
            if match.stage == "group" {
                return stage == .groupStage
            }
            return stageKeys.contains(match.stage)
        }.sorted { $0.matchNumber < $1.matchNumber }
    }

    func isStageComplete(_ stage: WizardStage) -> Bool {
        if stage == .summary { return isComplete }
        let stageMatches = matchesForWizardStage(stage)
        return stageMatches.allSatisfy { match in
            guard let pred = predictions[match.matchId] else { return false }
            guard pred.homeScore != nil && pred.awayScore != nil else { return false }
            if isKnockoutMatch(match) && pred.homeScore == pred.awayScore {
                return pred.homePso != nil && pred.awayPso != nil && pred.homePso != pred.awayPso
            }
            return true
        }
    }

    func stageCompletionCount(_ stage: WizardStage) -> (completed: Int, total: Int) {
        let stageMatches = matchesForWizardStage(stage)
        let completed = stageMatches.filter { match in
            guard let pred = predictions[match.matchId] else { return false }
            return pred.homeScore != nil && pred.awayScore != nil
        }.count
        return (completed, stageMatches.count)
    }

    func resolvedTeamsForMatch(_ matchNumber: Int) -> (home: GroupStanding?, away: GroupStanding?) {
        bracket.knockoutTeamMap[matchNumber] ?? (nil, nil)
    }

    // MARK: - Group Helpers

    func matchesForGroup(_ groupLetter: String) -> [Match] {
        matches.filter { $0.stage == "group" && $0.groupLetter == groupLetter }
            .sorted { $0.matchNumber < $1.matchNumber }
    }

    func standingsForGroup(_ groupLetter: String) -> [GroupStanding] {
        allGroupStandings[groupLetter] ?? []
    }

    // MARK: - Submit Predictions via API

    func submitPredictions(entryId: String) async {
        isSubmitting = true
        errorMessage = nil

        do {
            // Save any remaining drafts first
            let allInputs = Array(predictions.values).filter {
                $0.homeScore != nil && $0.awayScore != nil
            }
            if !allInputs.isEmpty {
                try await predictionService.saveDraft(entryId: entryId, predictions: allInputs)
            }

            // Now submit via API (triggers server-side validation & email)
            try await apiService.submitPredictions(poolId: poolId, entryId: entryId)
            submitSuccess = true
            dirtyMatchIds.removeAll()
        } catch {
            errorMessage = error.localizedDescription
        }

        isSubmitting = false
    }
}
