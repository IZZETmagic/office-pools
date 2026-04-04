import SwiftUI

/// Main wizard container for bracket picker predictions.
/// Orchestrates an 8-step flow: group rankings, third-place rankings,
/// 5 knockout rounds, and a review/submit step.
/// Uses the same glass nav bar pattern as PredictionWizardView.
struct BracketPickerWizardView: View {
    @Bindable var viewModel: BracketPickerViewModel
    let entry: Entry
    var readOnly: Bool = false
    var readOnlyPoints: Int? = nil
    var onSubmitSuccess: (() -> Void)? = nil

    @State private var showSubmitConfirmation = false
    @State private var showCascadeAlert = false

    var body: some View {
        ZStack {
            // Scrollable content
            ScrollView {
                VStack(spacing: 0) {
                    Spacer().frame(height: 44)

                    // Referee tip
                    if !readOnly && viewModel.currentStep == .groupRankings {
                        RefereeTipCard(
                            key: "bp_group_ranking",
                            message: "Drag teams to predict the finishing order for each group. Top 2 advance automatically."
                        )
                        .padding(.top, 12)
                    }

                    // Step indicator
                    stepIndicator
                        .padding(.top, 16)
                        .padding(.horizontal)

                    // Step title + description
                    stepHeader
                        .padding(.horizontal)
                        .padding(.top, 12)
                        .padding(.bottom, 16)

                    // Step content
                    stepContent

                    Spacer().frame(height: 80)
                }
            }
            .scrollDismissesKeyboard(.interactively)

            // Floating glass status bar — pinned to top
            VStack {
                statusBar
                Spacer()
            }

            // Floating glass navigation bar — pinned to bottom
            VStack {
                Spacer()
                navigationBar
            }
        }
        .alert("Submit Bracket Predictions?", isPresented: $showSubmitConfirmation) {
            Button("Cancel", role: .cancel) { }
            Button("Submit", role: .destructive) {
                Task {
                    await viewModel.submitBracketPicks(entryId: entry.entryId)
                    if viewModel.submitSuccess {
                        onSubmitSuccess?()
                    }
                }
            }
        } message: {
            Text("Once submitted, you cannot make changes to your bracket predictions.")
        }
        .alert("Change this pick?", isPresented: $showCascadeAlert) {
            Button("Cancel", role: .cancel) {
                viewModel.cancelCascade()
            }
            Button("Change & Reset", role: .destructive) {
                viewModel.confirmCascade()
            }
        } message: {
            if let cascade = viewModel.pendingCascade {
                Text("Changing this pick will reset \(cascade.affectedMatchIds.count) downstream \(cascade.affectedMatchIds.count == 1 ? "pick" : "picks") in later rounds.")
            }
        }
        .onChange(of: viewModel.pendingCascade != nil) { _, hasCascade in
            showCascadeAlert = hasCascade
        }
    }

    // MARK: - Step Indicator

