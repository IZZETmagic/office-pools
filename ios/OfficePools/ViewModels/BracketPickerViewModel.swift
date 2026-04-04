import Foundation

/// Manages the state for bracket picker predictions.
/// Handles group rankings, third-place rankings, knockout picks,
/// auto-save with debounce, bracket resolution, and submission.
@MainActor
@Observable
final class BracketPickerViewModel {
    let poolId: String
    let matches: [Match]
    let teams: [Team]

    // MARK: - Core State

    /// Group rankings: group letter -> ordered array of team IDs (1st to 4th)
    var groupRankings: [String: [String]] = [:]

    /// Third-place team IDs ranked from strongest (1) to weakest (12)
    var thirdPlaceRanking: [String] = []

    /// Knockout picks: match_id -> (winnerTeamId, predictedPenalty)
    var knockoutPicks: [String: (winnerTeamId: String, predictedPenalty: Bool)] = [:]

    /// Current wizard step
    var currentStep: BPWizardStep = .groupRankings

    // MARK: - Save State

    var saveStatus: SaveStatus = .idle
    var lastSavedAt: Date?
    var errorMessage: String?
    var isSubmitting = false
    var submitSuccess = false

    enum SaveStatus: Equatable {
        case idle
        case saving
        case saved
        case error(String)
    }

    // MARK: - Private

    private var entryId: String?
    private var debounceTask: Task<Void, Never>?
    private let apiService = APIService()
    private var hasUnsavedChanges = false

    // Team lookup
    private(set) var teamMap: [String: Team] = [:]

    init(poolId: String, matches: [Match], teams: [Team]) {
        self.poolId = poolId
        self.matches = matches
        self.teams = teams
        self.teamMap = Dictionary(uniqueKeysWithValues: teams.map { ($0.teamId, $0) })
        initializeDefaultGroupRankings()
    }

    func setEntryId(_ entryId: String) {
        self.entryId = entryId
    }

    // MARK: - Initialization

    /// Initialize group rankings with FIFA ranking order as default
    private func initializeDefaultGroupRankings() {
        for letter in GROUP_LETTERS {
            let groupTeams = teams
                .filter { $0.groupLetter == letter }
                .sorted { $0.fifaRankingPoints > $1.fifaRankingPoints }
            groupRankings[letter] = groupTeams.map(\.teamId)
        }
    }

    /// Initialize third-place ranking from current group rankings (3rd-place teams sorted by FIFA)
    func initializeThirdPlaceIfNeeded() {
        let expectedIds = Set(thirdPlaceTeamIdsFromGroups)

        if thirdPlaceRanking.isEmpty ||
           thirdPlaceRanking.count != expectedIds.count ||
           !Set(thirdPlaceRanking).isSubset(of: expectedIds) {
            thirdPlaceRanking = thirdPlaceTeamIdsFromGroups
                .compactMap { teamMap[$0] }
                .sorted { $0.fifaRankingPoints > $1.fifaRankingPoints }
                .map(\.teamId)
        }
    }

    /// The 3rd-place team from each group (index 2 in the ranking)
    var thirdPlaceTeamIdsFromGroups: [String] {
        GROUP_LETTERS.compactMap { letter in
            guard let ranking = groupRankings[letter], ranking.count >= 3 else { return nil }
            return ranking[2]
        }
    }

    // MARK: - Load Existing Data

    func loadExisting(entryId: String) async {
        do {
            let response = try await apiService.fetchBracketPicks(poolId: poolId, entryId: entryId)

            // Load group rankings
            for letter in GROUP_LETTERS {
                let groupRanks = response.groupRankings
                    .filter { $0.groupLetter == letter }
                    .sorted { $0.predictedPosition < $1.predictedPosition }
                if !groupRanks.isEmpty {
                    groupRankings[letter] = groupRanks.map(\.teamId)
                }
            }

            // Load third-place rankings
            let sortedThirds = response.thirdPlaceRankings.sorted { $0.rank < $1.rank }
            if !sortedThirds.isEmpty {
                thirdPlaceRanking = sortedThirds.map(\.teamId)
            }

            // Load knockout picks
            for pick in response.knockoutPicks {
                knockoutPicks[pick.matchId] = (
                    winnerTeamId: pick.winnerTeamId,
                    predictedPenalty: pick.predictedPenalty
                )
            }
        } catch {
            errorMessage = "Failed to load bracket picks: \(error.localizedDescription)"
        }
    }

    // MARK: - Update Handlers

    func updateGroupRanking(groupLetter: String, teamIds: [String]) {
        groupRankings[groupLetter] = teamIds
        scheduleDebouncedSave()
    }

    func updateThirdPlaceRanking(_ ranking: [String]) {
        thirdPlaceRanking = ranking
        scheduleDebouncedSave()
    }

