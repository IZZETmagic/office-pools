import SwiftUI

/// Admin view for managing progressive tournament round states.
/// Allows pool admins to open, close, complete, and extend deadlines for rounds.
struct RoundsAdminView: View {
    let poolId: String
    let roundStates: [PoolRoundState]
    let roundsResponse: APIService.RoundsResponse?
    var onRefresh: (() async -> Void)?

    @State private var isLoading = false
    @State private var actionError: String?
    @State private var showError = false
    @State private var showSuccess = false
    @State private var successMessage = ""

    // Open round sheet
    @State private var showOpenSheet = false
    @State private var roundToOpen: PoolRoundState?
    @State private var openDeadline = Date().addingTimeInterval(48 * 3600)

    // Extend deadline sheet
    @State private var showExtendSheet = false
    @State private var roundToExtend: PoolRoundState?
    @State private var extendDeadline = Date().addingTimeInterval(24 * 3600)

    private let apiService = APIService()

    private let roundOrder: [RoundKey] = [.group, .round32, .round16, .quarterFinal, .semiFinal, .thirdPlace, .final_]

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                Spacer().frame(height: 4)

                ForEach(roundOrder, id: \.self) { key in
                    if let roundState = roundStates.first(where: { $0.roundKey == key }) {
                        roundCard(roundState)
                    }
                }

