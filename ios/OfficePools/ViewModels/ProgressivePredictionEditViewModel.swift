import Foundation
import Combine

/// Manages edit state for predictions in Progressive tournament mode.
/// Unlike PredictionEditViewModel (full tournament), this operates on one round at a time.
/// Knockout team resolution uses actual match assignments instead of bracket predictions.
@MainActor
@Observable
final class ProgressivePredictionEditViewModel {
    let poolId: String
    let matches: [Match]
    let teams: [Team]

    /// Current round being edited
    var currentRoundKey: RoundKey

    /// Round states from the server
    var roundStates: [PoolRoundState] = []

    /// Per-round submission status (roundKey rawValue → submission)
    var roundSubmissions: [String: EntryRoundSubmission] = [:]

    /// Current prediction inputs keyed by match_id
    var predictions: [String: PredictionInput] = [:]

    /// Save status for UI feedback — reuses PredictionEditViewModel.SaveStatus for view compatibility
    var saveStatus: PredictionEditViewModel.SaveStatus = .idle
    var lastSavedAt: Date?
    var errorMessage: String?
    var isSubmitting = false
    var submitSuccess = false

    /// Track which predictions have been modified since last save
    private var dirtyMatchIds: Set<String> = []
    private var debounceTask: Task<Void, Never>?

    private let apiService = APIService()
    private let predictionService = PredictionService()

    init(poolId: String, matches: [Match], teams: [Team], roundStates: [PoolRoundState] = [], roundSubmissions: [String: EntryRoundSubmission] = [:]) {
        self.poolId = poolId
        self.matches = matches
        self.teams = teams
        self.roundStates = roundStates
        self.roundSubmissions = roundSubmissions

        // Default to the first open round, or group
        self.currentRoundKey = Self.findActiveRound(roundStates: roundStates, roundSubmissions: roundSubmissions) ?? .group
    }

    // MARK: - Round State Helpers

    /// Find the best round to show: first open & unsubmitted, then first open, then first in_progress, then last completed
    static func findActiveRound(roundStates: [PoolRoundState], roundSubmissions: [String: EntryRoundSubmission]) -> RoundKey? {
        let ordered: [RoundKey] = [.group, .round32, .round16, .quarterFinal, .semiFinal, .thirdPlace, .final_]

        // First open round that hasn't been submitted
        for key in ordered {
            let state = roundStates.first(where: { $0.roundKey == key })
            let submission = roundSubmissions[key.rawValue]
            if state?.state == .open && submission?.hasSubmitted != true {
                return key
            }
        }

        // First open round (even if submitted)
        for key in ordered {
            if roundStates.first(where: { $0.roundKey == key })?.state == .open {
                return key
            }
        }

        // First in_progress round
        for key in ordered {
            if roundStates.first(where: { $0.roundKey == key })?.state == .inProgress {
                return key
            }
        }

        // Last completed round
        for key in ordered.reversed() {
            if roundStates.first(where: { $0.roundKey == key })?.state == .completed {
                return key
            }
        }

        return .group
    }

    func roundState(for key: RoundKey) -> PoolRoundState? {
        roundStates.first(where: { $0.roundKey == key })
    }

    func isRoundOpen(_ key: RoundKey) -> Bool {
        roundState(for: key)?.state == .open
    }

    func isRoundSubmitted(_ key: RoundKey) -> Bool {
        roundSubmissions[key.rawValue]?.hasSubmitted == true
    }

    func isRoundPastDeadline(_ key: RoundKey) -> Bool {
        guard let deadline = roundState(for: key)?.deadline else { return false }
        return parseISO8601(deadline).map { $0 < Date() } ?? false
    }

    func canEditRound(_ key: RoundKey) -> Bool {
        isRoundOpen(key) && !isRoundSubmitted(key) && !isRoundPastDeadline(key)
    }

    /// Ordered list of all round keys
    static let allRoundKeys: [RoundKey] = [.group, .round32, .round16, .quarterFinal, .semiFinal, .thirdPlace, .final_]

    /// Rounds that are visible to the user (not locked, or already have state)
    var visibleRounds: [RoundKey] {
        Self.allRoundKeys.filter { key in
            let state = roundState(for: key)?.state
            return state == .open || state == .inProgress || state == .completed
        }
    }

    // MARK: - Match Filtering

    /// Maps RoundKey to match stage strings
    private func stageKeys(for roundKey: RoundKey) -> [String] {
        switch roundKey {
        case .group: return ["group"]
        case .round32: return ["round_32"]
        case .round16: return ["round_16"]
        case .quarterFinal: return ["quarter_final"]
        case .semiFinal: return ["semi_final"]
        case .thirdPlace: return ["third_place"]
        case .final_: return ["final"]
        }
    }

    /// Matches for the given round
    func matchesForRound(_ roundKey: RoundKey) -> [Match] {
        let keys = stageKeys(for: roundKey)
        return matches.filter { keys.contains($0.stage) }
            .sorted { $0.matchNumber < $1.matchNumber }
    }

    /// Matches for the current round
    var currentRoundMatches: [Match] {
        matchesForRound(currentRoundKey)
    }

