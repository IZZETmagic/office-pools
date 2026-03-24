import Foundation

enum CreatePoolStep: Int, CaseIterable {
    case tournament
    case poolType
    case details
    case settings

    var title: String {
        switch self {
        case .tournament: return "Tournament"
        case .poolType: return "Pool Type"
        case .details: return "Details"
        case .settings: return "Settings"
        }
    }
}

enum QuickDeadline {
    case tournamentStart
    case oneDayBefore
    case oneWeekBefore
}

/// View model for the 4-step Create Pool wizard.
@MainActor
@Observable
final class CreatePoolViewModel {
    // Step navigation
    var currentStep: CreatePoolStep = .tournament

    // Step 1: Tournament
    var tournaments: [Tournament] = []
    var isLoadingTournaments = false
    var selectedTournamentId: String?

    // Step 2: Pool Type
    var predictionMode: PredictionMode = .fullTournament

    // Step 3: Details
    var poolName = ""
    var poolDescription = ""

    // Step 4: Settings
    var deadlineDate = Date()
    var isPrivate = false
    var maxParticipants = 0  // 0 = unlimited
    var maxEntriesPerUser = 1

    // UI state
    var isCreating = false
    var errorMessage: String?
    var createdPool: Pool?

    private let poolService = PoolService()

    // MARK: - Computed

    var selectedTournament: Tournament? {
        guard let id = selectedTournamentId else { return nil }
        return tournaments.first { $0.tournamentId == id }
    }

    var canProceed: Bool {
        switch currentStep {
        case .tournament: return selectedTournamentId != nil
        case .poolType: return true  // always has default
        case .details: return !poolName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .settings: return true
        }
    }

    var isLastStep: Bool {
        currentStep == .settings
    }

    var currentStepIndex: Int {
        currentStep.rawValue
    }

    var totalSteps: Int {
        CreatePoolStep.allCases.count
    }

    /// Dynamic placeholder for pool name, e.g. "Office FIFA World Cup 2026"
    var poolNamePlaceholder: String {
        if let tournament = selectedTournament {
            return "e.g. Office \(tournament.name)"
        }
        return "e.g. Office World Cup"
    }

    // MARK: - Actions

    func loadTournaments() async {
        isLoadingTournaments = true
        do {
            tournaments = try await poolService.fetchTournaments()
            // Auto-select if only one tournament
            if tournaments.count == 1 {
                selectedTournamentId = tournaments[0].tournamentId
                updateDeadlineFromTournament()
            }
            print("[CreatePool] Loaded \(tournaments.count) tournaments")
        } catch {
            print("[CreatePool] Failed to load tournaments: \(error)")
            errorMessage = "Failed to load tournaments."
        }
        isLoadingTournaments = false
    }

    func selectTournament(_ id: String) {
        selectedTournamentId = id
        updateDeadlineFromTournament()
    }

    func goNext() {
        guard canProceed else { return }
        errorMessage = nil
        if let nextIndex = CreatePoolStep(rawValue: currentStep.rawValue + 1) {
            currentStep = nextIndex
        }
    }

    func goBack() {
        errorMessage = nil
        if let prevIndex = CreatePoolStep(rawValue: currentStep.rawValue - 1) {
            currentStep = prevIndex
        }
    }

    func goToStep(_ step: CreatePoolStep) {
        // Only allow going back to completed steps
        if step.rawValue < currentStep.rawValue {
            currentStep = step
        }
    }

    func setQuickDeadline(_ option: QuickDeadline) {
        guard let tournament = selectedTournament, let startDate = tournament.parsedStartDate else { return }

        let calendar = Calendar.current
        // Set time to 1:00 PM
        var components = calendar.dateComponents([.year, .month, .day], from: startDate)
        components.hour = 13
        components.minute = 0

        switch option {
        case .tournamentStart:
            deadlineDate = calendar.date(from: components) ?? startDate
        case .oneDayBefore:
            if let dayBefore = calendar.date(byAdding: .day, value: -1, to: startDate) {
                var dayBeforeComponents = calendar.dateComponents([.year, .month, .day], from: dayBefore)
                dayBeforeComponents.hour = 13
                dayBeforeComponents.minute = 0
                deadlineDate = calendar.date(from: dayBeforeComponents) ?? dayBefore
            }
        case .oneWeekBefore:
            if let weekBefore = calendar.date(byAdding: .day, value: -7, to: startDate) {
                var weekBeforeComponents = calendar.dateComponents([.year, .month, .day], from: weekBefore)
                weekBeforeComponents.hour = 13
                weekBeforeComponents.minute = 0
                deadlineDate = calendar.date(from: weekBeforeComponents) ?? weekBefore
            }
        }
    }

    func createPool(userId: String, username: String) async {
        guard let tournamentId = selectedTournamentId else {
            errorMessage = "Please select a tournament."
            return
        }

        guard !poolName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "Please enter a pool name."
            return
        }

        isCreating = true
        errorMessage = nil

        do {
            let pool = try await poolService.createPool(
                poolName: poolName,
                description: poolDescription.isEmpty ? nil : poolDescription,
                tournamentId: tournamentId,
                adminUserId: userId,
                username: username,
                predictionDeadline: deadlineDate,
                predictionMode: predictionMode,
                isPrivate: isPrivate,
                maxParticipants: maxParticipants > 0 ? maxParticipants : nil,
                maxEntriesPerUser: maxEntriesPerUser
            )
            createdPool = pool
            print("[CreatePool] Success! Pool: \(pool.poolName), Code: \(pool.poolCode)")
        } catch {
            print("[CreatePool] Error: \(error)")
            errorMessage = error.localizedDescription
        }

        isCreating = false
    }

    // MARK: - Private

    private func updateDeadlineFromTournament() {
        guard let tournament = selectedTournament, let startDate = tournament.parsedStartDate else { return }
        // Default deadline = tournament start at 1:00 PM
        let calendar = Calendar.current
        var components = calendar.dateComponents([.year, .month, .day], from: startDate)
        components.hour = 13
        components.minute = 0
        deadlineDate = calendar.date(from: components) ?? startDate
    }
}
