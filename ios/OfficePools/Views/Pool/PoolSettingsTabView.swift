import SwiftUI
import CoreImage.CIFilterBuiltins

struct PoolSettingsTabView: View {
    let pool: Pool?
    let settings: PoolSettings?
    let currentUserId: String
    let poolService: PoolService
    var onPoolDeleted: (() -> Void)?
    var onScoringSettingsSaved: (() async -> Void)?

    // Editing state
    @State private var editName = ""
    @State private var editDescription = ""
    @State private var editStatus = "open"
    @State private var editIsPrivate = false
    @State private var editMaxEntries = 1
    @State private var editMaxParticipants = 0
    @State private var editDeadline = Date()

    // Snapshot of last-saved values (used for hasChanges comparison)
    @State private var savedName = ""
    @State private var savedDescription = ""
    @State private var savedStatus = "open"
    @State private var savedIsPrivate = false
    @State private var savedMaxEntries = 1
    @State private var savedMaxParticipants = 0
    @State private var savedDeadline: Date?

    @State private var isSaving = false
    @State private var showSaveSuccess = false

    // Danger zone & errors
    @State private var showArchiveAlert = false
    @State private var showDeleteAlert = false
    @State private var deleteConfirmText = ""
    @State private var isDeleting = false
    @State private var actionError: String?

    // Copy & share feedback
    @State private var copiedCode = false
    @State private var copiedLink = false
    @State private var showQRFullScreen = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                Spacer().frame(height: 4)

