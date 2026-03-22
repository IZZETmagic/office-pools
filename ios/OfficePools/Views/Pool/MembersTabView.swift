import SwiftUI

struct MembersTabView: View {
    let members: [Member]
    let leaderboardData: [LeaderboardEntryData]
    let currentUserId: String
    let poolService: PoolService

    @State private var searchText = ""
    @State private var showAdjustSheet = false
    @State private var adjustMember: Member?
    @State private var adjustEntry: Entry?
    @State private var adjustAmount = ""
    @State private var adjustReason = ""
    @State private var isProcessing = false
    @State private var actionError: String?
    @State private var showRemoveAlert = false
    @State private var memberToRemove: Member?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                Spacer().frame(height: 12)

                // Search bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search members...", text: $searchText)
                        .textFieldStyle(.plain)
                }
                .padding(10)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .padding(.horizontal, 16)
                .padding(.bottom, 12)

                // Member count
                HStack {
                    Text("\(members.count) Members")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 8)

                // Member list card
                VStack(spacing: 0) {
                    ForEach(Array(filteredMembers.enumerated()), id: \.element.id) { index, member in
                        memberRow(member)

                        if index < filteredMembers.count - 1 {
                            Divider()
                                .padding(.leading, 60)
                        }
                    }
                }
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .background(Color(.systemGroupedBackground))
        .sheet(isPresented: $showAdjustSheet) {
            adjustPointsSheet
        }
        .alert("Remove Member", isPresented: $showRemoveAlert) {
            Button("Cancel", role: .cancel) { memberToRemove = nil }
            Button("Remove", role: .destructive) {
                if let member = memberToRemove { removeMemberAction(member) }
            }
        } message: {
            Text("Remove \(memberToRemove?.users.fullName ?? "this member") from the pool? Their predictions will be deleted.")
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

    // MARK: - Filtered Members

    private var filteredMembers: [Member] {
        let sorted = members.sorted { a, b in
            let aPoints = memberBestPoints(a)
            let bPoints = memberBestPoints(b)
            if aPoints != bPoints { return aPoints > bPoints }
            return a.users.fullName < b.users.fullName
        }
        if searchText.isEmpty { return sorted }
        let query = searchText.lowercased()
        return sorted.filter {
            $0.users.username.lowercased().contains(query)
            || $0.users.fullName.lowercased().contains(query)
        }
    }

    // MARK: - Member Row

    private func memberRow(_ member: Member) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                // Avatar circle
                ZStack {
                    Circle()
                        .fill(member.isAdmin ? Color.purple.opacity(0.15) : Color.blue.opacity(0.1))
                        .frame(width: 40, height: 40)
                    Text(String(member.users.fullName.prefix(1)).uppercased())
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(member.isAdmin ? .purple : .blue)
                }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(member.users.fullName)
                            .font(.subheadline.weight(.medium))
                        if member.isAdmin {
                            Text("ADMIN")
                                .font(.system(size: 8, weight: .bold))
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

                // Points
                let bestPoints = memberBestPoints(member)
                if bestPoints > 0 {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("\(bestPoints)")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.blue)
                        Text("pts")
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Entry info
            let entryList = member.entries ?? []
            if !entryList.isEmpty {
                HStack(spacing: 8) {
                    let submitted = entryList.filter(\.hasSubmittedPredictions).count
                    Text("\(entryList.count) \(entryList.count == 1 ? "entry" : "entries")")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    statusPill(
                        submitted == entryList.count ? "Submitted" : (submitted > 0 ? "Partial" : "Pending"),
                        color: submitted == entryList.count ? .green : (submitted > 0 ? .orange : .gray)
                    )
                }
                .padding(.leading, 50)
            }

            // Admin actions (don't show for yourself)
            if member.userId != currentUserId {
                adminActionsRow(member)
                    .padding(.leading, 50)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Admin Actions

    private func adminActionsRow(_ member: Member) -> some View {
        HStack(spacing: 8) {
            Button {
                toggleRole(member)
            } label: {
                Label(member.isAdmin ? "Demote" : "Promote",
                      systemImage: member.isAdmin ? "arrow.down.circle" : "arrow.up.circle")
                    .font(.caption)
                    .foregroundStyle(member.isAdmin ? .orange : .green)
            }
            .disabled(member.isAdmin && adminCount <= 1)

            Divider().frame(height: 16)

            if let firstEntry = member.entries?.first {
                Button {
                    adjustMember = member
                    adjustEntry = firstEntry
                    adjustAmount = "\(firstEntry.pointAdjustment)"
                    adjustReason = firstEntry.adjustmentReason ?? ""
                    showAdjustSheet = true
                } label: {
                    Label("Adjust", systemImage: "plusminus")
                        .font(.caption)
                        .foregroundStyle(.blue)
                }

                Divider().frame(height: 16)
            }

            if !member.isAdmin {
                Button {
                    memberToRemove = member
                    showRemoveAlert = true
                } label: {
                    Label("Remove", systemImage: "person.badge.minus")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
    }

    private var adminCount: Int {
        members.filter(\.isAdmin).count
    }

    private func memberBestPoints(_ member: Member) -> Int {
        let entryIds = (member.entries ?? []).map(\.entryId)
        return leaderboardData
            .filter { entryIds.contains($0.entryId) }
            .map(\.totalPoints)
            .max() ?? 0
    }

    // MARK: - Helpers

    private func statusPill(_ label: String, color: Color) -> some View {
        Text(label)
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    // MARK: - Adjust Points Sheet

    private var adjustPointsSheet: some View {
        NavigationStack {
            Form {
                if let member = adjustMember {
                    Section("Member") {
                        Text(member.users.fullName)
                    }

                    if let entries = member.entries, entries.count > 1 {
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

    // MARK: - Actions

    private func toggleRole(_ member: Member) {
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

    private func removeMemberAction(_ member: Member) {
        isProcessing = true
        Task {
            do {
                try await poolService.removeMember(memberId: member.memberId)
                isProcessing = false
                memberToRemove = nil
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
}
