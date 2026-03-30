import SwiftUI

struct MemberDetailView: View {
    let member: Member
    let leaderboardData: [LeaderboardEntryData]
    let currentUserId: String
    let poolId: String
    let poolService: PoolService
    let adminCount: Int
    let currentUserIsAdmin: Bool

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
    @Environment(\.dismiss) private var dismiss

    @State private var headerHeight: CGFloat = 80

    /// Adjustment history keyed by entryId
    @State private var adjustmentsByEntry: [String: [PointAdjustment]] = [:]

    private var isCurrentUser: Bool { member.userId == currentUserId }
    private var entries: [Entry] { member.entries ?? [] }

    var body: some View {
        ZStack(alignment: .top) {
            // Scrollable content
            ScrollView {
                LazyVStack(spacing: 16) {
                    // MARK: - Info
                    infoCard

                    // MARK: - Entries with adjustments
                    if !entries.isEmpty {
                        entriesCard
                    }

                    // MARK: - Point Adjustments History (per entry)
                    if currentUserIsAdmin {
                        ForEach(entries) { entry in
                            let adjustments = adjustmentsByEntry[entry.entryId] ?? []
                            if !adjustments.isEmpty {
                                adjustmentsCard(entry: entry, adjustments: adjustments)
                            }
                        }
                    }

                    // MARK: - Admin Actions
                    if currentUserIsAdmin {
                        adminActionsCard
                    }
                }
                .padding(.top, headerHeight + 16)
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))

            // Fixed header (glass)
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
                // Rank badge (like PointsBreakdownView)
                if let rank = bestRank {
                    Text("#\(rank)")
                        .font(.title3.weight(.black).monospacedDigit())
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(rankColor(rank))
                        .clipShape(Circle())
                } else {
                    Circle()
                        .fill(member.isAdmin ? AppColors.neutral600.opacity(0.15) : AppColors.primary500.opacity(0.1))
                        .frame(width: 40, height: 40)
                        .overlay(
                            Text(String(member.users.fullName.prefix(1)).uppercased())
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(member.isAdmin ? AppColors.neutral600 : AppColors.primary500)
                        )
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(member.users.fullName)
                            .font(.headline.weight(.bold))
                        if member.isAdmin {
                            Text("ADMIN")
                                .font(.system(size: 9, weight: .bold))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(AppColors.neutral600.opacity(0.15))
                                .foregroundStyle(AppColors.neutral600)
                                .clipShape(Capsule())
                        }
                    }
                    Text("@\(member.users.username)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
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

    private func rankColor(_ rank: Int) -> Color {
        switch rank {
        case 1: return AppColors.accent300
        case 2: return AppColors.neutral400
        case 3: return AppColors.bronze
        default: return AppColors.primary500
        }
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
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("\(points) pts")
                            .font(.subheadline.weight(.bold))
                        statusPill(
                            entry.hasSubmittedPredictions ? "Submitted" : "Pending",
                            color: entry.hasSubmittedPredictions ? AppColors.success600 : AppColors.neutral400
                        )
                        if entry.hasSubmittedPredictions && currentUserIsAdmin {
                            Button {
                                entryToUnlock = entry
                                showUnlockAlert = true
                            } label: {
                                Image(systemName: "lock.open")
                                    .font(.caption)
                                    .foregroundStyle(AppColors.warning600)
                                    .frame(width: 36, height: 36)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    // Adjust points button per entry (admin only)
                    if currentUserIsAdmin {
                        Button {
                            adjustEntry = entry
                            adjustAmount = ""
                            adjustReason = ""
                            showAdjustSheet = true
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "plusminus")
                                    .font(.caption2)
                                Text("Adjust Points")
                                    .font(.caption)
                            }
                            .foregroundStyle(AppColors.warning600)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(AppColors.warning600.opacity(0.1))
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                    }

                    if entry.hasSubmittedPredictions, let submittedAt = entry.predictionsSubmittedAt {
                        HStack {
                            Spacer()
                            Text(formattedDateTime(submittedAt))
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
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
                        .font(.headline)
                    if entries.count > 1 {
                        Text(entry.entryName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Text(total > 0 ? "+\(total)" : "\(total)")
                    .font(.headline.weight(.bold).monospacedDigit())
                    .foregroundStyle(total > 0 ? AppColors.success600 : AppColors.error600)
            }

            Divider()

            ForEach(adjustments) { adj in
                HStack(alignment: .top, spacing: 10) {
                    Text(adj.amount > 0 ? "+\(adj.amount)" : "\(adj.amount)")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                        .foregroundStyle(adj.amount > 0 ? AppColors.success600 : AppColors.error600)
                        .frame(width: 44, alignment: .trailing)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(adj.reason)
                            .font(.subheadline)
                        Text(formattedDateTime(adj.createdAt))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }

                    Spacer()

                    // Delete button
                    Button {
                        adjustmentToDelete = adj
                        showDeleteAdjustmentAlert = true
                    } label: {
                        Image(systemName: "trash")
                            .font(.caption)
                            .foregroundStyle(AppColors.error600)
                            .frame(width: 32, height: 32)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(10)
                .background(AppColors.warning600.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Info Card

    private var infoCard: some View {
        card {
            sectionHeader("Details")

            infoRow("Role", value: member.isAdmin ? "Admin" : "Player")
            infoRow("Joined", value: formattedDate(member.joinedAt))
            infoRow("Entry Fee", value: member.entryFeePaid ? "Paid" : "Unpaid")
            infoRow("Entries", value: "\(entries.count)")
        }
    }

    // MARK: - Admin Actions Card

    private var adminActionsCard: some View {
        card {
            sectionHeader("Actions")

            // Promote / Demote
            Button {
                toggleRole()
            } label: {
                HStack {
                    Image(systemName: member.isAdmin ? "arrow.down.circle" : "arrow.up.circle")
                        .foregroundStyle(AppColors.primary600)
                    Text(member.isAdmin ? "Demote to Player" : "Promote to Admin")
                        .font(.subheadline)
                        .foregroundStyle(AppColors.primary600)
                    Spacer()
                }
            }
            .buttonStyle(.plain)
            .disabled(isCurrentUser || (member.isAdmin && adminCount <= 1))

            Divider()

            // Remove
            Button(role: .destructive) {
                showRemoveAlert = true
            } label: {
                HStack {
                    Image(systemName: "person.badge.minus")
                    Text("Remove from Pool")
                        .font(.subheadline)
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
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private func sectionHeader(_ title: String) -> some View {
        VStack(spacing: 10) {
            HStack {
                Text(title)
                    .font(.headline)
                Spacer()
            }
            Divider()
        }
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline.weight(.medium))
        }
    }

    private func detailLabel(_ label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.subheadline.weight(.bold))
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func statusPill(_ label: String, color: Color) -> some View {
        Text(label)
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private func formattedDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: dateString) else {
            // Try without fractional seconds
            formatter.formatOptions = [.withInternetDateTime]
            guard let date = formatter.date(from: dateString) else { return dateString }
            return formatDate(date)
        }
        return formatDate(date)
    }

    private func formatDate(_ date: Date) -> String {
        let display = DateFormatter()
        display.dateFormat = "MMM d, yyyy"
        return display.string(from: date)
    }

    private func formattedDateTime(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: dateString) ?? {
            formatter.formatOptions = [.withInternetDateTime]
            return formatter.date(from: dateString)
        }()
        guard let date else { return dateString }
        let display = DateFormatter()
        display.dateFormat = "MMM d, yyyy 'at' h:mm a"
        return display.string(from: date)
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

    private func unlockEntryAction() {
        guard let entry = entryToUnlock else { return }
        isProcessing = true
        Task {
            do {
                try await poolService.unlockEntry(entryId: entry.entryId)
                isProcessing = false
                entryToUnlock = nil
            } catch {
                actionError = "Failed to unlock entry: \(error.localizedDescription)"
                isProcessing = false
                entryToUnlock = nil
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
                // Refresh adjustment history
                loadAdjustments()
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
                // Refresh adjustment history
                loadAdjustments()
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
}
