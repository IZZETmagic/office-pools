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

    /// Progressive mode round state data
    var roundStates: [PoolRoundState] = []
    var roundSubmissions: [String: EntryRoundSubmission] = [:]
    var onRoundStatesRefresh: ((String?) async -> Void)?

    @State private var isEditing = false
    @State private var editViewModel: PredictionEditViewModel?
    @State private var progressiveEditViewModel: ProgressivePredictionEditViewModel?
    @State private var bracketPickerViewModel: BracketPickerViewModel?
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

    private var isProgressive: Bool {
        pool?.predictionMode == .progressive
    }

    private var isBracketPicker: Bool {
        pool?.predictionMode == .bracketPicker
    }

    private var isMultiEntry: Bool {
        (pool?.maxEntriesPerUser ?? 1) > 1
    }

    private var canCreateNewEntry: Bool {
        guard let pool = pool else { return false }
        return entries.count < pool.maxEntriesPerUser
    }

    // MARK: - Body

    var body: some View {
        // Always show entry list — tapping an entry opens full-screen prediction flow
        entryListPage
            .fullScreenCover(isPresented: $showingEntryDetail) {
                if let entry = selectedEntry {
                    if isBracketPicker {
                        BracketPickerFullScreenView(
                            entry: entry,
                            entryName: entry.entryName,
                            bracketPickerViewModel: $bracketPickerViewModel,
                            hasLoadedPredictions: hasLoadedPredictions,
                            canEdit: canEdit,
                            computedPoints: computedPoints,
                            onClose: {
                                showingEntryDetail = false
                                bracketPickerViewModel = nil
                            },
                            onSetup: { setupBracketPickerViewModel(entry: entry) },
                            onSubmitSuccess: {
                                Task {
                                    await viewModel.loadPredictions(entryId: entry.entryId)
                                    await onEntryCreated?()
                                    showingEntryDetail = false
                                    bracketPickerViewModel = nil
                                }
                            }
                        )
                    } else if isProgressive {
                        ProgressiveFullScreenView(
                            entry: entry,
                            entryName: entry.entryName,
                            progressiveEditViewModel: $progressiveEditViewModel,
                            hasLoadedPredictions: hasLoadedPredictions,
                            onClose: {
                                showingEntryDetail = false
                                progressiveEditViewModel = nil
                            },
                            onSetup: { setupProgressiveViewModel(entry: entry) },
                            onSubmitSuccess: {
                                Task {
                                    await viewModel.loadPredictions(entryId: entry.entryId)
                                    await onRoundStatesRefresh?(entry.entryId)
                                    await onEntryCreated?()
                                }
                            }
                        )
                    } else {
                        PredictionFullScreenView(
                            entry: entry,
                            entryName: entry.entryName,
                            isEditing: $isEditing,
                            editViewModel: $editViewModel,
                            resumeStage: $resumeStage,
                            hasLoadedPredictions: hasLoadedPredictions,
                            canEdit: canEdit,
                            computedPoints: computedPoints,
                            readOnlyEditVM: $readOnlyEditVM,
                            onClose: {
                                showingEntryDetail = false
                                isEditing = false
                                editViewModel = nil
                                readOnlyEditVM = nil
                            },
                            onStartEditing: { startEditing(entry: entry) },
                            onSetupReadOnly: { setupReadOnlyViewModel(entry: entry) },
                            onSubmitSuccess: {
                                Task {
                                    await viewModel.loadPredictions(entryId: entry.entryId)
                                    await onEntryCreated?()
                                    isEditing = false
                                    editViewModel = nil
                                }
                            }
                        )
                    }
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

    // MARK: - Load Predictions

    private func loadPredictions(entryId: String) async {
        hasLoadedPredictions = false
        isEditing = false
        editViewModel = nil
        readOnlyEditVM = nil
        await viewModel.loadPredictions(entryId: entryId)
        hasLoadedPredictions = true
    }

    // MARK: - Entry List Page

    private var entryListPage: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                Spacer().frame(height: 4)

                // Your Entries card
                VStack(alignment: .leading, spacing: 0) {
                    // Section header
                    HStack {
                        Text("Your Entries")
                            .font(SPTypography.sectionHeader)
                            .foregroundStyle(Color.sp.ink)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 12)

                    // Entry rows
                    ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                        if index > 0 {
                            Divider().padding(.leading, 16)
                        }

                        Button {
                            selectedEntry = entry
                            Task {
                                await loadPredictions(entryId: entry.entryId)
                                showingEntryDetail = true
                            }
                        } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 6) {
                                        Text(entry.entryName)
                                            .font(SPTypography.cardTitle)
                                            .foregroundStyle(Color.sp.ink)

                                        if entry.hasSubmittedPredictions {
                                            Image(systemName: "checkmark.seal.fill")
                                                .font(.system(size: 12))
                                                .foregroundStyle(Color.sp.green)
                                        }
                                    }

                                    Text(entryStatusText(entry))
                                        .font(SPTypography.body)
                                        .foregroundStyle(Color.sp.slate)
                                }

                                Spacer()

                                Text("\(pointsForEntry(entry.entryId)) pts")
                                    .font(SPTypography.mono(size: 14, weight: .semibold))
                                    .foregroundStyle(Color.sp.slate)

                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(Color.sp.slate)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
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

                    Spacer().frame(height: 8)
                }
                .spCard()

                // Footer note
                if let pool = pool {
                    HStack {
                        Spacer()
                        Text("\(entries.count) of \(pool.maxEntriesPerUser) entries used")
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.slate)
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
                                .font(.system(size: 14, weight: .bold, design: .rounded))
                            Text("Add Entry")
                                .font(SPTypography.cardTitle)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.sp.primary)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                    }
                    .buttonStyle(.plain)
                }

            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Color.sp.snow)
    }

    private func entryStatusText(_ entry: Entry) -> String {
        if isProgressive {
            let submittedCount = roundSubmissions.values.filter(\.hasSubmitted).count
            let totalRounds = roundStates.filter { $0.state != .locked }.count
            if submittedCount > 0 {
                return "\(submittedCount)/\(totalRounds) rounds submitted"
            }
            // Find the current open round
            if let openRound = roundStates.first(where: { $0.state == .open }) {
                return "\(openRound.roundKey.displayName) open"
            }
            return "Draft"
        }
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
        guard let deadline = pool?.predictionDeadline,
              let date = SPDateFormatter.parse(deadline) else { return false }
        return date < Date()
    }

    // MARK: - Read-Only View Model

    @State private var readOnlyEditVM: PredictionEditViewModel?

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

    // MARK: - Bracket Picker Mode Setup

    private func setupBracketPickerViewModel(entry: Entry) {
        guard bracketPickerViewModel == nil else { return }

        let bpVM = BracketPickerViewModel(poolId: viewModel.poolId, matches: matches, teams: teams)
        bpVM.setEntryId(entry.entryId)

        // If already submitted, open straight to the review/summary step
        if entry.hasSubmittedPredictions {
            bpVM.currentStep = .review
        }

        // Load existing bracket picks
        Task {
            await bpVM.loadExisting(entryId: entry.entryId)
        }

        bracketPickerViewModel = bpVM
    }

    // MARK: - Progressive Mode Setup

    private func setupProgressiveViewModel(entry: Entry) {
        guard progressiveEditViewModel == nil else { return }

        let editVM = ProgressivePredictionEditViewModel(
            poolId: viewModel.poolId,
            matches: matches,
            teams: teams,
            roundStates: roundStates,
            roundSubmissions: roundSubmissions
        )
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

        progressiveEditViewModel = editVM
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

    // MARK: - Delete Entry

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
}

