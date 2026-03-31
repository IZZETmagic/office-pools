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
    @State private var openDeadline = Date().addingTimeInterval(48 * 3600) // Default: 48 hours from now

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
        .background(Color(.systemGroupedBackground))
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
                    .font(.headline)

                Spacer()

                stateBadge(round.state)
            }

            // Match progress
            if let data = roundData {
                HStack(spacing: 4) {
                    Image(systemName: "sportscourt")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(data.completedMatchCount ?? 0)/\(data.matchCount ?? 0) matches completed")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Deadline
            if let deadline = round.deadline {
                HStack(spacing: 4) {
                    Image(systemName: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("Deadline: \(formatDate(deadline))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Admin stats
            if let stats = roundData?.adminStats {
                HStack(spacing: 4) {
                    Image(systemName: "person.3")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(stats.submittedEntries)/\(stats.totalEntries) entries submitted")
                        .font(.caption)
                        .foregroundStyle(.secondary)
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
                            .font(.subheadline.weight(.medium))
                    }
                    .buttonStyle(.bordered)
                    .tint(.accentColor)
                    .disabled(isLoading)

                case .open:
                    Button {
                        roundToExtend = round
                        if let deadline = round.deadline, let d = parseISO(deadline) {
                            extendDeadline = d.addingTimeInterval(24 * 3600)
                        }
                        showExtendSheet = true
                    } label: {
                        Label("Extend", systemImage: "clock.arrow.circlepath")
                            .font(.subheadline.weight(.medium))
                    }
                    .buttonStyle(.bordered)
                    .tint(.orange)

                    Button {
                        Task { await closeRound(round) }
                    } label: {
                        Label("Close", systemImage: "lock")
                            .font(.subheadline.weight(.medium))
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)

                    Button {
                        Task { await completeRound(round) }
                    } label: {
                        Label("Complete", systemImage: "checkmark.circle")
                            .font(.subheadline.weight(.medium))
                    }
                    .buttonStyle(.bordered)
                    .tint(.green)

                case .inProgress:
                    Button {
                        Task { await completeRound(round) }
                    } label: {
                        Label("Complete Round", systemImage: "checkmark.circle")
                            .font(.subheadline.weight(.medium))
                    }
                    .buttonStyle(.bordered)
                    .tint(.green)
                    .disabled(isLoading)

                case .completed:
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(AppColors.success500)
                        Text("Round completed")
                            .font(.caption)
                            .foregroundStyle(.secondary)
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
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
    }

    // MARK: - State Badge

    private func stateBadge(_ state: RoundStateValue) -> some View {
        let (text, color): (String, Color) = {
            switch state {
            case .locked: return ("Locked", Color(.systemGray))
            case .open: return ("Open", .green)
            case .inProgress: return ("In Progress", .orange)
            case .completed: return ("Completed", .blue)
            }
        }()

        return Text(text)
            .font(.caption.weight(.semibold))
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
                            .font(.caption)
                            .foregroundStyle(.secondary)
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

    // MARK: - Helpers

    private func formatDate(_ iso: String) -> String {
        guard let date = parseISO(iso) else { return iso }
        let df = DateFormatter()
        df.dateStyle = .medium
        df.timeStyle = .short
        return df.string(from: date)
    }

    private func parseISO(_ string: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: string)
    }
}