    var isGroupRound: Bool {
        currentRoundKey == .group
    }

    func isKnockoutMatch(_ match: Match) -> Bool {
        match.stage != "group"
    }

    // MARK: - Actual Team Resolution (for knockout rounds)

    /// For progressive mode, knockout teams come from the actual match data (home_team_id / away_team_id)
    /// rather than bracket predictions.
    func resolvedTeamsForMatch(_ matchNumber: Int) -> (home: GroupStanding?, away: GroupStanding?) {
        guard let match = matches.first(where: { $0.matchNumber == matchNumber }) else {
            return (nil, nil)
        }

        let teamMap = Dictionary(uniqueKeysWithValues: teams.map { ($0.teamId, $0) })

        let homeTeam: GroupStanding? = match.homeTeamId.flatMap { teamId in
            teamMap[teamId].map { team in
                GroupStanding(
                    teamId: team.teamId,
                    teamName: team.countryName,
                    countryCode: team.countryCode,
                    groupLetter: team.groupLetter ?? "",
                    played: 0, won: 0, drawn: 0, lost: 0,
                    goalsFor: 0, goalsAgainst: 0, goalDifference: 0,
                    points: 0, conductScore: 0, fifaRankingPoints: team.fifaRankingPoints ?? 0
                )
            }
        }

        let awayTeam: GroupStanding? = match.awayTeamId.flatMap { teamId in
            teamMap[teamId].map { team in
                GroupStanding(
                    teamId: team.teamId,
                    teamName: team.countryName,
                    countryCode: team.countryCode,
                    groupLetter: team.groupLetter ?? "",
                    played: 0, won: 0, drawn: 0, lost: 0,
                    goalsFor: 0, goalsAgainst: 0, goalDifference: 0,
                    points: 0, conductScore: 0, fifaRankingPoints: team.fifaRankingPoints ?? 0
                )
            }
        }

        return (homeTeam, awayTeam)
    }

    // MARK: - Computed Properties

    /// Whether all matches in the current round have predictions
    var isRoundComplete: Bool {
        currentRoundMatches.allSatisfy { match in
            guard let pred = predictions[match.matchId] else { return false }
            guard pred.homeScore != nil && pred.awayScore != nil else { return false }
            if isKnockoutMatch(match) && pred.homeScore == pred.awayScore {
                return pred.homePso != nil && pred.awayPso != nil && pred.homePso != pred.awayPso
            }
            return true
        }
    }

    var roundCompletedCount: Int {
        currentRoundMatches.filter { match in
            guard let pred = predictions[match.matchId] else { return false }
            return pred.homeScore != nil && pred.awayScore != nil
        }.count
    }

    var roundTotalCount: Int {
        currentRoundMatches.count
    }

    var progressText: String {
        "\(roundCompletedCount)/\(roundTotalCount) predictions"
    }

    // MARK: - Load Existing Predictions

    private var currentEntryId: String?

    func setEntryId(_ entryId: String) {
        currentEntryId = entryId
    }

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

    private func scheduleDebouncedSave() {
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            guard let self, let entryId = self.currentEntryId else { return }
            await self.saveDrafts(entryId: entryId)
        }
    }

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

    // MARK: - Submit Round Predictions

    func submitRound(entryId: String) async {
        isSubmitting = true
        errorMessage = nil

        do {
            // Save any remaining drafts first
            let roundMatchIds = Set(currentRoundMatches.map(\.matchId))
            let allInputs = predictions.values.filter {
                roundMatchIds.contains($0.matchId) && $0.homeScore != nil && $0.awayScore != nil
            }
            if !allInputs.isEmpty {
                try await predictionService.saveDraft(entryId: entryId, predictions: Array(allInputs))
            }

            // Submit via API
            let response = try await apiService.submitRoundPredictions(
                poolId: poolId,
                entryId: entryId,
                roundKey: currentRoundKey.rawValue
            )

            if response.submitted {
                submitSuccess = true
                dirtyMatchIds.removeAll()

                // Update local submission state
                roundSubmissions[currentRoundKey.rawValue] = EntryRoundSubmission(
                    id: "",
                    entryId: entryId,
                    roundKey: currentRoundKey,
                    hasSubmitted: true,
                    submittedAt: response.submittedAt,
                    autoSubmitted: false,
                    predictionCount: response.predictedCount ?? roundTotalCount
                )
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isSubmitting = false
    }

    // MARK: - Group Stage Helpers (reuse pattern from PredictionEditViewModel)

    /// For group stage: full bracket resolution so GroupStageView can show standings
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

    func matchesForGroup(_ groupLetter: String) -> [Match] {
        matches.filter { $0.stage == "group" && $0.groupLetter == groupLetter }
            .sorted { $0.matchNumber < $1.matchNumber }
    }

    func standingsForGroup(_ groupLetter: String) -> [GroupStanding] {
        allGroupStandings[groupLetter] ?? []
    }

    // MARK: - WizardStage compatibility (for reusing GroupStageView/KnockoutStageView)

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
        if stage == .summary { return false }
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

    // MARK: - ISO8601 Helper

    private func parseISO8601(_ string: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: string)
    }
}