// MARK: - Bracket Picker Full-Screen View

/// Full-screen view for bracket picker predictions.
/// Shows the 8-step wizard with group rankings, third-place rankings,
/// knockout picks, and review/submit.
struct BracketPickerFullScreenView: View {
    let entry: Entry
    let entryName: String
    @Binding var bracketPickerViewModel: BracketPickerViewModel?
    let hasLoadedPredictions: Bool
    let canEdit: Bool
    let computedPoints: Int?
    let onClose: () -> Void
    let onSetup: () -> Void
    let onSubmitSuccess: () -> Void

    var body: some View {
        ZStack {
            // Content
            if let bpVM = bracketPickerViewModel {
                let isReadOnly = entry.hasSubmittedPredictions || !canEdit
                BracketPickerWizardView(
                    viewModel: bpVM,
                    entry: entry,
                    readOnly: isReadOnly,
                    readOnlyPoints: isReadOnly ? (computedPoints ?? entry.totalPoints) : nil,
                    onSubmitSuccess: onSubmitSuccess
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(edges: .bottom)
            } else if !hasLoadedPredictions {
                ProgressView("Loading predictions...")
            } else {
                Color.clear.onAppear { onSetup() }
            }

            // Floating header
            VStack {
                HStack {
                    Button(action: onClose) {
                        Image(systemName: "chevron.left")
                            .font(.body.weight(.semibold))
                            .frame(width: 36, height: 36)
                            .background(.ultraThinMaterial, in: Circle())
                    }

                    Spacer()

                    Text(entryName)
                        .font(.headline)

                    Spacer()

                    Color.clear
                        .frame(width: 36, height: 36)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)

                Spacer()
            }
        }
        .background(Color(.systemGroupedBackground))
    }
}

// MARK: - Progressive Full-Screen View

/// Full-screen view for progressive tournament predictions.
/// Shows round tabs and per-round prediction/submission flow.
struct ProgressiveFullScreenView: View {
    let entry: Entry
    let entryName: String
    @Binding var progressiveEditViewModel: ProgressivePredictionEditViewModel?
    let hasLoadedPredictions: Bool
    let onClose: () -> Void
    let onSetup: () -> Void
    let onSubmitSuccess: () -> Void

