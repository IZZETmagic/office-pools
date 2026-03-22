import SwiftUI

struct PoolSettingsTabView: View {
    let pool: Pool?
    let currentUserId: String
    let poolService: PoolService
    var onPoolDeleted: (() -> Void)?

    // Admin editing state
    @State private var editName = ""
    @State private var editDescription = ""
    @State private var editStatus = "active"
    @State private var editIsPrivate = false
    @State private var editMaxEntries = 1
    @State private var editDeadline = Date()
    @State private var isSaving = false
    @State private var saveError: String?

    // Danger zone
    @State private var showArchiveAlert = false
    @State private var showDeleteAlert = false
    @State private var deleteConfirmText = ""
    @State private var isDeleting = false
    @State private var actionError: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                Spacer().frame(height: 4)

                // Pool Info
                if let pool {
                    poolInfoCard(pool)
                }

                // Edit Pool Settings
                if let pool {
                    adminSettingsCard(pool)
                }

                // Danger Zone
                dangerZoneCard()
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Color(.systemGroupedBackground))
        .onAppear { initEditState() }
        .alert("Archive Pool", isPresented: $showArchiveAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Archive", role: .destructive) { archivePool() }
        } message: {
            Text("This will mark the pool as completed. Members can still view results but no new activity will be allowed.")
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

    private func initEditState() {
        guard let pool else { return }
        editName = pool.poolName
        editDescription = pool.description ?? ""
        editStatus = pool.status
        editIsPrivate = pool.isPrivate
        editMaxEntries = pool.maxEntriesPerUser
        if let deadline = pool.predictionDeadline {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            editDeadline = formatter.date(from: deadline) ?? Date()
        }
    }

    // MARK: - Pool Info Card (All Members)

    private func poolInfoCard(_ pool: Pool) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Pool Info", icon: "info.circle")

            // Pool code row with copy
            HStack {
                Text("Pool Code")
                    .foregroundStyle(.secondary)
                Spacer()
                Text(pool.poolCode)
                    .font(.system(.body, design: .monospaced, weight: .semibold))
                Button {
                    UIPasteboard.general.string = pool.poolCode
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.caption)
                        .foregroundStyle(.blue)
                }
            }

            Divider()

            infoRow("Name", value: pool.poolName)
            if let desc = pool.description, !desc.isEmpty {
                infoRow("Description", value: desc)
            }

            Divider()

            HStack(spacing: 12) {
                infoBadge(modeLabel(pool.predictionMode), color: .blue)
                infoBadge(statusLabel(pool.status), color: statusColor(pool.status))
                if pool.isPrivate {
                    infoBadge("Private", color: .orange)
                } else {
                    infoBadge("Public", color: .green)
                }
            }

            Divider()

            // Member count omitted — see Members tab
            infoRow("Max Entries", value: "\(pool.maxEntriesPerUser) per member")

            if let deadline = pool.predictionDeadline {
                Divider()
                VStack(alignment: .leading, spacing: 4) {
                    infoRow("Deadline", value: formatDeadline(deadline))
                    let remaining = deadlineCountdown(deadline)
                    if !remaining.isEmpty {
                        Text(remaining)
                            .font(.caption)
                            .foregroundStyle(remaining.contains("ago") ? .red : .green)
                    }
                }
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    // MARK: - Scoring Rules Card (All Members)



    // MARK: - Admin Settings Card

    private func adminSettingsCard(_ pool: Pool) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Edit Settings", icon: "gearshape")

            VStack(alignment: .leading, spacing: 8) {
                Text("Pool Name").font(.caption).foregroundStyle(.secondary)
                TextField("Pool Name", text: $editName)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Description").font(.caption).foregroundStyle(.secondary)
                TextField("Description (optional)", text: $editDescription, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(3)
            }

            Divider()

            // Status
            VStack(alignment: .leading, spacing: 8) {
                Text("Status").font(.caption).foregroundStyle(.secondary)
                Picker("Status", selection: $editStatus) {
                    Text("Active").tag("active")
                    Text("Closed").tag("closed")
                    Text("Completed").tag("completed")
                }
                .pickerStyle(.segmented)
            }

            Divider()

            // Deadline
            VStack(alignment: .leading, spacing: 8) {
                Text("Prediction Deadline").font(.caption).foregroundStyle(.secondary)
                DatePicker("Deadline", selection: $editDeadline, displayedComponents: [.date, .hourAndMinute])
                    .labelsHidden()
            }

            Divider()

            // Privacy
            Toggle("Private Pool", isOn: $editIsPrivate)

            // Max Entries
            HStack {
                Text("Max Entries Per Member")
                Spacer()
                Stepper("\(editMaxEntries)", value: $editMaxEntries, in: 1...10)
            }

            Divider()

            // Save button
            Button {
                saveSettings()
            } label: {
                HStack {
                    if isSaving {
                        ProgressView()
                            .scaleEffect(0.8)
                    }
                    Text("Save Changes")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(hasChanges ? Color.blue : Color.gray.opacity(0.3))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .disabled(!hasChanges || isSaving)

            if let saveError {
                Text(saveError)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    private var hasChanges: Bool {
        guard let pool else { return false }
        return editName != pool.poolName
            || editDescription != (pool.description ?? "")
            || editStatus != pool.status
            || editIsPrivate != pool.isPrivate
            || editMaxEntries != pool.maxEntriesPerUser
    }

    // MARK: - Danger Zone

    private func dangerZoneCard() -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader("Danger Zone", icon: "exclamationmark.triangle")

            Button {
                showArchiveAlert = true
            } label: {
                HStack {
                    Image(systemName: "archivebox")
                    Text("Archive Pool")
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.orange.opacity(0.1))
                .foregroundStyle(.orange)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            VStack(spacing: 8) {
                Button {
                    showDeleteAlert = true
                } label: {
                    HStack {
                        if isDeleting {
                            ProgressView().scaleEffect(0.8)
                        }
                        Image(systemName: "trash")
                        Text("Delete Pool")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.red.opacity(0.1))
                    .foregroundStyle(.red)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .disabled(isDeleting)

                Text("This will permanently delete the pool and all predictions for all members.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.red.opacity(0.2), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        .alert("Delete Pool", isPresented: $showDeleteAlert) {
            TextField("Type pool name to confirm", text: $deleteConfirmText)
            Button("Cancel", role: .cancel) { deleteConfirmText = "" }
            Button("Delete", role: .destructive) { deletePool() }
                .disabled(deleteConfirmText != pool?.poolName)
        } message: {
            Text("Type \"\(pool?.poolName ?? "")\" to confirm. This action cannot be undone.")
        }
    }

    // MARK: - Actions

    private func saveSettings() {
        guard let pool else { return }
        isSaving = true
        saveError = nil

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]

        let payload = PoolUpdatePayload(
            poolName: editName != pool.poolName ? editName : nil,
            description: editDescription != (pool.description ?? "") ? editDescription : nil,
            status: editStatus != pool.status ? editStatus : nil,
            isPrivate: editIsPrivate != pool.isPrivate ? editIsPrivate : nil,
            maxEntriesPerUser: editMaxEntries != pool.maxEntriesPerUser ? editMaxEntries : nil,
            predictionDeadline: formatter.string(from: editDeadline)
        )

        Task {
            do {
                try await poolService.updatePool(poolId: pool.poolId, updates: payload)
                isSaving = false
            } catch {
                saveError = error.localizedDescription
                isSaving = false
            }
        }
    }

    private func archivePool() {
        guard let pool else { return }
        Task {
            do {
                try await poolService.updatePool(poolId: pool.poolId, updates: PoolUpdatePayload(status: "completed"))
            } catch {
                actionError = "Failed to archive: \(error.localizedDescription)"
            }
        }
    }

    private func deletePool() {
        guard let pool, deleteConfirmText == pool.poolName else { return }
        isDeleting = true
        Task {
            do {
                try await poolService.deletePool(poolId: pool.poolId)
                isDeleting = false
                onPoolDeleted?()
            } catch {
                actionError = "Failed to delete: \(error.localizedDescription)"
                isDeleting = false
            }
        }
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String, icon: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.blue)
            Text(title)
                .font(.headline)
            Spacer()
        }
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .fontWeight(.medium)
        }
        .font(.subheadline)
    }

    private func infoBadge(_ label: String, color: Color) -> some View {
        Text(label)
            .font(.system(size: 10, weight: .semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

private func modeLabel(_ mode: PredictionMode) -> String {
        switch mode {
        case .fullTournament: return "Full Tournament"
        case .progressive: return "Progressive"
        case .bracketPicker: return "Bracket Picker"
        }
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "active": return "Active"
        case "closed": return "Closed"
        case "completed": return "Completed"
        case "archived": return "Archived"
        default: return status.capitalized
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "active": return .green
        case "closed": return .orange
        case "completed", "archived": return .gray
        default: return .gray
        }
    }

    private func formatDeadline(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: iso) else { return iso }
        let df = DateFormatter()
        df.dateStyle = .medium
        df.timeStyle = .short
        return df.string(from: date)
    }

    private func deadlineCountdown(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: iso) else { return "" }
        let now = Date()
        if date < now { return "Deadline passed" }
        let diff = Calendar.current.dateComponents([.day, .hour], from: now, to: date)
        let days = diff.day ?? 0
        let hours = diff.hour ?? 0
        if days > 0 { return "\(days)d \(hours)h remaining" }
        return "\(hours)h remaining"
    }
}
