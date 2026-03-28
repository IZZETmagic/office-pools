import SwiftUI

// MARK: - Glass Button Modifier

private struct GlassButtonModifier: ViewModifier {
    var tint: Color?

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular, in: .rect(cornerRadius: 14))
        } else {
            content
                .background {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(.ultraThinMaterial)
                }
                .overlay {
                    if let tint {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(tint.opacity(0.45))
                    }
                }
                .overlay {
                    // Top-edge highlight for glass refraction
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(
                            LinearGradient(
                                colors: [.white.opacity(0.5), .white.opacity(0.1), .clear],
                                startPoint: .top,
                                endPoint: .bottom
                            ),
                            lineWidth: 0.5
                        )
                }
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .shadow(color: (tint ?? .black).opacity(tint != nil ? 0.25 : 0.08), radius: 6, y: 3)
        }
    }
}

extension View {
    func glassButton(tint: Color? = nil) -> some View {
        modifier(GlassButtonModifier(tint: tint))
    }
}

/// Toggles between solid accent fill (complete) and dimmed glass (incomplete).
private struct NextRoundButtonStyle: ViewModifier {
    let isComplete: Bool

    func body(content: Content) -> some View {
        if isComplete {
            content
                .tint(.white)
                .foregroundColor(.white)
                .glassButton(tint: .accentColor)
        } else {
            content
                .glassButton()
                .opacity(0.5)
        }
    }
}

/// Main wizard container that orchestrates the 7-stage prediction flow.
/// Provides stage navigation via pills, stage content, and bottom navigation with save/submit actions.
/// When `readOnly` is true, hides save status bar and submit button, shows only navigation.
struct PredictionWizardView: View {
    @Bindable var viewModel: PredictionEditViewModel
    let entry: Entry
    var initialStage: WizardStage = .groupStage
    var readOnly: Bool = false
    var readOnlyPoints: Int? = nil
    var onSubmitSuccess: (() -> Void)? = nil

    @State private var currentStage: WizardStage = .groupStage
    @State private var showSubmitConfirmation = false

