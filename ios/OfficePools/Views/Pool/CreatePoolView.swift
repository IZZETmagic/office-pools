import SwiftUI

/// Full-screen 4-step wizard for creating a new pool.
struct CreatePoolView: View {
    let userId: String
    let username: String
    let onPoolCreated: (Pool) -> Void

    @State private var viewModel = CreatePoolViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Step indicator
                stepIndicator
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 16)

                Divider()

                // Step content
                ScrollView {
                    VStack(spacing: 0) {
                        switch viewModel.currentStep {
                        case .tournament: tournamentStep
                        case .poolType: poolTypeStep
                        case .details: detailsStep
                        case .settings: settingsStep
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 24)
                }

                Divider()

                // Bottom buttons
                bottomBar
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(viewModel.currentStep.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .principal) {
                    Text("Step \(viewModel.currentStepIndex + 1) of \(viewModel.totalSteps)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .task {
                await viewModel.loadTournaments()
            }
            .onChange(of: viewModel.createdPool) { _, newPool in
                if let pool = newPool {
                    onPoolCreated(pool)
                    dismiss()
                }
            }
        }
    }

    // MARK: - Step Indicator

    private var stepIndicator: some View {
        HStack(spacing: 0) {
            ForEach(CreatePoolStep.allCases, id: \.rawValue) { step in
                // Dot
                Circle()
                    .fill(stepColor(for: step))
                    .frame(width: 10, height: 10)
                    .onTapGesture {
                        viewModel.goToStep(step)
                    }

                // Connector line (except last)
                if step.rawValue < CreatePoolStep.allCases.count - 1 {
                    Rectangle()
                        .fill(step.rawValue < viewModel.currentStepIndex ? Color.accentColor : Color(.systemGray4))
                        .frame(height: 2)
                }
            }
        }
    }

    private func stepColor(for step: CreatePoolStep) -> Color {
        if step.rawValue < viewModel.currentStepIndex {
            return .accentColor
        } else if step == viewModel.currentStep {
            return .accentColor
        } else {
            return Color(.systemGray4)
        }
    }

    // MARK: - Step 1: Tournament Selection

    private var tournamentStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Choose the tournament for your prediction pool.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if viewModel.isLoadingTournaments {
                HStack {
                    Spacer()
                    ProgressView("Loading tournaments...")
                    Spacer()
                }
                .padding(.vertical, 40)
            } else if viewModel.tournaments.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "trophy")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("No tournaments available")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
            } else {
                ForEach(viewModel.tournaments) { tournament in
                    tournamentCard(tournament)
                }
            }
        }
    }

    private func tournamentCard(_ tournament: Tournament) -> some View {
        let isSelected = viewModel.selectedTournamentId == tournament.tournamentId

        return Button {
            viewModel.selectTournament(tournament.tournamentId)
        } label: {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(tournament.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)

                    if let hosts = tournament.hostCountries, !hosts.isEmpty {
                        Text(hosts)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Text(tournament.dateRangeDisplay)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let desc = tournament.description, !desc.isEmpty {
                        Text(desc)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                            .lineLimit(2)
                    }
                }

            }
            .padding(16)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.accentColor : Color(.separator), lineWidth: isSelected ? 2 : 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Step 2: Pool Type

    private var poolTypeStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("How will members make their predictions?")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            poolTypeCard(
                mode: .fullTournament,
                icon: "list.bullet.rectangle",
                title: "Full Tournament",
                description: "Members predict all matches upfront before the tournament starts. They must predict which teams qualify for the knockout rounds based on their group stage predictions."
            )

            poolTypeCard(
                mode: .progressive,
                icon: "arrow.forward.circle",
                title: "Progressive",
                description: "Members predict round-by-round as teams advance. After each round completes, the next round opens with actual qualified teams and matchups."
            )

            poolTypeCard(
                mode: .bracketPicker,
                icon: "square.grid.2x2",
                title: "Bracket Picker",
                description: "Members rank groups and pick knockout winners only — no score predictions needed. Quick & simple (~10 min)."
            )

            // Warning
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                    .font(.caption)
                Text("Pool type cannot be changed after creation.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.orange.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private func poolTypeCard(mode: PredictionMode, icon: String, title: String, description: String) -> some View {
        let isSelected = viewModel.predictionMode == mode

        return Button {
            viewModel.predictionMode = mode
        } label: {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(isSelected ? Color.accentColor : .secondary)
                    .frame(width: 32)

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)

                    Text(description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }

            }
            .padding(16)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.accentColor : Color(.separator), lineWidth: isSelected ? 2 : 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Step 3: Details

    private var detailsStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Give your pool a name and optional description.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Text("Pool Name")
                    .font(.subheadline.weight(.medium))

                TextField(viewModel.poolNamePlaceholder, text: $viewModel.poolName)
                    .font(.body)
                    .padding(12)
                    .background(Color(.systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color(.separator), lineWidth: 0.5)
                    )
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Description")
                    .font(.subheadline.weight(.medium))

                TextField("Tell people about your pool...", text: $viewModel.poolDescription, axis: .vertical)
                    .lineLimit(3...6)
                    .font(.body)
                    .padding(12)
                    .background(Color(.systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color(.separator), lineWidth: 0.5)
                    )
            }
        }
    }

    // MARK: - Step 4: Settings

    private var settingsStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            // Deadline
            VStack(alignment: .leading, spacing: 12) {
                Text(viewModel.predictionMode == .progressive ? "Group Stage Deadline" : "Prediction Deadline")
                    .font(.subheadline.weight(.medium))

                DatePicker(
                    "Deadline",
                    selection: $viewModel.deadlineDate,
                    displayedComponents: [.date, .hourAndMinute]
                )
                .labelsHidden()
                .datePickerStyle(.compact)

                // Quick-set buttons
                HStack(spacing: 8) {
                    quickDeadlineButton("Tournament Start", option: .tournamentStart)
                    quickDeadlineButton("1 Day Before", option: .oneDayBefore)
                    quickDeadlineButton("1 Week Before", option: .oneWeekBefore)
                }
            }
            .padding(16)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            // Privacy
            VStack(alignment: .leading, spacing: 12) {
                Text("Privacy")
                    .font(.subheadline.weight(.medium))

                HStack(spacing: 12) {
                    privacyButton(title: "Public", subtitle: "Anyone with code can join", isSelected: !viewModel.isPrivate) {
                        viewModel.isPrivate = false
                    }
                    privacyButton(title: "Private", subtitle: "Invite only", isSelected: viewModel.isPrivate) {
                        viewModel.isPrivate = true
                    }
                }
            }
            .padding(16)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            // Max Members
            VStack(alignment: .leading, spacing: 12) {
                Text("Maximum Members")
                    .font(.subheadline.weight(.medium))

                HStack {
                    TextField("0", value: $viewModel.maxParticipants, format: .number)
                        .keyboardType(.numberPad)
                        .font(.body.monospacedDigit())
                        .padding(12)
                        .background(Color(.secondarySystemGroupedBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .frame(width: 80)

                    Text("Set to 0 for unlimited")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(16)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            // Max Entries
            VStack(alignment: .leading, spacing: 12) {
                Text("Max Entries Per Member")
                    .font(.subheadline.weight(.medium))

                Text("Allow members to submit multiple sets of predictions. Each entry is scored independently.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                // 1-10 numbered buttons
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 8) {
                    ForEach(1...10, id: \.self) { n in
                        Button {
                            viewModel.maxEntriesPerUser = n
                        } label: {
                            Text("\(n)")
                                .font(.subheadline.weight(viewModel.maxEntriesPerUser == n ? .bold : .regular).monospacedDigit())
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .background(viewModel.maxEntriesPerUser == n ? Color.accentColor : Color(.secondarySystemGroupedBackground))
                                .foregroundStyle(viewModel.maxEntriesPerUser == n ? .white : .primary)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            // Scoring info
            HStack(spacing: 10) {
                Image(systemName: "info.circle.fill")
                    .foregroundStyle(.blue)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Scoring & Bonus Points")
                        .font(.caption.weight(.semibold))
                    Text("Your pool will be created with default scoring settings. You can customize all scoring rules, multipliers, and bonus points from the pool admin settings after creation.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(12)
            .background(Color.blue.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Error
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.red.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private func quickDeadlineButton(_ title: String, option: QuickDeadline) -> some View {
        Button {
            viewModel.setQuickDeadline(option)
        } label: {
            Text(title)
                .font(.caption2.weight(.medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func privacyButton(title: String, subtitle: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(isSelected ? Color.accentColor.opacity(0.1) : Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? Color.accentColor : .clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        HStack(spacing: 12) {
            // Back button
            if viewModel.currentStep != .tournament {
                Button {
                    viewModel.goBack()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Back")
                    }
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            }

            // Next / Create button
            Button {
                if viewModel.isLastStep {
                    Task {
                        await viewModel.createPool(userId: userId, username: username)
                    }
                } else {
                    viewModel.goNext()
                }
            } label: {
                Group {
                    if viewModel.isCreating {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text(viewModel.isLastStep ? "Create Pool" : "Next")
                    }
                }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(viewModel.canProceed ? Color.accentColor : Color(.systemGray4))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.canProceed || viewModel.isCreating)
        }
    }
}