    var body: some View {
        ZStack {
            // Content
            if let editVM = progressiveEditViewModel {
                ProgressivePredictionWizardView(
                    viewModel: editVM,
                    entry: entry,
                    onSubmitSuccess: onSubmitSuccess
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(edges: .bottom)
            } else if !hasLoadedPredictions {
                ProgressView("Loading predictions...")
            } else {
                Color.clear.onAppear { onSetup() }
            }

            // Floating header
            VStack {
                HStack {
                    Button(action: onClose) {
                        Image(systemName: "chevron.left")
                            .font(.body.weight(.semibold))
                            .frame(width: 36, height: 36)
                            .background(.ultraThinMaterial, in: Circle())
                    }

                    Spacer()

                    Text(entryName)
                        .font(.headline)

                    Spacer()

                    Color.clear
                        .frame(width: 36, height: 36)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)

                Spacer()
            }
        }
        .background(Color(.systemGroupedBackground))
    }
}

// MARK: - Full-Screen Prediction View

/// Dedicated full-screen view for the prediction wizard flow.
/// Hides the tab bar and navigation bar to maximize vertical space
/// and keep the user focused on entering predictions.
struct PredictionFullScreenView: View {
    let entry: Entry
    let entryName: String
    @Binding var isEditing: Bool
    @Binding var editViewModel: PredictionEditViewModel?
    @Binding var resumeStage: WizardStage
    let hasLoadedPredictions: Bool
    let canEdit: Bool
    let computedPoints: Int?
    @Binding var readOnlyEditVM: PredictionEditViewModel?
    let onClose: () -> Void
    let onStartEditing: () -> Void
    let onSetupReadOnly: () -> Void
    let onSubmitSuccess: () -> Void

    var body: some View {
        ZStack {
            // Content fills full screen — scrolls behind header and footer
            predictionContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(edges: .bottom)

            // Floating liquid glass header — pinned to top
            VStack {
                HStack {
                    Button(action: onClose) {
                        Image(systemName: "chevron.left")
                            .font(.body.weight(.semibold))
                            .frame(width: 36, height: 36)
                            .background(.ultraThinMaterial, in: Circle())
                    }

                    Spacer()

                    Text(entryName)
                        .font(.headline)

                    Spacer()

                    // Invisible balance element
                    Color.clear
                        .frame(width: 36, height: 36)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)

                Spacer()
            }
        }
        .background(Color(.systemGroupedBackground))
    }

    @ViewBuilder
    private var predictionContent: some View {
        if entry.hasSubmittedPredictions || !canEdit {
            // Read-only: show submitted predictions
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
                    .onAppear { onSetupReadOnly() }
            }
        } else if isEditing, let editVM = editViewModel {
            // Editing: show wizard
            PredictionWizardView(
                viewModel: editVM,
                entry: entry,
                initialStage: resumeStage,
                onSubmitSuccess: onSubmitSuccess
            )
        } else if !hasLoadedPredictions {
            ProgressView("Loading predictions...")
        } else {
            // Predictions loaded — auto-launch wizard
            Color.clear.onAppear {
                if !isEditing {
                    onStartEditing()
                }
            }
        }
    }
}
