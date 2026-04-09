import SwiftUI

struct MemberDetailView: View {
    let member: Member
    let leaderboardData: [LeaderboardEntryData]
    let currentUserId: String
    let poolId: String
    let poolService: PoolService
    let adminCount: Int
    let currentUserIsAdmin: Bool
    var onAdjustmentChanged: (() -> Void)?
    var matches: [Match] = []
    var teams: [Team] = []
    var pool: Pool?

    @State private var showAdjustSheet = false
    @State private var adjustEntry: Entry?
    @State private var adjustAmount = ""
    @State private var adjustReason = ""
    @State private var isProcessing = false
    @State private var actionError: String?
    @State private var showRemoveAlert = false
    @State private var showUnlockAlert = false
    @State private var entryToUnlock: Entry?
    @State private var showDeleteAdjustmentAlert = false
    @State private var adjustmentToDelete: PointAdjustment?
    @State private var unlockedEntryIds: Set<String> = []
    @Environment(\.dismiss) private var dismiss

    @State private var headerHeight: CGFloat = 80

    /// Adjustment history keyed by entryId
    @State private var adjustmentsByEntry: [String: [PointAdjustment]] = [:]

    // MARK: - Prediction Viewing State
    @State private var presentedPredictionEntry: Entry?
    @State private var memberPredictionVM: PredictionsViewModel?
    @State private var readOnlyEditVM: PredictionEditViewModel?
    @State private var bracketPickerVM: BracketPickerViewModel?

    private var isCurrentUser: Bool { member.userId == currentUserId }
    private var entries: [Entry] { member.entries ?? [] }

