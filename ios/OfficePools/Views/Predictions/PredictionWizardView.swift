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
                    ZStack {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(.ultraThinMaterial)

                        if let tint {
                            RoundedRectangle(cornerRadius: 14)
                                .fill(tint.opacity(0.12))
                        }

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
                }
                .shadow(color: .black.opacity(0.08), radius: 6, y: 3)
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
                .foregroundStyle(.white)
                .background(Color.sp.primary, in: RoundedRectangle(cornerRadius: 14))
                .shadow(color: Color.sp.primary.opacity(0.3), radius: 8, y: 4)
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
    @State private var groupsExpanded: Set<String> = []

    var body: some View {
        ZStack {
            // Scrollable content — extends behind top and bottom glass bars
            ScrollView {
                VStack(spacing: 0) {
                    // Top inset so content starts below the glass status bar
                    Spacer().frame(height: 44)

                    // Referee tip
                    if !readOnly {
                        RefereeTipCard(
                            key: "score_input",
                            message: "Tap a score to cycle through values. Long press to type a specific number."
                        )
                        .padding(.top, 12)
                    }

                    // Stage title
                    if currentStage != .summary || readOnly {
                        HStack(alignment: .firstTextBaseline) {
                            Text(currentStage == .summary && readOnly ? "Summary" : currentStage.label)
                                .font(SPTypography.sectionHeader)
                                .foregroundStyle(Color.sp.ink)

                            Spacer()

                            if currentStage == .groupStage && !readOnly {
                                Button {
                                    withAnimation(.easeInOut(duration: 0.25)) {
                                        if groupsExpanded.count == GROUP_LETTERS.count {
                                            groupsExpanded.removeAll()
                                        } else {
                                            groupsExpanded = Set(GROUP_LETTERS)
                                        }
                                    }
                                } label: {
                                    Text(groupsExpanded.count == GROUP_LETTERS.count ? "Collapse All" : "Expand All")
                                        .font(SPTypography.body)
                                        .foregroundStyle(Color.sp.primary)
                                }
                            }
                        }
                        .padding(.horizontal)
                        .padding(.top, 18)
                        .padding(.bottom, 16)
                    }

                    stageContent

                    // Bottom inset so content can scroll above the glass nav bar
                    Spacer().frame(height: 120)
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
            GroupStageView(viewModel: viewModel, readOnly: readOnly, expandedGroups: $groupsExpanded)
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
                        .foregroundStyle(Color.sp.green)
                    Text("Submitted")
                        .font(SPTypography.detail)
                } else if entry.predictionsLocked {
                    Image(systemName: "lock.fill")
                        .foregroundStyle(Color.sp.amber)
                    Text("Locked")
                        .font(SPTypography.detail)
                } else {
                    Image(systemName: "clock.badge.exclamationmark")
                        .foregroundStyle(Color.sp.red)
                    Text("Deadline Passed")
                        .font(SPTypography.detail)
                }
            }

            Spacer()

            if let pts = readOnlyPoints {
                Text("\(pts) pts")
                    .font(SPTypography.mono(size: 14, weight: .bold))
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
                        .foregroundStyle(Color.sp.accent)
                    Text(champion.teamName)
                        .font(SPTypography.sectionHeader)
                        .foregroundStyle(Color.sp.ink)
                    Text("Your predicted champion")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .background(Color.sp.accentLight)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                        .strokeBorder(Color.sp.accent.opacity(0.3), lineWidth: 1)
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
            .background(Color.sp.surface)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                    .strokeBorder(Color.sp.silver, lineWidth: AppDesign.Border.thin)
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
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.green)

            Text(stage.label)
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.ink)

            Spacer()

            Text("\(counts.completed)/\(counts.total)")
                .font(SPTypography.mono(size: 12))
                .foregroundStyle(Color.sp.slate)

            Button("View") {
                currentStage = stage
            }
            .font(SPTypography.detail)
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
                        .foregroundStyle(Color.sp.accent)
                    Text(champion.teamName)
                        .font(SPTypography.sectionHeader)
                        .foregroundStyle(Color.sp.ink)
                    Text("Your predicted champion")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .background(Color.sp.accentLight)
                .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                        .strokeBorder(Color.sp.accent.opacity(0.3), lineWidth: 1)
                )
                .padding(.horizontal)
            }

            // Overall progress
            HStack {
                Image(systemName: viewModel.isComplete ? "checkmark.circle.fill" : "circle.dashed")
                    .foregroundStyle(viewModel.isComplete ? Color.sp.green : Color.sp.amber)
                    .font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text(viewModel.progressText)
                        .font(SPTypography.cardTitle)
                        .foregroundStyle(Color.sp.ink)
                    if !viewModel.isComplete {
                        Text("\(viewModel.totalCount - viewModel.completedCount) predictions remaining")
                            .font(SPTypography.detail)
                            .foregroundStyle(Color.sp.slate)
                    }
                }
                Spacer()
            }
            .padding()
            .background(Color.sp.mist)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
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
            .background(Color.sp.surface)
            .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                    .strokeBorder(Color.sp.silver, lineWidth: AppDesign.Border.thin)
            )
            .padding(.horizontal)

            // Error message
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.red)
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
                .font(SPTypography.body)
                .foregroundStyle(isComplete ? Color.sp.green : Color.sp.slate)

            Text(stage.label)
                .font(SPTypography.body)
                .foregroundStyle(Color.sp.ink)

            Spacer()

            Text("\(counts.completed)/\(counts.total)")
                .font(SPTypography.mono(size: 12))
                .foregroundStyle(Color.sp.slate)

            Button("Edit") {
                currentStage = stage
            }
            .font(SPTypography.detail)
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
                .font(SPTypography.detail)
                .foregroundStyle(Color.sp.ink)

            Spacer()

            HStack(spacing: 4) {
                if viewModel.saveStatus == .saving {
                    ProgressView()
                        .controlSize(.mini)
                    Text("Saving...")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                } else if case .error(let msg) = viewModel.saveStatus {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.red)
                    Text(msg)
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.red)
                        .lineLimit(1)
                } else if let lastSaved = viewModel.lastSavedAt {
                    Image(systemName: "checkmark.circle.fill")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.green)
                    Text("Saved \(lastSaved.formatted(date: .omitted, time: .shortened))")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                } else {
                    Text("Not saved yet")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
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
                            .font(SPTypography.detail)
                        Text("Back")
                    }
                    .font(SPTypography.body)
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
                                .font(SPTypography.detail)
                        }
                        .font(SPTypography.cardTitle)
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
                            .font(SPTypography.cardTitle)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(viewModel.isComplete ? Color.sp.primary : Color.sp.silver)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .shadow(color: viewModel.isComplete ? Color.sp.primary.opacity(0.3) : .clear, radius: 8, y: 4)
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
                            .font(SPTypography.detail)
                    }
                    .font(SPTypography.cardTitle)
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
