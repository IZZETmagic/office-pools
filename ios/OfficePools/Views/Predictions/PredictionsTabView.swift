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
        // Always show entry list — tapping an entry opens full-screen prediction flow
        entryListPage
            .fullScreenCover(isPresented: $showingEntryDetail) {
                if let entry = selectedEntry {
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
                            // Reset state for next open
                            isEditing = false
                            editViewModel = nil
                            readOnlyEditVM = nil
                        },
                        onStartEditing: { startEditing(entry: entry) },
                        onSetupReadOnly: { setupReadOnlyViewModel(entry: entry) },
                        onSubmitSuccess: {
                            isEditing = false
                            editViewModel = nil
                            Task {
                                await viewModel.loadPredictions(entryId: entry.entryId)
                            }
                        }
                    )
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

    @State private var dragOffset: CGFloat = 0
    @GestureState private var isDragging = false

    var body: some View {
        ZStack {
            // Dimmed background that appears as you swipe
            if dragOffset > 0 {
                Color.black
                    .opacity(Double(0.3 * (1.0 - dragOffset / UIScreen.main.bounds.width)))
                    .ignoresSafeArea()
            }

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
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.primary)
                                .frame(width: 32, height: 32)
                                .background(.ultraThinMaterial, in: Circle())
                        }

                        Spacer()

                        Text(entryName)
                            .font(.headline)

                        Spacer()

                        // Invisible balance element
                        Color.clear
                            .frame(width: 32, height: 32)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)

                    Spacer()
                }
            }
            .background(Color(.systemGroupedBackground))
            .offset(x: dragOffset)
            .gesture(
                DragGesture()
                    .updating($isDragging) { _, state, _ in state = true }
                    .onChanged { value in
                        // Only allow swipe from the left 40pt edge
                        guard value.startLocation.x < 40 else { return }
                        if value.translation.width > 0 {
                            dragOffset = value.translation.width
                        }
                    }
                    .onEnded { value in
                        guard value.startLocation.x < 40 else { return }
                        let velocity = value.predictedEndTranslation.width
                        if value.translation.width > 120 || velocity > 500 {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                dragOffset = UIScreen.main.bounds.width
                            }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                onClose()
                                dragOffset = 0
                            }
                        } else {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                dragOffset = 0
                            }
                        }
                    }
            )
        }
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