    func selectWinner(matchId: String, teamId: String) {
        let existingPick = knockoutPicks[matchId]

        // Deselect if same team tapped
        if existingPick?.winnerTeamId == teamId {
            knockoutPicks.removeValue(forKey: matchId)
            // Reset downstream
            let downstream = findDownstreamMatchIds(changedMatchId: matchId)
            for id in downstream { knockoutPicks.removeValue(forKey: id) }
            scheduleDebouncedSave()
            return
        }

        // Check for cascade when changing an existing pick
        if existingPick != nil && existingPick?.winnerTeamId != teamId {
            let downstream = findDownstreamMatchIds(changedMatchId: matchId)
            if !downstream.isEmpty {
                pendingCascade = PendingCascade(
                    matchId: matchId,
                    newTeamId: teamId,
                    affectedMatchIds: downstream
                )
                return
            }
        }

        // Set the pick
        knockoutPicks[matchId] = (
            winnerTeamId: teamId,
            predictedPenalty: existingPick?.predictedPenalty ?? false
        )
        scheduleDebouncedSave()
    }

    func togglePenalty(matchId: String) {
        guard var pick = knockoutPicks[matchId] else { return }
        pick.predictedPenalty = !pick.predictedPenalty
        knockoutPicks[matchId] = pick
        scheduleDebouncedSave()
    }

    // MARK: - Cascade Handling

    struct PendingCascade {
        let matchId: String
        let newTeamId: String
        let affectedMatchIds: [String]
    }

    var pendingCascade: PendingCascade?

    func confirmCascade() {
        guard let cascade = pendingCascade else { return }
        let existingPick = knockoutPicks[cascade.matchId]

        for id in cascade.affectedMatchIds {
            knockoutPicks.removeValue(forKey: id)
        }

        knockoutPicks[cascade.matchId] = (
            winnerTeamId: cascade.newTeamId,
            predictedPenalty: existingPick?.predictedPenalty ?? false
        )

        pendingCascade = nil
        scheduleDebouncedSave()
    }

    func cancelCascade() {
        pendingCascade = nil
    }

    /// Find all downstream match IDs that depend on a changed match result
    private func findDownstreamMatchIds(changedMatchId: String) -> [String] {
        guard let changedMatch = matches.first(where: { $0.matchId == changedMatchId }) else { return [] }

        var affected: [String] = []
        var invalidatedMatchNumbers: Set<Int> = [changedMatch.matchNumber]

        let roundOrder = ["round_32", "round_16", "quarter_final", "semi_final", "third_place", "final"]
        guard let changedRoundIdx = roundOrder.firstIndex(of: changedMatch.stage) else { return [] }

        for r in (changedRoundIdx + 1)..<roundOrder.count {
            let roundKey = roundOrder[r]
            let roundMatches = matches.filter { $0.stage == roundKey }

            for match in roundMatches {
                let homeRef = extractMatchNumber(placeholder: match.homeTeamPlaceholder)
                let awayRef = extractMatchNumber(placeholder: match.awayTeamPlaceholder)

                let homeDepends = homeRef.map { invalidatedMatchNumbers.contains($0) } ?? false
                let awayDepends = awayRef.map { invalidatedMatchNumbers.contains($0) } ?? false

                if homeDepends || awayDepends {
                    if knockoutPicks[match.matchId] != nil {
                        affected.append(match.matchId)
                    }
                    invalidatedMatchNumbers.insert(match.matchNumber)
                }
            }
        }

        return affected
    }

    // MARK: - Bracket Resolution

    var bracket: BracketResult {
        let hasGroupData = groupRankings.count == GROUP_LETTERS.count &&
            groupRankings.values.allSatisfy { $0.count >= 3 }
        let hasThirdPlaceData = thirdPlaceRanking.count >= 8

        guard hasGroupData, hasThirdPlaceData else {
            return BracketResult(
                allGroupStandings: [:],
                knockoutTeamMap: [:],
                champion: nil,
                runnerUp: nil,
                thirdPlace: nil,
                qualifiedThirds: [],
                rankedThirds: []
            )
        }

        return resolveFullBracketFromBracketPicker(
            groupRankings: groupRankings,
            thirdPlaceRanking: thirdPlaceRanking,
            knockoutPicks: knockoutPicks,
            matches: matches,
            teams: teams
        )
    }

    var knockoutTeamMap: [Int: (home: GroupStanding?, away: GroupStanding?)] {
        bracket.knockoutTeamMap
    }

    var champion: GroupStanding? { bracket.champion }
    var runnerUp: GroupStanding? { bracket.runnerUp }

    // MARK: - Step Completion

    var isGroupsComplete: Bool {
        groupRankings.count == GROUP_LETTERS.count &&
        GROUP_LETTERS.allSatisfy { letter in
            (groupRankings[letter]?.count ?? 0) >= 4
        }
    }