    var body: some View {
        ZStack {
            // Scrollable content — extends behind top and bottom glass bars
            ScrollView {
                VStack(spacing: 0) {
                    // Top inset so content starts below the glass status bar
                    Spacer().frame(height: 44)

                    // Stage title
                    if currentStage != .summary || readOnly {
                        Text(currentStage == .summary && readOnly ? "Summary" : currentStage.label)
                            .font(.title2.weight(.bold))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal)
                            .padding(.top, 10)
                            .padding(.bottom, 4)
                    }

                    stageContent

                    // Bottom inset so content can scroll above the glass nav bar
                    Spacer().frame(height: 80)
                }
            }
            .scrollDismissesKeyboard(.interactively)

            // Floating glass status bar — pinned to top
            VStack {
                if !readOnly {
                    saveStatusBar
                } else {
                    readOnlyStatusBar
                }
                Spacer()
            }

            // Floating glass navigation bar — pinned to bottom
            VStack {
                Spacer()
                navigationBar
            }
        }
        .onAppear {
            currentStage = initialStage
        }
        .alert("Submit Predictions?", isPresented: $showSubmitConfirmation) {
            Button("Cancel", role: .cancel) { }
            Button("Submit", role: .destructive) {
                Task {
                    await viewModel.submitPredictions(entryId: entry.entryId)
                    if viewModel.submitSuccess {
                        onSubmitSuccess?()
                    }
                }
            }
        } message: {
            Text("Once submitted, predictions cannot be changed. Make sure you are happy with all \(viewModel.totalCount) predictions.")
        }
    }

    // MARK: - Stage Content

    @ViewBuilder
    private var stageContent: some View {
        switch currentStage {
        case .groupStage:
            GroupStageView(viewModel: viewModel, readOnly: readOnly)
        case .roundOf32, .roundOf16, .quarterFinals, .semiFinals, .finals:
            KnockoutStageView(stage: currentStage, viewModel: viewModel, readOnly: readOnly)
        case .summary:
            if readOnly {
                readOnlySummaryContent
            } else {
                summaryContent
            }
        }
    }

    // MARK: - Read-Only Status Bar

    private var readOnlyStatusBar: some View {
        HStack {
            HStack(spacing: 6) {
                if entry.hasSubmittedPredictions {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                    Text("Submitted")
                        .font(.caption.weight(.medium))
                } else if entry.predictionsLocked {
                    Image(systemName: "lock.fill")
                        .foregroundStyle(.orange)
                    Text("Locked")
                        .font(.caption.weight(.medium))
                } else {
                    Image(systemName: "clock.badge.exclamationmark")
                        .foregroundStyle(.red)
                    Text("Deadline Passed")
                        .font(.caption.weight(.medium))
                }
            }

            Spacer()

            if let pts = readOnlyPoints {
                Text("\(pts) pts")
                    .font(.subheadline.weight(.bold).monospacedDigit())
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }

    // MARK: - Read-Only Summary

    private var readOnlySummaryContent: some View {
        LazyVStack(spacing: 16) {
            // Champion card
            if let champion = viewModel.champion {
                VStack(spacing: 8) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(.yellow)
                    Text(champion.teamName)
                        .font(.title2.weight(.bold))
                    Text("Your predicted champion")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .background(Color.yellow.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(Color.yellow.opacity(0.3), lineWidth: 1)
                )
                .padding(.horizontal)
            }

            // Stage list (view-only, no edit buttons)
            VStack(spacing: 0) {
                ForEach(WizardStage.allCases.filter({ $0 != .summary }), id: \.self) { stage in
                    readOnlyStageRow(stage)
                    if stage != .finals {
                        Divider().padding(.horizontal)
                    }
                }
            }
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(Color(.systemGray4), lineWidth: 0.5)
            )
            .padding(.horizontal)

            Spacer().frame(height: 16)
        }
        .padding(.top, 8)
    }

    private func readOnlyStageRow(_ stage: WizardStage) -> some View {
        let counts = viewModel.stageCompletionCount(stage)

        return HStack {
            Image(systemName: "checkmark.circle.fill")
                .font(.subheadline)
                .foregroundStyle(.green)

            Text(stage.label)
                .font(.subheadline)

            Spacer()

            Text("\(counts.completed)/\(counts.total)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)

            Button("View") {
                currentStage = stage
            }
            .font(.caption.weight(.medium))
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }

    // MARK: - Summary Content (edit mode)

    private var summaryContent: some View {
        LazyVStack(spacing: 16) {
            // Champion card
            if let champion = viewModel.champion {
                VStack(spacing: 8) {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(.yellow)
                    Text(champion.teamName)
                        .font(.title2.weight(.bold))
                    Text("Your predicted champion")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .background(Color.yellow.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(Color.yellow.opacity(0.3), lineWidth: 1)
                )
                .padding(.horizontal)
            }

            // Overall progress
            HStack {
                Image(systemName: viewModel.isComplete ? "checkmark.circle.fill" : "circle.dashed")
                    .foregroundStyle(viewModel.isComplete ? .green : .orange)
                    .font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(viewModel.progressText)
                        .font(.headline)
                    if !viewModel.isComplete {
                        Text("\(viewModel.totalCount - viewModel.completedCount) predictions remaining")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
            .padding()
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal)

            // Stage completion list with edit buttons
            VStack(spacing: 0) {
                ForEach(WizardStage.allCases.filter({ $0 != .summary }), id: \.self) { stage in
                    stageRow(stage)
                    if stage != .finals {
                        Divider().padding(.horizontal)
                    }
                }
            }
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(Color(.systemGray4), lineWidth: 0.5)
            )
            .padding(.horizontal)

            // Error message
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Spacer().frame(height: 16)
        }
        .padding(.top, 8)
    }

    private func stageRow(_ stage: WizardStage) -> some View {
        let counts = viewModel.stageCompletionCount(stage)
        let isComplete = viewModel.isStageComplete(stage)

        return HStack {
            Image(systemName: isComplete ? "checkmark.circle.fill" : "circle")
                .font(.subheadline)
                .foregroundStyle(isComplete ? .green : .secondary)

            Text(stage.label)
                .font(.subheadline)

            Spacer()

            Text("\(counts.completed)/\(counts.total)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)

            Button("Edit") {
                currentStage = stage
            }
            .font(.caption.weight(.medium))
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }

    // MARK: - Save Status Bar

    private var saveStatusBar: some View {
        HStack {
            Text(viewModel.progressText)
                .font(.caption.weight(.medium))

            Spacer()

            HStack(spacing: 4) {
                if viewModel.saveStatus == .saving {
                    ProgressView()
                        .controlSize(.mini)
                    Text("Saving...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if case .error(let msg) = viewModel.saveStatus {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                    Text(msg)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .lineLimit(1)
                } else if let lastSaved = viewModel.lastSavedAt {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.green)
                    Text("Saved \(lastSaved.formatted(date: .omitted, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Not saved yet")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }

    // MARK: - Navigation Bar

    private var navigationBar: some View {
        HStack(spacing: 12) {
            // Back button
            if currentStage != .groupStage {
                Button {
                    if let prevStage = previousStage {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            currentStage = prevStage
                        }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.caption.weight(.semibold))
                        Text("Back")
                    }
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .glassButton()
                }
            }

            // Forward / Submit button
            if readOnly {
                // Read-only: just navigate forward, no submit
                if let next = nextStage {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            currentStage = next
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(next == .summary ? "Summary" : "Next")
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                        }
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .glassButton()
                    }
                }
            } else if currentStage == .summary {
                Button {
                    showSubmitConfirmation = true
                } label: {
                    HStack {
                        if viewModel.isSubmitting {
                            ProgressView()
                                .controlSize(.small)
                                .tint(.white)
                        }
                        Text("Submit Predictions")
                            .font(.subheadline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(viewModel.isComplete ? Color.accentColor : Color.gray)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .shadow(color: viewModel.isComplete ? Color.accentColor.opacity(0.3) : .clear, radius: 8, y: 4)
                }
                .disabled(!viewModel.isComplete || viewModel.isSubmitting)
            } else if let next = nextStage {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        currentStage = next
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(next == .summary ? "Summary" : "Next Round")
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                    }
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .modifier(NextRoundButtonStyle(isComplete: viewModel.isStageComplete(currentStage)))
                }
                .disabled(!viewModel.isStageComplete(currentStage))
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .padding(.bottom, 28)
    }

    // MARK: - Navigation Helpers

    private var previousStage: WizardStage? {
        let allCases = WizardStage.allCases
        guard let idx = allCases.firstIndex(of: currentStage), idx > 0 else { return nil }
        return allCases[idx - 1]
    }

    private var nextStage: WizardStage? {
        let allCases = WizardStage.allCases
        guard let idx = allCases.firstIndex(of: currentStage), idx < allCases.count - 1 else { return nil }
        return allCases[idx + 1]
    }

}