                poolCodeCard
                poolInfoCard
                statusCard
                visibilityCard
                maxMembersCard
                deadlineCard
                entriesCard
                scoringConfigCard
                dangerZoneCard
            }
            .padding(.horizontal, 16)
            .padding(.bottom, hasChanges ? 80 : 24)
        }
        .background(Color.sp.snow)
        .safeAreaInset(edge: .bottom) {
            if hasChanges || showSaveSuccess {
                Button {
                    saveSettings()
                } label: {
                    HStack(spacing: 8) {
                        if isSaving {
                            ProgressView()
                                .scaleEffect(0.7)
                                .tint(Color.sp.primary)
                        }
                        if showSaveSuccess {
                            Image(systemName: "checkmark")
                                .fontWeight(.bold)
                            Text("Saved")
                                .font(SPTypography.cardTitle)
                        } else {
                            Text("Save Changes")
                                .font(SPTypography.cardTitle)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background {
                        (showSaveSuccess ? Color.sp.green : Color.sp.primary).opacity(0.2)
                    }
                    .background(.ultraThinMaterial)
                    .foregroundStyle(showSaveSuccess ? Color.sp.green : Color.sp.primary)
                    .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                    .shadow(color: (showSaveSuccess ? Color.sp.green : Color.sp.primary).opacity(0.3), radius: 8, y: 4)
                }
                .buttonStyle(.plain)
                .disabled(isSaving || showSaveSuccess)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .animation(.easeInOut(duration: 0.2), value: showSaveSuccess)
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

    // MARK: - Card Builder

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            content()
        }
        .padding(16)
        .spCard()
    }

    private func sectionHeader(_ title: String) -> some View {
        HStack {
            Text(title)
                .spCaption()
                .foregroundStyle(Color.sp.slate)
            Spacer()
        }
    }

    private func settingsRow(_ label: String, value: some View) -> some View {
        HStack {
            Text(label)
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.slate)
            Spacer()
            value
        }
    }

    // MARK: - Pool Code & Share

    private var joinURL: String {
        "https://sportpool.io/join/\(pool?.poolCode ?? "")"
    }

    private var poolCodeCard: some View {
        card {
            sectionHeader("Share & Invite")

            // Pool code display
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Pool Code")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                    Text(pool?.poolCode ?? "—")
                        .font(SPTypography.mono(size: 22, weight: .bold))
                        .foregroundStyle(Color.sp.ink)
                }
                Spacer()
            }

            // QR Code
            if let qrImage = generateQRCode(from: joinURL) {
                Button {
                    showQRFullScreen = true
                } label: {
                    VStack(spacing: 8) {
                        Image(uiImage: qrImage)
                            .interpolation(.none)
                            .resizable()
                            .scaledToFit()
                            .frame(height: 180)
                            .padding(12)
                            .background(Color.sp.surface)
                            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))

                        Text("Tap to enlarge")
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.slate)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }

            // Action buttons
            HStack(spacing: 10) {
                shareButton(
                    label: copiedCode ? "Copied!" : "Copy Code",
                    icon: copiedCode ? "checkmark" : "doc.on.doc",
                    isActive: copiedCode
                ) {
                    UIPasteboard.general.string = pool?.poolCode ?? ""
                    copiedCode = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copiedCode = false }
                }

                shareButton(
                    label: copiedLink ? "Copied!" : "Copy Link",
                    icon: copiedLink ? "checkmark" : "link",
                    isActive: copiedLink
                ) {
                    UIPasteboard.general.string = joinURL
                    copiedLink = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copiedLink = false }
                }
            }
        }
        .sheet(isPresented: $showQRFullScreen) {
            qrFullScreenSheet
        }
    }

    private func shareButton(label: String, icon: String, isActive: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                Text(label)
                    .font(SPTypography.cardTitle)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(isActive ? Color.sp.green.opacity(0.12) : Color.sp.primaryLight)
            .foregroundStyle(isActive ? Color.sp.green : Color.sp.primary)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
        }
        .buttonStyle(.plain)
    }

    private func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"

        guard let outputImage = filter.outputImage else { return nil }

        // Scale up for crisp rendering
        let scale = 10.0
        let scaled = outputImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))

        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    @ViewBuilder
    private var qrFullScreenSheet: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                if let qrImage = generateQRCode(from: joinURL) {
                    Image(uiImage: qrImage)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 300, maxHeight: 300)
                        .padding(20)
                        .background(Color.sp.surface)
                        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
                        .spCardShadow()
                }

                VStack(spacing: 6) {
                    Text(pool?.poolName ?? "")
                        .font(SPTypography.sectionHeader)
                        .foregroundStyle(Color.sp.ink)
                    Text(pool?.poolCode ?? "")
                        .font(SPTypography.mono(size: 28, weight: .bold))
                        .foregroundStyle(Color.sp.primary)
                    Text(joinURL)
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                }

                Spacer()

                if let qrImage = generateQRCode(from: joinURL) {
                    ShareLink(
                        item: Image(uiImage: qrImage),
                        preview: SharePreview(
                            "Join \(pool?.poolName ?? "pool") on SportPool",
                            image: Image(uiImage: qrImage)
                        )
                    ) {
                        HStack(spacing: 8) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 14, weight: .semibold))
                            Text("Share QR Code")
                                .font(SPTypography.cardTitle)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.sp.primary)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(16)
            .background(Color.sp.snow)
            .navigationTitle("QR Code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { showQRFullScreen = false }
                }
            }
        }
    }

    // MARK: - Pool Info (Name + Description)

    private var poolInfoCard: some View {
        card {
            HStack {
                sectionHeader("Pool Info")
                if let pool {
                    Text(modeLabel(pool.predictionMode))
                        .font(SPTypography.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Color.sp.primaryLight)
                        .foregroundStyle(Color.sp.primary)
                        .clipShape(Capsule())
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Pool Name")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
                TextField("Pool Name", text: $editName)
                    .textFieldStyle(.plain)
                    .font(SPTypography.body)
                Divider()
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Description")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
                TextField("Description (optional)", text: $editDescription, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(SPTypography.body)
                    .lineLimit(2...4)
            }
        }
    }

    // MARK: - Status

    private var statusCard: some View {
        card {
            sectionHeader("Status")
            Picker("Status", selection: $editStatus) {
                Text("Open").tag("open")
                Text("Closed").tag("closed")
                Text("Completed").tag("completed")
            }
            .pickerStyle(.segmented)

            Text(statusDescription)
                .font(SPTypography.detail)
                .foregroundStyle(Color.sp.slate)
        }
    }

    // MARK: - Visibility

    private var visibilityCard: some View {
        card {
            sectionHeader("Visibility")
            Picker("Visibility", selection: $editIsPrivate) {
                Text("Public").tag(false)
                Text("Private").tag(true)
            }
            .pickerStyle(.segmented)

            Text(editIsPrivate ? "Only people with the pool code can join." : "Anyone with the pool code can join.")
                .font(SPTypography.detail)
                .foregroundStyle(Color.sp.slate)
        }
    }

    // MARK: - Max Members

    private var maxMembersCard: some View {
        card {
            settingsRow("Max Members", value:
                HStack(spacing: 6) {
                    TextField("0", value: $editMaxParticipants, format: .number)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .font(SPTypography.mono(size: 14, weight: .bold))
                        .frame(width: 56)
                        .padding(.vertical, 6)
                        .background(Color.sp.mist)
                        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
                    Text(editMaxParticipants == 0 ? "(unlimited)" : "")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
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
                        .foregroundStyle(Color.sp.primary)
                        .font(.system(size: 14))
                    Text("Round deadlines are managed separately. This deadline applies to the initial group stage.")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
                .padding(10)
                .background(Color.sp.primaryLight)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
            }

            DatePicker("Deadline", selection: $editDeadline, displayedComponents: [.date, .hourAndMinute])
                .font(SPTypography.body)

            HStack {
                Spacer()
                quickDeadlineButton("Tournament Start", date: tournamentStartDate)
                quickDeadlineButton("1 Day Before", date: tournamentStartDate?.addingTimeInterval(-86400))
                quickDeadlineButton("1 Week Before", date: tournamentStartDate?.addingTimeInterval(-604800))
            }

            if let pool, let deadline = pool.predictionDeadline {
                let countdown = deadlineCountdown(deadline)
                if !countdown.isEmpty {
                    HStack {
                        Spacer()
                        HStack(spacing: 6) {
                            Image(systemName: countdown.contains("passed") ? "exclamationmark.circle.fill" : "clock.fill")
                                .font(.system(size: 10))
                            Text(countdown)
                                .font(SPTypography.detail)
                        }
                        .foregroundStyle(countdown.contains("passed") ? Color.sp.red : Color.sp.green)
                    }
                }
            }
        }
    }

    // MARK: - Prediction Entries

    private var entriesCard: some View {
        card {
            sectionHeader("Prediction Entries")

            Text("Allow members to submit multiple prediction entries. Each is scored independently on the leaderboard.")
                .font(SPTypography.detail)
                .foregroundStyle(Color.sp.slate)

            VStack(alignment: .leading, spacing: 8) {
                Text("Max Entries Per Member")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)

                HStack(spacing: 0) {
                    ForEach(1...10, id: \.self) { n in
                        Button {
                            editMaxEntries = n
                        } label: {
                            Text("\(n)")
                                .font(SPTypography.mono(size: 14, weight: editMaxEntries == n ? .bold : .regular))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(editMaxEntries == n ? Color.sp.primary : Color.sp.mist)
                                .foregroundStyle(editMaxEntries == n ? .white : Color.sp.ink)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
            }

            if editMaxEntries > 1 {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "info.circle.fill")
                        .foregroundStyle(Color.sp.primary)
                        .font(.system(size: 14))
                    Text("Members can create up to \(editMaxEntries) entries (e.g. \"Serious\", \"Fun\"). Each appears as its own row on the leaderboard.")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
                .padding(10)
                .background(Color.sp.primaryLight)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
            }
        }
    }

    // MARK: - Scoring Configuration

    private var scoringConfigCard: some View {
        NavigationLink {
            ScoringConfigView(
                poolId: pool?.poolId ?? "",
                settings: settings,
                poolService: poolService,
                onSettingsSaved: onScoringSettingsSaved
            )
        } label: {
            card {
                HStack(spacing: 12) {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 16))
                        .foregroundStyle(Color.sp.primary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Scoring Configuration")
                            .font(SPTypography.cardTitle)
                            .foregroundStyle(Color.sp.ink)
                        Text("Customize point values for matches and bonuses")
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.slate)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.sp.slate)
                }
            }
        }
        .buttonStyle(.plain)
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
                        .font(.system(size: 16))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Archive Pool")
                            .font(SPTypography.cardTitle)
                        Text("Preserve data but prevent new activity")
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.slate)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.sp.slate)
                }
                .padding(.vertical, 4)
                .foregroundStyle(Color.sp.amber)
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
                            .font(.system(size: 16))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Delete Pool")
                            .font(SPTypography.cardTitle)
                        Text("Permanently delete pool and all data")
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.slate)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.sp.slate)
                }
                .padding(.vertical, 4)
                .foregroundStyle(Color.sp.red)
            }
            .buttonStyle(.plain)
            .disabled(isDeleting)
        }
        .padding(16)
        .background(Color.sp.surface)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.lg))
        .overlay(
            RoundedRectangle(cornerRadius: SPDesign.Radius.lg)
                .strokeBorder(Color.sp.red.opacity(0.15), lineWidth: AppDesign.Border.thin)
        )
        .spCardShadow()
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
            let parsed = SPDateFormatter.parse(deadline)
            editDeadline = parsed ?? Date()
            savedDeadline = parsed
        } else {
            savedDeadline = nil
        }
        snapshotSavedState()
    }

    private func snapshotSavedState() {
        savedName = editName
        savedDescription = editDescription
        savedStatus = editStatus
        savedIsPrivate = editIsPrivate
        savedMaxEntries = editMaxEntries
        savedMaxParticipants = editMaxParticipants
        savedDeadline = editDeadline
    }

    // MARK: - Computed

    private var hasChanges: Bool {
        guard pool != nil else { return false }
        let deadlineChanged: Bool = {
            if let saved = savedDeadline {
                return abs(editDeadline.timeIntervalSince(saved)) > 60
            }
            return false
        }()
        return editName != savedName
            || editDescription != savedDescription
            || editStatus != savedStatus
            || editIsPrivate != savedIsPrivate
            || editMaxEntries != savedMaxEntries
            || editMaxParticipants != savedMaxParticipants
            || deadlineChanged
    }

    private var statusDescription: String {
        switch editStatus {
        case "open": return "Pool is open and accepting new members."
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

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]

        let payload = PoolUpdatePayload(
            poolName: editName,
            description: editDescription,
            status: editStatus,
            isPrivate: editIsPrivate,
            maxEntriesPerUser: editMaxEntries,
            predictionDeadline: formatter.string(from: editDeadline)
        )

        Task {
            do {
                try await poolService.updatePool(poolId: pool.poolId, updates: payload)
                isSaving = false
                snapshotSavedState()
                showSaveSuccess = true
                try? await Task.sleep(for: .seconds(1.5))
                showSaveSuccess = false
            } catch {
                actionError = "Failed to save: \(error.localizedDescription)"
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
                .font(SPTypography.detail)
                .foregroundStyle(Color.sp.slate)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.sp.mist)
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
        guard let date = SPDateFormatter.parse(iso) else { return "" }
        let now = Date()
        if date < now { return "Deadline passed" }
        let diff = Calendar.current.dateComponents([.day, .hour], from: now, to: date)
        let days = diff.day ?? 0
        let hours = diff.hour ?? 0
        if days > 0 { return "\(days)d \(hours)h remaining" }
        return "\(hours)h remaining"
    }
}
