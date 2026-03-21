import SwiftUI

struct PredictionsTabView: View {
    @Bindable var viewModel: PredictionsViewModel
    let matches: [Match]
    let teams: [Team]
    @Binding var selectedEntry: Entry?
    let entries: [Entry]
    let pool: Pool?
    let settings: PoolSettings?
    var computedPoints: Int?
    var pointsForEntry: (String) -> Int = { _ in 0 }
    var onEntryCreated: (() async -> Void)?
    @Binding var showingEntryDetail: Bool

    @State private var isEditing = false
    @State private var editViewModel: PredictionEditViewModel?
    @State private var resumeStage: WizardStage = .groupStage
    @State private var hasLoadedPredictions = false
    @State private var newEntryName = ""
    @State private var isCreatingEntry = false
    @State private var isRenamingEntry = false
    @State private var renameEntryName = ""
    @State private var entryToRename: Entry?

    private var isMultiEntry: Bool {
        (pool?.maxEntriesPerUser ?? 1) > 1
    }

    private var canCreateNewEntry: Bool {
        guard let pool = pool else { return false }
        return entries.count < pool.maxEntriesPerUser
    }

    // MARK: - Body

    var body: some View {
        Group {
            if isMultiEntry {
                // Multi-entry: show entry list or entry detail
                if showingEntryDetail, let entry = selectedEntry {
                    predictionContent(entry: entry)
                } else {
                    entryListPage
                }
            } else if let entry = selectedEntry {
                // Single-entry: go straight to predictions
                predictionContent(entry: entry)
            } else {
                ProgressView("Loading...")
            }
        }
        .task {
            // Single-entry: load predictions immediately
            if !isMultiEntry, let entryId = selectedEntry?.entryId {
                await loadPredictions(entryId: entryId)
            }
        }
        .alert("New Entry", isPresented: $isCreatingEntry) {
            TextField("Entry Name", text: $newEntryName)
            Button("Cancel", role: .cancel) { newEntryName = "" }
            Button("Create") {
                Task { await createNewEntry() }
            }
        } message: {
            Text("Enter a name for your new entry")
        }
        .alert("Rename Entry", isPresented: $isRenamingEntry) {
            TextField("Entry Name", text: $renameEntryName)
            Button("Cancel", role: .cancel) {
                renameEntryName = ""
                entryToRename = nil
            }
            Button("Save") {
                Task { await renameEntry() }
            }
        } message: {
            Text("Enter a new name for this entry")
        }
    }

    // MARK: - Prediction Content (shared by single & multi entry)

