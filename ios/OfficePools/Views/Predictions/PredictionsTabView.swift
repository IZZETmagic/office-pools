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
    @State private var isDeletingEntry = false
    @State private var entryToDelete: Entry?
    @State private var deleteError: String?
    @State private var showDeleteError = false

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
        .alert("Delete Entry", isPresented: $isDeletingEntry) {
            Button("Cancel", role: .cancel) {
                entryToDelete = nil
            }
            Button("Delete", role: .destructive) {
                Task { await deleteEntry() }
            }
        } message: {
            if let entry = entryToDelete {
                Text("All predictions for \"\(entry.entryName)\" will be permanently deleted. This cannot be undone.")
            }
        }
        .alert("Unable to Delete", isPresented: $showDeleteError) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(deleteError ?? "Something went wrong.")
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
        readOnlyEditVM = nil
        await viewModel.loadPredictions(entryId: entryId)
        hasLoadedPredictions = true
    }

    // MARK: - Entry List Page (multi-entry pools)

    private var entryListPage: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                Spacer().frame(height: 4)

                // Your Entries card
                VStack(alignment: .leading, spacing: 0) {
                    // Section header
                    VStack(spacing: 10) {
                        HStack {
                            Text("Your Entries")
                                .font(.headline)
                            Spacer()
                        }
                        Divider()
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 8)

                    // Entry rows
                    ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
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
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button {
                                entryToRename = entry
                                renameEntryName = entry.entryName
                                isRenamingEntry = true
                            } label: {
                                Label("Rename", systemImage: "pencil")
                            }

                            if entries.count > 1 && !entry.hasSubmittedPredictions {
                                Button(role: .destructive) {
                                    entryToDelete = entry
                                    isDeletingEntry = true
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }

                    }

                }
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.04), radius: 4, y: 2)

                // Footer note
                if let pool = pool {
                    HStack {
                        Spacer()
                        Text("\(entries.count) of \(pool.maxEntriesPerUser) entries used")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 4)
                }

                // Add Entry button
                if canCreateNewEntry {
                    Button {
                        isCreatingEntry = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus")
                                .font(.subheadline.weight(.semibold))
                            Text("Add Entry")
                                .font(.subheadline.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.accentColor)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }

            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Color(.systemGroupedBackground))
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

    // MARK: - Submitted View (read-only wizard)

    @State private var readOnlyEditVM: PredictionEditViewModel?

    private func submittedView(entry: Entry) -> some View {
        Group {
            if let editVM = readOnlyEditVM {
                PredictionWizardView(
                    viewModel: editVM,
                    entry: entry,
                    initialStage: .summary,
                    readOnly: true,
                    readOnlyPoints: computedPoints ?? entry.totalPoints
                )
            } else {
                ProgressView("Loading predictions...")
            }
        }
        .onAppear {
            setupReadOnlyViewModel(entry: entry)
        }
    }

    private func setupReadOnlyViewModel(entry: Entry) {
        guard readOnlyEditVM == nil else { return }

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

        readOnlyEditVM = editVM
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

    private func deleteEntry() async {
        guard let entry = entryToDelete else { return }

        // Guard: can't delete last entry
        guard entries.count > 1 else {
            deleteError = "Cannot delete your only entry."
            showDeleteError = true
            entryToDelete = nil
            return
        }

        // Guard: can't delete submitted entry
        guard !entry.hasSubmittedPredictions else {
            deleteError = "Cannot delete a submitted entry."
            showDeleteError = true
            entryToDelete = nil
            return
        }

        do {
            let service = PredictionService()
            try await service.deleteEntry(entryId: entry.entryId)

            // If the deleted entry was selected, clear selection
            if selectedEntry?.entryId == entry.entryId {
                selectedEntry = nil
            }

            entryToDelete = nil
            // Reload pool data to refresh entry list
            await onEntryCreated?()
        } catch {
            print("[PredictionsTab] Failed to delete entry: \(error)")
            deleteError = "Failed to delete entry. Please try again."
            showDeleteError = true
            entryToDelete = nil
        }
    }

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