                Spacer().frame(height: 24)
            }
            .padding(.horizontal, 16)
        }
        .background(Color.sp.snow)
        .alert("Error", isPresented: $showError) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(actionError ?? "Something went wrong")
        }
        .alert("Success", isPresented: $showSuccess) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(successMessage)
        }
        .sheet(isPresented: $showOpenSheet) {
            openRoundSheet
        }
        .sheet(isPresented: $showExtendSheet) {
            extendDeadlineSheet
        }
    }

    // MARK: - Round Card

    private func roundCard(_ round: PoolRoundState) -> some View {
        let roundData = roundsResponse?.rounds.first(where: { $0.roundKey == round.roundKey.rawValue })

        return VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Text(round.roundKey.displayName)
                    .font(SPTypography.sectionHeader)
                    .foregroundStyle(Color.sp.ink)

                Spacer()

                stateBadge(round.state)
            }

            // Match progress
            if let data = roundData {
                HStack(spacing: 4) {
                    Image(systemName: "sportscourt")
                        .font(.system(size: 11))
                        .foregroundStyle(Color.sp.slate)
                    Text("\(data.completedMatchCount ?? 0)/\(data.matchCount ?? 0) matches completed")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                }
            }

            // Deadline
            if let deadline = round.deadline {
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.system(size: 11))
                        .foregroundStyle(Color.sp.slate)
                    Text("Deadline: \(SPDateFormatter.long(deadline))")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                }
            }

            // Admin stats
            if let stats = roundData?.adminStats {
                HStack(spacing: 4) {
                    Image(systemName: "person.3")
                        .font(.system(size: 11))
                        .foregroundStyle(Color.sp.slate)
                    Text("\(stats.submittedEntries)/\(stats.totalEntries) entries submitted")
                        .font(SPTypography.body)
                        .foregroundStyle(Color.sp.slate)
                }
            }

            Divider()

            // Actions
            HStack(spacing: 8) {
                switch round.state {
                case .locked:
                    Button {
                        roundToOpen = round
                        showOpenSheet = true
                    } label: {
                        Label("Open Round", systemImage: "lock.open")
                            .font(SPTypography.body)
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.sp.primary)
                    .disabled(isLoading)

                case .open:
                    Button {
                        roundToExtend = round
                        if let deadline = round.deadline, let d = SPDateFormatter.parse(deadline) {
                            extendDeadline = d.addingTimeInterval(24 * 3600)
                        }
                        showExtendSheet = true
                    } label: {
                        Label("Extend", systemImage: "clock.arrow.circlepath")
                            .font(SPTypography.body)
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.sp.amber)

                    Button {
                        Task { await closeRound(round) }
                    } label: {
                        Label("Close", systemImage: "lock")
                            .font(SPTypography.body)
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.sp.red)

                    Button {
                        Task { await completeRound(round) }
                    } label: {
                        Label("Complete", systemImage: "checkmark.circle")
                            .font(SPTypography.body)
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.sp.green)

                case .inProgress:
                    Button {
                        Task { await completeRound(round) }
                    } label: {
                        Label("Complete Round", systemImage: "checkmark.circle")
                            .font(SPTypography.body)
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.sp.green)
                    .disabled(isLoading)

                case .completed:
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Color.sp.green)
                        Text("Round completed")
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.slate)
                    }
                }

                Spacer()

                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                }
            }
        }
        .padding(16)
        .spCard()
    }

    // MARK: - State Badge

    private func stateBadge(_ state: RoundStateValue) -> some View {
        let (text, color): (String, Color) = {
            switch state {
            case .locked: return ("Locked", Color.sp.silver)
            case .open: return ("Open", Color.sp.green)
            case .inProgress: return ("In Progress", Color.sp.amber)
            case .completed: return ("Completed", Color.sp.primary)
            }
        }()

        return Text(text)
            .font(SPTypography.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    // MARK: - Open Round Sheet

    private var openRoundSheet: some View {
        NavigationStack {
            Form {
                Section("Deadline") {
                    DatePicker(
                        "Prediction Deadline",
                        selection: $openDeadline,
                        in: Date()...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                }

                if let round = roundToOpen {
                    Section {
                        Text("Opening \(round.roundKey.displayName) will allow users to submit predictions until the deadline.")
                            .font(SPTypography.body)
                            .foregroundStyle(Color.sp.slate)
                    }
                }
            }
            .navigationTitle("Open Round")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showOpenSheet = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Open") {
                        Task {
                            await openRound()
                            showOpenSheet = false
                        }
                    }
                    .disabled(isLoading)
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Extend Deadline Sheet

    private var extendDeadlineSheet: some View {
        NavigationStack {
            Form {
                Section("New Deadline") {
                    DatePicker(
                        "Extended Deadline",
                        selection: $extendDeadline,
                        in: Date()...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                }
            }
            .navigationTitle("Extend Deadline")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showExtendSheet = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Extend") {
                        Task {
                            await extendRoundDeadline()
                            showExtendSheet = false
                        }
                    }
                    .disabled(isLoading)
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Actions

    private func openRound() async {
        guard let round = roundToOpen else { return }
        isLoading = true

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let deadlineISO = formatter.string(from: openDeadline)

        do {
            let response = try await apiService.changeRoundState(
                poolId: poolId,
                roundKey: round.roundKey.rawValue,
                action: "open",
                deadline: deadlineISO
            )
            if response.success {
                successMessage = "\(round.roundKey.displayName) is now open"
                showSuccess = true
                await onRefresh?()
            }
        } catch {
            actionError = error.localizedDescription
            showError = true
        }

        isLoading = false
    }

    private func closeRound(_ round: PoolRoundState) async {
        isLoading = true
        do {
            let response = try await apiService.changeRoundState(
                poolId: poolId,
                roundKey: round.roundKey.rawValue,
                action: "close"
            )
            if response.success {
                successMessage = "\(round.roundKey.displayName) has been closed"
                showSuccess = true
                await onRefresh?()
            }
        } catch {
            actionError = error.localizedDescription
            showError = true
        }
        isLoading = false
    }

    private func completeRound(_ round: PoolRoundState) async {
        isLoading = true
        do {
            let response = try await apiService.changeRoundState(
                poolId: poolId,
                roundKey: round.roundKey.rawValue,
                action: "complete"
            )
            if response.success {
                successMessage = "\(round.roundKey.displayName) has been completed"
                showSuccess = true
                await onRefresh?()
            }
        } catch {
            actionError = error.localizedDescription
            showError = true
        }
        isLoading = false
    }

    private func extendRoundDeadline() async {
        guard let round = roundToExtend else { return }
        isLoading = true

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let deadlineISO = formatter.string(from: extendDeadline)

        do {
            let response = try await apiService.changeRoundState(
                poolId: poolId,
                roundKey: round.roundKey.rawValue,
                action: "extend_deadline",
                deadline: deadlineISO
            )
            if response.success {
                successMessage = "Deadline extended for \(round.roundKey.displayName)"
                showSuccess = true
                await onRefresh?()
            }
        } catch {
            actionError = error.localizedDescription
            showError = true
        }
        isLoading = false
    }
}