    private var stepIndicator: some View {
        VStack(spacing: 8) {
            HStack {
                Text(viewModel.currentStep.label)
                    .font(.caption.weight(.bold))
                Spacer()
                Text("Step \(viewModel.currentStep.rawValue + 1) of \(BPWizardStep.allCases.count)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Progress dots
            HStack(spacing: 3) {
                ForEach(BPWizardStep.allCases, id: \.rawValue) { step in
                    let isActive = step == viewModel.currentStep
                    let isCompleted = step.rawValue < viewModel.currentStep.rawValue

                    RoundedRectangle(cornerRadius: 2)
                        .fill(
                            isActive ? AppColors.success500 :
                            isCompleted ? AppColors.success300 :
                            Color(.systemGray4)
                        )
                        .frame(height: 4)
                }
            }
        }
    }

    // MARK: - Step Header

    @ViewBuilder
    private var stepHeader: some View {
        switch viewModel.currentStep {
        case .groupRankings:
            VStack(alignment: .leading, spacing: 4) {
                Text("Rank Each Group")
                    .font(.title2.weight(.bold))
                Text("Drag teams to predict the finishing order. Top 2 from each group advance.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .thirdPlace:
            VStack(alignment: .leading, spacing: 4) {
                Text("Rank Third-Place Teams")
                    .font(.title2.weight(.bold))
                Text("Drag to rank all 12 third-place teams. Top 8 qualify for the Round of 32.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .roundOf32, .roundOf16, .quarterFinals, .semiFinals, .thirdFinal:
            VStack(alignment: .leading, spacing: 4) {
                Text(viewModel.currentStep.label)
                    .font(.title2.weight(.bold))
                Text(knockoutDescription)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .review:
            EmptyView()
        }
    }

    private var knockoutDescription: String {
        switch viewModel.currentStep {
        case .roundOf32: return "Pick the winner of each Round of 32 match."
        case .roundOf16: return "Pick the winner of each Round of 16 match."
        case .quarterFinals: return "Pick the 4 quarter final winners."
        case .semiFinals: return "Pick the 2 semi final winners. Losers play for third."
        case .thirdFinal: return "Pick the Third Place match winner and the World Cup Champion."
        default: return ""
        }
    }

    // MARK: - Step Content

    @ViewBuilder
    private var stepContent: some View {
        switch viewModel.currentStep {
        case .groupRankings:
            BPGroupRankingView(viewModel: viewModel, readOnly: readOnly)
        case .thirdPlace:
            BPThirdPlaceRankingView(viewModel: viewModel, readOnly: readOnly)
        case .roundOf32, .roundOf16, .quarterFinals, .semiFinals, .thirdFinal:
            BPKnockoutPickerView(
                viewModel: viewModel,
                stageKeys: viewModel.currentStep.knockoutStageKeys,
                readOnly: readOnly
            )
        case .review:
            reviewContent
        }
    }

    // MARK: - Review Content

    private var reviewContent: some View {
        LazyVStack(spacing: 16) {
            Text("Review Your Bracket")
                .font(.title2.weight(.bold))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)

            // Champion card
            championCard
                .padding(.horizontal)

            // Overall progress
            if !readOnly {
                progressCard
                    .padding(.horizontal)
            }

            // Step completion list
            stepCompletionList
                .padding(.horizontal)

            // Error message
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(AppColors.error600)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Spacer().frame(height: 16)
        }
        .padding(.top, 8)
    }

    // MARK: - Champion Card

    @ViewBuilder
    private var championCard: some View {
        if let champion = viewModel.champion {
            VStack(spacing: 8) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(AppColors.accent400)

                HStack(spacing: 8) {
                    if let flagStr = viewModel.teamMap[champion.teamId]?.flagUrl,
                       let url = URL(string: flagStr) {
                        CachedAsyncImage(url: url, width: 40, height: 28, cornerRadius: 4)
                    }
                    Text(champion.teamName)
                        .font(.title2.weight(.bold))
                }

                Text("Your predicted champion")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                // Runner-up and third place
                HStack(spacing: 24) {
                    if let runnerUp = viewModel.runnerUp {
                        HStack(spacing: 4) {
                            Text("2nd")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.secondary)
                            if let flagStr = viewModel.teamMap[runnerUp.teamId]?.flagUrl,
                               let url = URL(string: flagStr) {
                                CachedAsyncImage(url: url, width: 20, height: 14, cornerRadius: 2)
                            }
                            Text(runnerUp.teamName)
                                .font(.caption.weight(.medium))
                        }
                    }
                    if let third = viewModel.bracket.thirdPlace {
                        HStack(spacing: 4) {
                            Text("3rd")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.secondary)
                            if let flagStr = viewModel.teamMap[third.teamId]?.flagUrl,
                               let url = URL(string: flagStr) {
                                CachedAsyncImage(url: url, width: 20, height: 14, cornerRadius: 2)
                            }
                            Text(third.teamName)
                                .font(.caption.weight(.medium))
                        }
                    }
                }
                .padding(.top, 4)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .background(AppColors.accent400.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(AppColors.accent400.opacity(0.3), lineWidth: 1)
            )
        } else {
            VStack(spacing: 8) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(.tertiary)
                Text("No champion predicted yet")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if !readOnly {
                    Button("Complete knockout picks") {
                        withAnimation { viewModel.currentStep = .roundOf32 }
                    }
                    .font(.caption.weight(.medium))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Progress Card

    private var progressCard: some View {
        HStack {
            Image(systemName: viewModel.isComplete ? "checkmark.circle.fill" : "circle.dashed")
                .foregroundStyle(viewModel.isComplete ? AppColors.success500 : AppColors.warning500)
                .font(.title3)
            VStack(alignment: .leading, spacing: 2) {
                Text(viewModel.progressText)
                    .font(.headline)
                if !viewModel.isComplete {
                    let stepsRemaining = BPWizardStep.allCases.filter({ $0 != .review && !viewModel.canProceedFromStep($0) }).count
                    Text("\(stepsRemaining) \(stepsRemaining == 1 ? "step" : "steps") remaining")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Step Completion List

    private var stepCompletionList: some View {
        VStack(spacing: 0) {
            ForEach(BPWizardStep.allCases.filter({ $0 != .review }), id: \.rawValue) { step in
                let isComplete = viewModel.canProceedFromStep(step)

                HStack {
                    Image(systemName: isComplete ? "checkmark.circle.fill" : "circle")
                        .font(.subheadline)
                        .foregroundStyle(isComplete ? AppColors.success500 : .secondary)

                    Text(step.label)
                        .font(.subheadline)

                    Spacer()

                    Button(readOnly ? "View" : "Edit") {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            viewModel.currentStep = step
                        }
                    }
                    .font(.caption.weight(.medium))
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .padding(.horizontal)
                .padding(.vertical, 10)

                if step != .thirdFinal {
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
    }

    // MARK: - Status Bar

    private var statusBar: some View {
        HStack {
            if readOnly {
                HStack(spacing: 6) {
                    if entry.hasSubmittedPredictions {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(AppColors.success500)
                        Text("Submitted")
                            .font(.caption.weight(.medium))
                    } else if entry.predictionsLocked {
                        Image(systemName: "lock.fill")
                            .foregroundStyle(AppColors.warning500)
                        Text("Locked")
                            .font(.caption.weight(.medium))
                    }
                }
                Spacer()
                if let pts = readOnlyPoints {
                    Text("\(pts) pts")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                }
            } else {
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
                            .foregroundStyle(AppColors.error500)
                        Text(msg)
                            .font(.caption)
                            .foregroundStyle(AppColors.error500)
                            .lineLimit(1)
                    } else if let lastSaved = viewModel.lastSavedAt {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(AppColors.success500)
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
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }

    // MARK: - Navigation Bar

    private var navigationBar: some View {
        HStack(spacing: 12) {
            // Back button
            if viewModel.currentStep != .groupRankings {
                Button {
                    if let prev = previousStep {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            viewModel.currentStep = prev
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
                if let next = nextStep {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            viewModel.currentStep = next
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(next == .review ? "Review" : "Next")
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                        }
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .glassButton()
                    }
                }
            } else if viewModel.currentStep == .review {
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
            } else if let next = nextStep {
                Button {
                    // Initialize third-place when leaving group rankings step
                    if viewModel.currentStep == .groupRankings {
                        viewModel.initializeThirdPlaceIfNeeded()
                    }
                    withAnimation(.easeInOut(duration: 0.2)) {
                        viewModel.currentStep = next
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(next == .review ? "Review" : "Next Round")
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                    }
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .modifier(BPNextRoundButtonStyle(isComplete: viewModel.canProceedFromStep(viewModel.currentStep)))
                }
                .disabled(!viewModel.canProceedFromStep(viewModel.currentStep))
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .padding(.bottom, 28)
    }

    // MARK: - Navigation Helpers

    private var previousStep: BPWizardStep? {
        let allCases = BPWizardStep.allCases
        guard let idx = allCases.firstIndex(of: viewModel.currentStep), idx > 0 else { return nil }
        return allCases[idx - 1]
    }

    private var nextStep: BPWizardStep? {
        let allCases = BPWizardStep.allCases
        guard let idx = allCases.firstIndex(of: viewModel.currentStep), idx < allCases.count - 1 else { return nil }
        return allCases[idx + 1]
    }
}

// MARK: - Next Round Button Style (matches PredictionWizardView)

private struct BPNextRoundButtonStyle: ViewModifier {
    let isComplete: Bool

    func body(content: Content) -> some View {
        if isComplete {
            content
                .foregroundStyle(.white)
                .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
                .shadow(color: Color.accentColor.opacity(0.3), radius: 8, y: 4)
        } else {
            content
                .glassButton()
                .opacity(0.5)
        }
    }
}
