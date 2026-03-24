import SwiftUI

struct MemberDetailView: View {
    let member: Member
    let leaderboardData: [LeaderboardEntryData]
    let currentUserId: String
    let poolService: PoolService
    let adminCount: Int

    @State private var showAdjustSheet = false
    @State private var adjustEntry: Entry?
    @State private var adjustAmount = ""
    @State private var adjustReason = ""
    @State private var isProcessing = false
    @State private var actionError: String?
    @State private var showRemoveAlert = false
    @Environment(\.dismiss) private var dismiss

    @State private var headerHeight: CGFloat = 80

    private var isCurrentUser: Bool { member.userId == currentUserId }
    private var entries: [Entry] { member.entries ?? [] }

    var body: some View {
        ZStack(alignment: .top) {
            // Scrollable content
            ScrollView {
                LazyVStack(spacing: 16) {
                    // MARK: - Info
                    infoCard

                    // MARK: - Entries
                    if !entries.isEmpty {
                        entriesCard
                    }

                    // MARK: - Admin Actions
                    adminActionsCard
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
        .sheet(isPresented: $showAdjustSheet) {
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
        .alert("Error", isPresented: .init(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK") { actionError = nil }
        } message: {
            Text(actionError ?? "")
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
                        .fill(member.isAdmin ? Color.purple.opacity(0.15) : Color.blue.opacity(0.1))
                        .frame(width: 40, height: 40)
                        .overlay(
                            Text(String(member.users.fullName.prefix(1)).uppercased())
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(member.isAdmin ? .purple : .blue)
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
                                .background(Color.purple.opacity(0.15))
                                .foregroundStyle(.purple)
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
        case 1: return .orange
        case 2: return .gray
        case 3: return .brown
        default: return .blue
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
                            color: entry.hasSubmittedPredictions ? .green : .gray
                        )
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
                        .foregroundStyle(.blue)
                    Text(member.isAdmin ? "Demote to Player" : "Promote to Admin")
                        .font(.subheadline)
                        .foregroundStyle(.blue)
                    Spacer()
                }
            }
            .buttonStyle(.plain)
            .disabled(isCurrentUser || (member.isAdmin && adminCount <= 1))

            Divider()

            // Adjust Points
            if let firstEntry = entries.first {
                Button {
                    adjustEntry = firstEntry
                    adjustAmount = "\(firstEntry.pointAdjustment)"
                    adjustReason = firstEntry.adjustmentReason ?? ""
                    showAdjustSheet = true
                } label: {
                    HStack {
                        Image(systemName: "plusminus")
                            .foregroundStyle(.orange)
                        Text("Adjust Points")
                            .font(.subheadline)
                            .foregroundStyle(.orange)
                        Spacer()
                    }
                }
                .buttonStyle(.plain)

                Divider()
            }

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

    private func saveAdjustment() {
        guard let entry = adjustEntry, let amount = Int(adjustAmount) else { return }
        isProcessing = true
        Task {
            do {
                try await poolService.adjustEntryPoints(entryId: entry.entryId, adjustment: amount, reason: adjustReason)
                isProcessing = false
                showAdjustSheet = false
            } catch {
                actionError = "Failed to adjust points: \(error.localizedDescription)"
                isProcessing = false
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

                Section("Adjustment") {
                    TextField("Points (e.g. 5 or -3)", text: $adjustAmount)
                        .keyboardType(.numbersAndPunctuation)
                    TextField("Reason (required)", text: $adjustReason, axis: .vertical)
                        .lineLimit(3)
                }

                if let entry = adjustEntry {
                    let currentPoints = leaderboardData.first(where: { $0.entryId == entry.entryId })?.totalPoints ?? 0
                    let adj = Int(adjustAmount) ?? 0
                    Section("Preview") {
                        LabeledContent("Current Points", value: "\(currentPoints)")
                        LabeledContent("Adjustment", value: adj >= 0 ? "+\(adj)" : "\(adj)")
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
                        .disabled(adjustReason.isEmpty || Int(adjustAmount) == nil || isProcessing)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