    var isThirdPlaceComplete: Bool {
        thirdPlaceRanking.count == 12
    }

    func isRoundComplete(stageKeys: [String]) -> Bool {
        let roundMatches = matches.filter { stageKeys.contains($0.stage) }
        return !roundMatches.isEmpty && roundMatches.allSatisfy { knockoutPicks[$0.matchId] != nil }
    }

    var isR32Complete: Bool { isRoundComplete(stageKeys: ["round_32"]) }
    var isR16Complete: Bool { isRoundComplete(stageKeys: ["round_16"]) }
    var isQFComplete: Bool { isRoundComplete(stageKeys: ["quarter_final"]) }
    var isSFComplete: Bool { isRoundComplete(stageKeys: ["semi_final"]) }
    var isThirdFinalComplete: Bool { isRoundComplete(stageKeys: ["third_place", "final"]) }
    var isKnockoutComplete: Bool { isR32Complete && isR16Complete && isQFComplete && isSFComplete && isThirdFinalComplete }
    var isComplete: Bool { isGroupsComplete && isThirdPlaceComplete && isKnockoutComplete }

    func canProceedFromStep(_ step: BPWizardStep) -> Bool {
        switch step {
        case .groupRankings: return isGroupsComplete
        case .thirdPlace: return isThirdPlaceComplete
        case .roundOf32: return isR32Complete
        case .roundOf16: return isR16Complete
        case .quarterFinals: return isQFComplete
        case .semiFinals: return isSFComplete
        case .thirdFinal: return isThirdFinalComplete
        case .review: return true
        }
    }

    var totalKnockoutMatches: Int {
        matches.filter { $0.stage != "group" }.count
    }

    var knockoutPickedCount: Int {
        knockoutPicks.count
    }

    var progressText: String {
        let steps = BPWizardStep.allCases.filter { $0 != .review }
        let completed = steps.filter { canProceedFromStep($0) }.count
        return "\(completed)/\(steps.count) steps complete"
    }

    // MARK: - Matches for a knockout round

    func matchesForStageKeys(_ stageKeys: [String]) -> [Match] {
        matches.filter { stageKeys.contains($0.stage) }
            .sorted { $0.matchNumber < $1.matchNumber }
    }

    // MARK: - Auto-Save

    private func scheduleDebouncedSave() {
        hasUnsavedChanges = true
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            guard let self, let entryId = self.entryId else { return }
            await self.saveBracketPicks(entryId: entryId)
        }
    }

    func saveBracketPicks(entryId: String) async {
        guard hasUnsavedChanges else { return }
        saveStatus = .saving
        errorMessage = nil

        let payload = buildSavePayload(entryId: entryId)

        do {
            _ = try await apiService.saveBracketPicks(poolId: poolId, payload: payload)
            hasUnsavedChanges = false
            saveStatus = .saved
            lastSavedAt = Date()
        } catch {
            let msg = error.localizedDescription
            saveStatus = .error(msg)
            errorMessage = msg
        }
    }

    private func buildSavePayload(entryId: String) -> BracketPicksSavePayload {
        var groupPayloads: [BracketPicksSavePayload.GroupRankingPayload] = []
        for (letter, teamIds) in groupRankings {
            for (idx, teamId) in teamIds.enumerated() {
                groupPayloads.append(.init(
                    entryId: entryId,
                    teamId: teamId,
                    groupLetter: letter,
                    predictedPosition: idx + 1
                ))
            }
        }

        let thirdPayloads: [BracketPicksSavePayload.ThirdPlaceRankingPayload] = thirdPlaceRanking.enumerated().map { idx, teamId in
            .init(
                entryId: entryId,
                teamId: teamId,
                groupLetter: teamMap[teamId]?.groupLetter ?? "",
                rank: idx + 1
            )
        }

        let knockoutPayloads: [BracketPicksSavePayload.KnockoutPickPayload] = knockoutPicks.compactMap { matchId, pick in
            guard let match = matches.first(where: { $0.matchId == matchId }) else { return nil }
            return .init(
                entryId: entryId,
                matchId: matchId,
                matchNumber: match.matchNumber,
                winnerTeamId: pick.winnerTeamId,
                predictedPenalty: pick.predictedPenalty
            )
        }

        return BracketPicksSavePayload(
            entryId: entryId,
            groupRankings: groupPayloads,
            thirdPlaceRankings: thirdPayloads,
            knockoutPicks: knockoutPayloads
        )
    }

    // MARK: - Submit

    func submitBracketPicks(entryId: String) async {
        isSubmitting = true
        errorMessage = nil

        do {
            // Save any pending changes first
            if hasUnsavedChanges {
                await saveBracketPicks(entryId: entryId)
            }

            _ = try await apiService.submitBracketPicks(poolId: poolId, entryId: entryId)
            submitSuccess = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isSubmitting = false
    }
}
