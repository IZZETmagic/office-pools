import SwiftUI

struct PoolSettingsTabView: View {
    let pool: Pool?
    let currentUserId: String
    let poolService: PoolService
    var onPoolDeleted: (() -> Void)?

    // Editing state
    @State private var editName = ""
    @State private var editDescription = ""
    @State private var editStatus = "active"
    @State private var editIsPrivate = false
    @State private var editMaxEntries = 1
    @State private var editMaxParticipants = 0
    @State private var editDeadline = Date()
    @State private var isSaving = false
    @State private var saveMessage: (text: String, isError: Bool)?

    // Danger zone
    @State private var showArchiveAlert = false
    @State private var showDeleteAlert = false
    @State private var deleteConfirmText = ""
    @State private var isDeleting = false
    @State private var actionError: String?

    // Copy feedback
    @State private var copiedCode = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                Spacer().frame(height: 4)

                poolCodeCard
                poolDetailsCard
                deadlineCard
                entriesCard
                dangerZoneCard
            }
            .padding(.horizontal, 16)
            .padding(.bottom, hasChanges ? 80 : 24)
        }
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .bottom) {
            if hasChanges {
                HStack {
                    Text("Unsaved changes")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button {
                        saveSettings()
                    } label: {
                        HStack(spacing: 6) {
                            if isSaving {
                                ProgressView()
                                    .scaleEffect(0.7)
                                    .tint(.white)
                            }
                            Text("Save Changes")
                                .fontWeight(.semibold)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(Color.accentColor)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaving)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.ultraThinMaterial)

                if let msg = saveMessage {
                    HStack(spacing: 6) {
                        Image(systemName: msg.isError ? "xmark.circle.fill" : "checkmark.circle.fill")
                        Text(msg.text)
                    }
                    .font(.caption)
                    .foregroundStyle(msg.isError ? AppColors.error600 : AppColors.success600)
                    .padding(.bottom, 4)
                }
            }
        }
        .onAppear { initEditState() }
        .alert("Archive Pool", isPresented: $showArchiveAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Archive", role: .destructive) { archivePool() }
        } message: {
            Text("Members can still view results but no new predictions or changes will be allowed. You can reactivate later.")
        }
        .alert("Error", isPresented: .init(
            get: { actionError != nil },
            set: { if !$0 { actionError = nil } }
        )) {
            Button("OK") { actionError = nil }
        } message: {
            Text(actionError ?? "")
        }
        .alert("Delete Pool", isPresented: $showDeleteAlert) {
            TextField("Type pool name to confirm", text: $deleteConfirmText)
            Button("Cancel", role: .cancel) { deleteConfirmText = "" }
            Button("Delete", role: .destructive) { deletePool() }
                .disabled(deleteConfirmText != pool?.poolName)
        } message: {
            Text("Type \"\(pool?.poolName ?? "")\" to confirm. This will permanently delete the pool, all predictions, and all member data. This cannot be undone.")
        }
    }

    // MARK: - Card Builder (matches Rules tab)

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
        HStack {
            Text(title)
                .font(.caption.weight(.semibold))
                .textCase(.uppercase)
                .tracking(0.5)
                .foregroundStyle(.secondary)
            Spacer()
        }
    }

    private func settingsRow(_ label: String, value: some View) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            value
        }
    }

    // MARK: - Pool Code

    private var poolCodeCard: some View {
        card {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Pool Code")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(pool?.poolCode ?? "—")
                        .font(.system(.title2, design: .monospaced, weight: .bold))
                }

                Spacer()

                Button {
                    UIPasteboard.general.string = pool?.poolCode ?? ""
                    copiedCode = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        copiedCode = false
                    }
                } label: {
                    Label(copiedCode ? "Copied!" : "Copy", systemImage: copiedCode ? "checkmark" : "doc.on.doc")
                        .font(.subheadline.weight(.medium))
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
                .tint(copiedCode ? AppColors.success500 : AppColors.primary500)
            }
        }
    }

    // MARK: - Pool Details (Info + Privacy merged)

    private var poolDetailsCard: some View {
        card {
            HStack {
                sectionHeader("Pool Details")
                if let pool {
                    Text(modeLabel(pool.predictionMode))
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(AppColors.primary500.opacity(0.1))
                        .foregroundStyle(AppColors.primary600)
                        .clipShape(Capsule())
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Pool Name")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField("Pool Name", text: $editName)
                    .textFieldStyle(.plain)
                    .font(.body)
                Divider()
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Description")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField("Description (optional)", text: $editDescription, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.body)
                    .lineLimit(2...4)
                Divider()
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Status")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Picker("Status", selection: $editStatus) {
                    Text("Active").tag("active")
                    Text("Closed").tag("closed")
                    Text("Completed").tag("completed")
                }
                .pickerStyle(.segmented)

                Text(statusDescription)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Pool Visibility")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Picker("Visibility", selection: $editIsPrivate) {
                    Text("Public").tag(false)
                    Text("Private").tag(true)
                }
                .pickerStyle(.segmented)

                Text(editIsPrivate ? "Only people with the pool code can join." : "Anyone with the pool code can join.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            settingsRow("Max Members", value:
                HStack(spacing: 4) {
                    TextField("0", value: $editMaxParticipants, format: .number)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .font(.subheadline.weight(.bold))
                        .frame(width: 50)
                    Text(editMaxParticipants == 0 ? "(unlimited)" : "")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            )
        }
    }

    // MARK: - Prediction Deadline

    private var deadlineCard: some View {
        card {
            sectionHeader(pool?.predictionMode == .progressive ? "Group Stage Deadline" : "Prediction Deadline")

            if let pool, pool.predictionMode == .progressive {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "info.circle.fill")
                        .foregroundStyle(AppColors.primary500)
                        .font(.subheadline)
                    Text("Round deadlines are managed separately. This deadline applies to the initial group stage.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(AppColors.primary500.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            DatePicker("Deadline", selection: $editDeadline, displayedComponents: [.date, .hourAndMinute])
                .font(.subheadline)

            if let pool, let deadline = pool.predictionDeadline {
                let countdown = deadlineCountdown(deadline)
                if !countdown.isEmpty {
                    HStack(spacing: 6) {
                        Image(systemName: countdown.contains("passed") ? "exclamationmark.circle.fill" : "clock.fill")
                            .font(.caption)
                        Text(countdown)
                            .font(.caption)
                    }
                    .foregroundStyle(countdown.contains("passed") ? AppColors.error600 : AppColors.success600)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Quick Set")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    quickDeadlineButton("Tournament Start", date: tournamentStartDate)
                    quickDeadlineButton("1 Day Before", date: tournamentStartDate?.addingTimeInterval(-86400))
                    quickDeadlineButton("1 Week Before", date: tournamentStartDate?.addingTimeInterval(-604800))
                }
            }
        }
    }

    // MARK: - Prediction Entries

    private var entriesCard: some View {
        card {
            sectionHeader("Prediction Entries")

            Text("Allow members to submit multiple prediction entries. Each is scored independently on the leaderboard.")
                .font(.caption)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Text("Max Entries Per Member")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack(spacing: 0) {
                    ForEach(1...10, id: \.self) { n in
                        Button {
                            editMaxEntries = n
                        } label: {
                            Text("\(n)")
                                .font(.subheadline.weight(editMaxEntries == n ? .bold : .regular))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(editMaxEntries == n ? Color.accentColor : Color(.tertiarySystemFill))
                                .foregroundStyle(editMaxEntries == n ? .white : .primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            if editMaxEntries > 1 {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "info.circle.fill")
                        .foregroundStyle(AppColors.primary500)
                        .font(.subheadline)
                    Text("Members can create up to \(editMaxEntries) entries (e.g. \"Serious\", \"Fun\"). Each appears as its own row on the leaderboard.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(AppColors.primary500.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Danger Zone

    private var dangerZoneCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Danger Zone")

            Button {
                showArchiveAlert = true
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "archivebox")
                        .font(.body)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Archive Pool")
                            .font(.subheadline.weight(.medium))
                        Text("Preserve data but prevent new activity")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                .padding(.vertical, 4)
                .foregroundStyle(AppColors.warning600)
            }
            .buttonStyle(.plain)

            Button {
                showDeleteAlert = true
            } label: {
                HStack(spacing: 12) {
                    if isDeleting {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "trash")
                            .font(.body)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Delete Pool")
                            .font(.subheadline.weight(.medium))
                        Text("Permanently delete pool and all data")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                .padding(.vertical, 4)
                .foregroundStyle(AppColors.error600)
            }
            .buttonStyle(.plain)
            .disabled(isDeleting)
        }
        .padding(16)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(AppColors.error500.opacity(0.15), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    // MARK: - Init State

    private func initEditState() {
        guard let pool else { return }
        editName = pool.poolName
        editDescription = pool.description ?? ""
        editStatus = pool.status
        editIsPrivate = pool.isPrivate
        editMaxEntries = pool.maxEntriesPerUser
        editMaxParticipants = pool.maxParticipants ?? 0
        if let deadline = pool.predictionDeadline {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            editDeadline = formatter.date(from: deadline) ?? Date()
        }
    }

    // MARK: - Computed

    private var hasChanges: Bool {
        guard let pool else { return false }
        return editName != pool.poolName
            || editDescription != (pool.description ?? "")
            || editStatus != pool.status
            || editIsPrivate != pool.isPrivate
            || editMaxEntries != pool.maxEntriesPerUser
            || editMaxParticipants != (pool.maxParticipants ?? 0)
    }

    private var statusDescription: String {
        switch editStatus {
        case "active": return "Pool is open and accepting new members."
        case "closed": return "Pool is closed to new members."
        case "completed": return "Tournament is over. No new activity allowed."
        default: return ""
        }
    }

    private var tournamentStartDate: Date? {
        var components = DateComponents()
        components.year = 2026
        components.month = 6
        components.day = 11
        components.hour = 13
        components.minute = 0
        return Calendar.current.date(from: components)
    }

    // MARK: - Actions

    private func saveSettings() {
        guard let pool else { return }
        isSaving = true
        saveMessage = nil

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
                saveMessage = (text: "Settings saved", isError: false)
                isSaving = false
            } catch {
                saveMessage = (text: error.localizedDescription, isError: true)
                isSaving = false
            }
        }
    }

    private func archivePool() {
        guard let pool else { return }
        Task {
            do {
                try await poolService.updatePool(poolId: pool.poolId, updates: PoolUpdatePayload(status: "completed"))
                editStatus = "completed"
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

    private func quickDeadlineButton(_ label: String, date: Date?) -> some View {
        Button {
            if let date { editDeadline = date }
        } label: {
            Text(label)
                .font(.caption2.weight(.medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color(.tertiarySystemFill))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func modeLabel(_ mode: PredictionMode) -> String {
        switch mode {
        case .fullTournament: return "Full Tournament"
        case .progressive: return "Progressive"
        case .bracketPicker: return "Bracket Picker"
        }
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