    var body: some View {
        ZStack(alignment: .top) {
            ScrollView {
                LazyVStack(spacing: 16) {
                    infoCard

                    if !entries.isEmpty {
                        entriesCard
                    }

                    if currentUserIsAdmin {
                        ForEach(entries) { entry in
                            let adjustments = adjustmentsByEntry[entry.entryId] ?? []
                            if !adjustments.isEmpty {
                                adjustmentsCard(entry: entry, adjustments: adjustments)
                            }
                        }
                    }

                    if currentUserIsAdmin {
                        adminActionsCard
                    }
                }
                .padding(.top, headerHeight + 16)
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Color.sp.snow)

            memberHeader
        }
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showAdjustSheet, onDismiss: {
            adjustAmount = ""
            adjustReason = ""
            isProcessing = false
        }) {
            adjustPointsSheet
        }
        .alert("Remove Member", isPresented: $showRemoveAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Remove", role: .destructive) {
                removeMemberAction()
            }
        } message: {
            Text("Remove \(member.users.fullName) from the pool? Their predictions will be deleted.")
        }
        .alert("Unlock Entry", isPresented: $showUnlockAlert) {
            Button("Cancel", role: .cancel) {
                entryToUnlock = nil
            }
            Button("Unlock", role: .destructive) {
                unlockEntryAction()
            }
        } message: {
            if let entry = entryToUnlock {
                Text("Unlock \(entry.entryName) so \(member.users.fullName) can edit their predictions again?")
            }
        }
        .alert("Delete Adjustment", isPresented: $showDeleteAdjustmentAlert) {
            Button("Cancel", role: .cancel) {
                adjustmentToDelete = nil
            }
            Button("Delete", role: .destructive) {
                deleteAdjustmentAction()
            }
        } message: {
            if let adj = adjustmentToDelete {
                Text("Delete this \(adj.amount > 0 ? "+\(adj.amount)" : "\(adj.amount)") adjustment (\(adj.reason))?")
            }
        }
        .alert("Error", isPresented: .init(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK") { actionError = nil }
        } message: {
            Text(actionError ?? "")
        }
        .onAppear {
            loadAdjustments()
        }
        .fullScreenCover(item: $presentedPredictionEntry) { entry in
            memberPredictionCover(entry: entry)
                .task {
                    await loadMemberPredictions(entry: entry)
                }
        }
    }

    // MARK: - Header

    private var bestRank: Int? {
        let entryIds = entries.map(\.entryId)
        return leaderboardData
            .filter { entryIds.contains($0.entryId) }
            .compactMap(\.currentRank)
            .min()
    }

    private var memberHeader: some View {
        VStack(spacing: 6) {
            HStack(spacing: 12) {
                if let rank = bestRank {
                    Text("#\(rank)")
                        .font(SPTypography.mono(size: 18, weight: .black))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(SPTypography.rankColor(rank))
                        .clipShape(Circle())
                } else {
                    Circle()
                        .fill(member.isAdmin ? Color.sp.slate.opacity(0.15) : Color.sp.primaryLight)
                        .frame(width: 40, height: 40)
                        .overlay(
                            Text(String(member.users.fullName.prefix(1)).uppercased())
                                .font(.system(size: 16, weight: .bold, design: .rounded))
                                .foregroundStyle(member.isAdmin ? Color.sp.slate : Color.sp.primary)
                        )
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(member.users.fullName)
                            .font(SPTypography.sectionHeader)
                            .foregroundStyle(Color.sp.ink)
                        if member.isAdmin {
                            Text("ADMIN")
                                .font(SPTypography.caption)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.sp.slate.opacity(0.15))
                                .foregroundStyle(Color.sp.slate)
                                .clipShape(Capsule())
                        }
                    }
                    Text("@\(member.users.username)")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                }

                Spacer()
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .shadow(color: .black.opacity(0.06), radius: 4, y: 2)
        .overlay(
            GeometryReader { geo in
                Color.clear
                    .onAppear { headerHeight = geo.size.height }
                    .onChange(of: geo.size.height) { _, newHeight in
                        headerHeight = newHeight
                    }
            }
        )
    }

    // MARK: - Entries Card

    private var entriesCard: some View {
        card {
            sectionHeader("Entries")

            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                let points = leaderboardData.first(where: { $0.entryId == entry.entryId })?.totalPoints ?? 0

                VStack(spacing: 4) {
                    HStack {
                        Text(entry.entryName)
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.slate)
                        Spacer()
                        Text("\(points) pts")
                            .font(SPTypography.mono(size: 14, weight: .bold))
                            .foregroundStyle(Color.sp.ink)
                        statusPill(
                            isSubmitted(entry) ? "Submitted" : "Pending",
                            color: isSubmitted(entry) ? Color.sp.green : Color.sp.silver
                        )
                    }

                    HStack(spacing: 8) {
                        Spacer()

                        Button {
                            presentedPredictionEntry = entry
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "eye")
                                    .font(.system(size: 10))
                                Text("View Predictions")
                                    .font(SPTypography.detail)
                            }
                            .foregroundStyle(Color.sp.primary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Color.sp.primaryLight)
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)

                        if currentUserIsAdmin {
                            Button {
                                adjustEntry = entry
                                adjustAmount = ""
                                adjustReason = ""
                                showAdjustSheet = true
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "plusminus")
                                        .font(.system(size: 10))
                                    Text("Adjust Points")
                                        .font(SPTypography.detail)
                                }
                                .foregroundStyle(Color.sp.amber)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Color.sp.amberLight)
                                .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)

                            if isSubmitted(entry) {
                                Button {
                                    entryToUnlock = entry
                                    showUnlockAlert = true
                                } label: {
                                    HStack(spacing: 4) {
                                        Image(systemName: "lock.open")
                                            .font(.system(size: 10))
                                        Text("Unlock")
                                            .font(SPTypography.detail)
                                    }
                                    .foregroundStyle(Color.sp.red)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(Color.sp.redLight)
                                    .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if isSubmitted(entry), let submittedAt = entry.predictionsSubmittedAt {
                        HStack {
                            Spacer()
                            Text(SPDateFormatter.long(submittedAt))
                                .font(SPTypography.detail)
                                .foregroundStyle(Color.sp.silver)
                        }
                    }
                }

                if index < entries.count - 1 {
                    Divider()
                }
            }
        }
    }

    // MARK: - Adjustments History Card

    private func adjustmentsCard(entry: Entry, adjustments: [PointAdjustment]) -> some View {
        let total = adjustments.reduce(0) { $0 + $1.amount }
        return card {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Adjustments")
                        .font(SPTypography.sectionHeader)
                        .foregroundStyle(Color.sp.ink)
                    if entries.count > 1 {
                        Text(entry.entryName)
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.slate)
                    }
                }
                Spacer()
                Text(total > 0 ? "+\(total)" : "\(total)")
                    .font(SPTypography.mono(size: 18, weight: .bold))
                    .foregroundStyle(total > 0 ? Color.sp.green : Color.sp.red)
            }

            Divider()

            ForEach(adjustments) { adj in
                HStack(alignment: .top, spacing: 10) {
                    Text(adj.amount > 0 ? "+\(adj.amount)" : "\(adj.amount)")
                        .font(SPTypography.mono(size: 14, weight: .bold))
                        .foregroundStyle(adj.amount > 0 ? Color.sp.green : Color.sp.red)
                        .frame(width: 44, alignment: .trailing)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(adj.reason)
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.ink)
                        Text(SPDateFormatter.long(adj.createdAt))
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.silver)
                    }

                    Spacer()

                    Button {
                        adjustmentToDelete = adj
                        showDeleteAdjustmentAlert = true
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 12))
                            .foregroundStyle(Color.sp.red)
                            .frame(width: 32, height: 32)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(10)
                .background(Color.sp.amberLight)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
            }
        }
    }

    // MARK: - Info Card

    private var infoCard: some View {
        card {
            sectionHeader("Details")

            infoRow("Role", value: member.isAdmin ? "Admin" : "Player")
            infoRow("Joined", value: SPDateFormatter.short(member.joinedAt))
            infoRow("Entry Fee", value: member.entryFeePaid ? "Paid" : "Unpaid")
            infoRow("Entries", value: "\(entries.count)")
        }
    }

    // MARK: - Admin Actions Card

    private var adminActionsCard: some View {
        card {
            sectionHeader("Actions")

            Button {
                toggleRole()
            } label: {
                HStack {
                    Image(systemName: member.isAdmin ? "arrow.down.circle" : "arrow.up.circle")
                        .foregroundStyle(Color.sp.primary)
                    Text(member.isAdmin ? "Demote to Player" : "Promote to Admin")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.primary)
                    Spacer()
                }
            }
            .buttonStyle(.plain)
            .disabled(isCurrentUser || (member.isAdmin && adminCount <= 1))

            Divider()

            Button(role: .destructive) {
                showRemoveAlert = true
            } label: {
                HStack {
                    Image(systemName: "person.badge.minus")
                    Text("Remove from Pool")
                        .font(SPTypography.body)
                    Spacer()
                }
            }
            .buttonStyle(.plain)
            .disabled(isCurrentUser || member.isAdmin)
        }
    }

    // MARK: - Helpers

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            content()
        }
        .padding(16)
        .spCard()
    }

    private func sectionHeader(_ title: String) -> some View {
        VStack(spacing: 10) {
            HStack {
                Text(title)
                    .font(SPTypography.sectionHeader)
                    .foregroundStyle(Color.sp.ink)
                Spacer()
            }
            Divider()
        }
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.slate)
            Spacer()
            Text(value)
                .font(SPTypography.cardTitle)
                .foregroundStyle(Color.sp.ink)
        }
    }

    private func statusPill(_ label: String, color: Color) -> some View {
        Text(label)
            .font(SPTypography.caption)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    // MARK: - Data Loading

    private func loadAdjustments() {
        Task {
            for entry in entries {
                do {
                    let adjustments = try await poolService.fetchAdjustments(entryId: entry.entryId)
                    adjustmentsByEntry[entry.entryId] = adjustments
                } catch {
                    print("[MemberDetail] Failed to load adjustments for \(entry.entryName): \(error)")
                }
            }
        }
    }

    // MARK: - Actions

    private func toggleRole() {
        let newRole = member.isAdmin ? "player" : "admin"
        isProcessing = true
        Task {
            do {
                try await poolService.updateMemberRole(memberId: member.memberId, role: newRole)
                isProcessing = false
            } catch {
                actionError = "Failed to update role: \(error.localizedDescription)"
                isProcessing = false
            }
        }
    }

    private func removeMemberAction() {
        isProcessing = true
        Task {
            do {
                try await poolService.removeMember(memberId: member.memberId)
                isProcessing = false
                dismiss()
            } catch {
                actionError = "Failed to remove member: \(error.localizedDescription)"
                isProcessing = false
            }
        }
    }

    private func isSubmitted(_ entry: Entry) -> Bool {
        entry.hasSubmittedPredictions && !unlockedEntryIds.contains(entry.entryId)
    }

    private func unlockEntryAction() {
        guard let entry = entryToUnlock else { return }
        // Optimistic update — show as unlocked immediately
        unlockedEntryIds.insert(entry.entryId)
        entryToUnlock = nil
        Task {
            do {
                try await poolService.unlockEntry(entryId: entry.entryId)
            } catch {
                // Revert optimistic update on failure
                unlockedEntryIds.remove(entry.entryId)
                actionError = "Failed to unlock entry: \(error.localizedDescription)"
            }
        }
    }

    private func saveAdjustment() {
        guard let entry = adjustEntry, let amount = Int(adjustAmount) else { return }
        isProcessing = true
        Task {
            do {
                try await poolService.adjustEntryPoints(
                    entryId: entry.entryId,
                    poolId: poolId,
                    adjustment: amount,
                    reason: adjustReason,
                    createdBy: currentUserId
                )
                isProcessing = false
                showAdjustSheet = false
                loadAdjustments()
                onAdjustmentChanged?()
            } catch {
                actionError = "Failed to adjust points: \(error.localizedDescription)"
                isProcessing = false
            }
        }
    }

    private func deleteAdjustmentAction() {
        guard let adj = adjustmentToDelete else { return }
        isProcessing = true
        Task {
            do {
                try await poolService.deleteAdjustment(adjustmentId: adj.id, entryId: adj.entryId, poolId: poolId)
                isProcessing = false
                adjustmentToDelete = nil
                loadAdjustments()
                onAdjustmentChanged?()
            } catch {
                actionError = "Failed to delete adjustment: \(error.localizedDescription)"
                isProcessing = false
                adjustmentToDelete = nil
            }
        }
    }

    // MARK: - Adjust Points Sheet

    private var adjustPointsSheet: some View {
        NavigationStack {
            Form {
                Section("Member") {
                    Text(member.users.fullName)
                }

                if entries.count > 1 {
                    Section("Entry") {
                        Picker("Entry", selection: $adjustEntry) {
                            ForEach(entries) { entry in
                                Text(entry.entryName).tag(Optional(entry))
                            }
                        }
                    }
                }

                Section("New Adjustment") {
                    TextField("Points (e.g. 5 or -3)", text: $adjustAmount)
                        .keyboardType(.numbersAndPunctuation)
                    TextField("Reason (required)", text: $adjustReason, axis: .vertical)
                        .lineLimit(3)
                }

                if let entry = adjustEntry {
                    let currentPoints = leaderboardData.first(where: { $0.entryId == entry.entryId })?.totalPoints ?? 0
                    let newAdj = Int(adjustAmount) ?? 0
                    Section("Preview") {
                        LabeledContent("Current Total", value: "\(currentPoints) pts")
                        LabeledContent("This Adjustment", value: newAdj >= 0 ? "+\(newAdj)" : "\(newAdj)")
                        LabeledContent("New Total", value: "\(currentPoints + newAdj) pts")
                            .fontWeight(.semibold)
                    }
                }
            }
            .navigationTitle("Adjust Points")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showAdjustSheet = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { saveAdjustment() }
                        .disabled(adjustReason.isEmpty || Int(adjustAmount) == nil || Int(adjustAmount) == 0 || isProcessing)
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Prediction Viewing

    private func loadMemberPredictions(entry: Entry) async {
        readOnlyEditVM = nil
        bracketPickerVM = nil

        if memberPredictionVM == nil {
            memberPredictionVM = PredictionsViewModel(poolId: poolId)
        }

        await memberPredictionVM?.loadPredictions(entryId: entry.entryId)

        let isBracket = pool?.predictionMode == .bracketPicker
        if isBracket {
            await setupBracketPickerVM(entry: entry)
        } else {
            setupReadOnlyVM(entry: entry)
        }
    }

    private func setupReadOnlyVM(entry: Entry) {
        guard readOnlyEditVM == nil, let predVM = memberPredictionVM else { return }

        let editVM = PredictionEditViewModel(poolId: poolId, matches: matches, teams: teams)
        editVM.setEntryId(entry.entryId)

        for pred in predVM.existingPredictions {
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

    private func setupBracketPickerVM(entry: Entry) async {
        guard bracketPickerVM == nil else { return }

        let bpVM = BracketPickerViewModel(poolId: poolId, matches: matches, teams: teams)
        bpVM.setEntryId(entry.entryId)
        bpVM.currentStep = .review
        await bpVM.loadExisting(entryId: entry.entryId)
        bracketPickerVM = bpVM
    }

    @ViewBuilder
    private func memberPredictionCover(entry: Entry) -> some View {
        let entryPoints = leaderboardData.first(where: { $0.entryId == entry.entryId })?.totalPoints ?? entry.totalPoints
        let isBracket = pool?.predictionMode == .bracketPicker

        ZStack {
            if isBracket, let bpVM = bracketPickerVM {
                BracketPickerWizardView(
                    viewModel: bpVM,
                    entry: entry,
                    readOnly: true,
                    readOnlyPoints: entryPoints,
                    onSubmitSuccess: {}
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(edges: .bottom)
            } else if !isBracket, let editVM = readOnlyEditVM {
                PredictionWizardView(
                    viewModel: editVM,
                    entry: entry,
                    initialStage: .summary,
                    readOnly: true,
                    readOnlyPoints: entryPoints
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .ignoresSafeArea(edges: .bottom)
            } else {
                ProgressView("Loading predictions...")
            }

            // Floating header
            VStack {
                HStack {
                    Button {
                        presentedPredictionEntry = nil
                        readOnlyEditVM = nil
                        bracketPickerVM = nil
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.body.weight(.semibold))
                            .frame(width: 36, height: 36)
                            .background(.ultraThinMaterial, in: Circle())
                    }

                    Spacer()

                    VStack(spacing: 2) {
                        Text(member.users.fullName)
                            .font(.headline)
                        Text(entry.entryName)
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.slate)
                    }

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