    private func predictionContent(entry: Entry) -> some View {
        Group {
            if entry.hasSubmittedPredictions || !canEdit {
                submittedView(entry: entry)
            } else if isEditing, let editVM = editViewModel {
                editView(entry: entry, editVM: editVM)
            } else if !hasLoadedPredictions {
                ProgressView("Loading predictions...")
            } else {
                // Predictions loaded — auto-launch wizard
                Color.clear.onAppear {
                    if !isEditing {
                        startEditing(entry: entry)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Load Predictions

    private func loadPredictions(entryId: String) async {
        hasLoadedPredictions = false
        isEditing = false
        editViewModel = nil
        await viewModel.loadPredictions(entryId: entryId)
        hasLoadedPredictions = true
    }

    // MARK: - Entry List Page (multi-entry pools)

    private var entryListPage: some View {
        List {
            Section {
                ForEach(entries) { entry in
                    Button {
                        selectedEntry = entry
                        Task {
                            await loadPredictions(entryId: entry.entryId)
                            showingEntryDetail = true
                        }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 6) {
                                    Text(entry.entryName)
                                        .font(.body.weight(.medium))
                                        .foregroundStyle(.primary)

                                    if entry.hasSubmittedPredictions {
                                        Image(systemName: "checkmark.seal.fill")
                                            .font(.caption)
                                            .foregroundStyle(.green)
                                    }
                                }

                                Text(entryStatusText(entry))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Text("\(pointsForEntry(entry.entryId)) pts")
                                .font(.subheadline.weight(.semibold).monospacedDigit())
                                .foregroundStyle(.secondary)

                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing) {
                        Button {
                            entryToRename = entry
                            renameEntryName = entry.entryName
                            isRenamingEntry = true
                        } label: {
                            Label("Rename", systemImage: "pencil")
                        }
                        .tint(.blue)
                    }
                }
            } header: {
                Text("Your Entries")
            } footer: {
                if let pool = pool {
                    Text("\(entries.count) of \(pool.maxEntriesPerUser) entries used")
                }
            }

            if canCreateNewEntry {
                Section {
                    Button {
                        isCreatingEntry = true
                    } label: {
                        HStack {
                            Image(systemName: "plus.circle.fill")
                                .foregroundStyle(Color.accentColor)
                            Text("Add New Entry")
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func entryStatusText(_ entry: Entry) -> String {
        if entry.hasSubmittedPredictions {
            return "Submitted"
        } else if entry.predictionsLocked {
            return "Locked"
        } else {
            return "Draft"
        }
    }

    // MARK: - Can Edit Check

    private var canEdit: Bool {
        guard let entry = selectedEntry else { return false }
        if entry.hasSubmittedPredictions { return false }
        if entry.predictionsLocked { return false }
        if isPastDeadline { return false }
        return true
    }

    private var isPastDeadline: Bool {
        guard let deadline = pool?.predictionDeadline else { return false }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: deadline) {
            return date < Date()
        }
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: deadline) {
            return date < Date()
        }
        return false
    }

    // MARK: - Submitted View (read-only)

    private func submittedView(entry: Entry) -> some View {
        List {
            Section {
                HStack {
                    if entry.hasSubmittedPredictions {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(.green)
                        Text("Predictions submitted")
                            .font(.subheadline.weight(.medium))
                    } else if entry.predictionsLocked {
                        Image(systemName: "lock.fill")
                            .foregroundStyle(.orange)
                        Text("Predictions locked")
                            .font(.subheadline.weight(.medium))
                    } else if isPastDeadline {
                        Image(systemName: "clock.badge.exclamationmark")
                            .foregroundStyle(.red)
                        Text("Deadline has passed")
                            .font(.subheadline.weight(.medium))
                    }
                    Spacer()
                    Text("\(computedPoints ?? entry.totalPoints) pts")
                        .font(.headline.monospacedDigit())
                }
            }

            ForEach(groupedSubmittedMatches, id: \.stage) { group in
                Section(header: Text(group.stage)) {
                    ForEach(group.matches) { match in
                        if let pred = viewModel.existingPredictions.first(where: { $0.matchId == match.matchId }) {
                            SubmittedPredictionRow(match: match, prediction: pred)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var groupedSubmittedMatches: [(stage: String, matches: [Match])] {
        var grouped: [String: [Match]] = [:]
        for match in matches {
            let key = stageKey(for: match)
            grouped[key, default: []].append(match)
        }
        for key in grouped.keys {
            grouped[key]?.sort { $0.matchNumber < $1.matchNumber }
        }
        return PredictionEditViewModel.stageOrder.compactMap { stage in
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

    // MARK: - Edit View (Wizard)

    private func editView(entry: Entry, editVM: PredictionEditViewModel) -> some View {
        PredictionWizardView(
            viewModel: editVM,
            entry: entry,
            initialStage: resumeStage,
            onSubmitSuccess: {
                isEditing = false
                editViewModel = nil
                Task {
                    await viewModel.loadPredictions(entryId: entry.entryId)
                }
            }
        )
    }

    // MARK: - Create New Entry

    private func createNewEntry() async {
        guard let memberId = entries.first?.memberId else { return }
        let name = newEntryName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        let nextNumber = (entries.map(\.entryNumber).max() ?? 0) + 1

        do {
            let predictionService = PredictionService()
            let newEntry = try await predictionService.createEntry(
                memberId: memberId,
                entryName: name,
                entryNumber: nextNumber
            )
            newEntryName = ""
            await onEntryCreated?()
            selectedEntry = newEntry
        } catch {
            print("[PredictionsTab] Failed to create entry: \(error)")
        }
    }

    // MARK: - Rename Entry

    private func renameEntry() async {
        guard let entry = entryToRename else { return }
        let name = renameEntryName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name != entry.entryName else {
            entryToRename = nil
            renameEntryName = ""
            return
        }

        do {
            let supabase = SupabaseService.shared.client
            try await supabase
                .from("pool_entries")
                .update(["entry_name": name])
                .eq("entry_id", value: entry.entryId)
                .execute()

            renameEntryName = ""
            entryToRename = nil
            await onEntryCreated?()
        } catch {
            print("[PredictionsTab] Failed to rename entry: \(error)")
        }
    }

    // MARK: - Start Editing

    private func startEditing(entry: Entry) {
        let editVM = PredictionEditViewModel(poolId: viewModel.poolId, matches: matches, teams: teams)
        editVM.setEntryId(entry.entryId)

        for pred in viewModel.existingPredictions {
            editVM.predictions[pred.matchId] = PredictionInput(
                matchId: pred.matchId,
                homeScore: pred.predictedHomeScore,
                awayScore: pred.predictedAwayScore,
                homePso: pred.predictedHomePso,
                awayPso: pred.predictedAwayPso,
                winnerTeamId: pred.predictedWinnerTeamId
            )
        }

        resumeStage = .groupStage
        for stage in WizardStage.allCases where stage != .summary {
            if !editVM.isStageComplete(stage) {
                resumeStage = stage
                break
            }
        }
        if editVM.isComplete {
            resumeStage = .summary
        }

        editViewModel = editVM
        isEditing = true
    }
}

// MARK: - Submitted Prediction Row

struct SubmittedPredictionRow: View {
    let match: Match
    let prediction: Prediction

    var body: some View {
        HStack {
            Text(match.homeDisplayName)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            VStack(spacing: 1) {
                Text("\(prediction.predictedHomeScore) - \(prediction.predictedAwayScore)")
                    .font(.headline.monospacedDigit())
                if let homePso = prediction.predictedHomePso, let awayPso = prediction.predictedAwayPso {
                    Text("(\(homePso)-\(awayPso) PSO)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 12)

            Text(match.awayDisplayName)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            if match.isCompleted {
                pointsBadge
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var pointsBadge: some View {
        if let homeActual = match.homeScoreFt, let awayActual = match.awayScoreFt {
            let isExact = prediction.predictedHomeScore == homeActual && prediction.predictedAwayScore == awayActual
            Image(systemName: isExact ? "checkmark.circle.fill" : "xmark.circle")
                .foregroundStyle(isExact ? .green : .red)
        }
    }
}
