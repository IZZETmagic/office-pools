import SwiftUI

/// Progressive tournament prediction flow.
/// Shows round tabs at the top, match predictions in the middle,
/// and a per-round submit button at the bottom.
struct ProgressivePredictionWizardView: View {
    @Bindable var viewModel: ProgressivePredictionEditViewModel
    let entry: Entry
    var readOnly: Bool = false
    var onSubmitSuccess: (() -> Void)? = nil

    @State private var showSubmitConfirmation = false
    @State private var groupsExpanded: Set<String> = []

    private var canEditCurrentRound: Bool {
        !readOnly && viewModel.canEditRound(viewModel.currentRoundKey)
    }

    var body: some View {
        ZStack {
            // Scrollable content
            ScrollView {
                VStack(spacing: 0) {
                    // Top inset for status bar
                    Spacer().frame(height: 44)

                    // Round tab selector
                    roundTabSelector
                        .padding(.top, 8)

                    // Round info banner
                    roundInfoBanner
                        .padding(.horizontal)
                        .padding(.top, 12)

                    // Stage title
                    HStack(alignment: .firstTextBaseline) {
                        Text(viewModel.currentRoundKey.displayName)
                            .font(.title2.weight(.bold))
                        Spacer()

                        if viewModel.currentRoundKey == .group && canEditCurrentRound {
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
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top, 18)
                    .padding(.bottom, 16)

                    // Match content
                    roundContent

                    // Bottom inset
                    Spacer().frame(height: 100)
                }
            }
            .scrollDismissesKeyboard(.interactively)

            // Floating status bar — pinned to top
            VStack {
                statusBar
                Spacer()
            }

            // Floating submit bar — pinned to bottom
            VStack {
                Spacer()
                bottomBar
            }
        }
        .alert("Submit \(viewModel.currentRoundKey.displayName)?", isPresented: $showSubmitConfirmation) {
            Button("Cancel", role: .cancel) { }
            Button("Submit", role: .destructive) {
                Task {
                    await viewModel.submitRound(entryId: entry.entryId)
                    if viewModel.submitSuccess {
                        onSubmitSuccess?()
                    }
                }
            }
        } message: {
            Text("Once submitted, your \(viewModel.currentRoundKey.displayName) predictions cannot be changed.")
        }
    }

    // MARK: - Round Tab Selector

    private var roundTabSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ProgressivePredictionEditViewModel.allRoundKeys, id: \.self) { key in
                    roundTab(key)
                }
            }
            .padding(.horizontal)
        }
    }

    private func roundTab(_ key: RoundKey) -> some View {
        let state = viewModel.roundState(for: key)?.state ?? .locked
        let isSelected = viewModel.currentRoundKey == key
        let isSubmitted = viewModel.isRoundSubmitted(key)
        let isLocked = state == .locked

        return Button {
            if !isLocked {
                withAnimation(.easeInOut(duration: 0.2)) {
                    viewModel.currentRoundKey = key
                }
            }
        } label: {
            HStack(spacing: 4) {
                if isSubmitted {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption2)
                        .foregroundStyle(AppColors.success500)
                } else if isLocked {
                    Image(systemName: "lock.fill")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                } else if state == .completed {
                    Image(systemName: "checkmark")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Text(roundTabLabel(key))
                    .font(.caption.weight(isSelected ? .semibold : .medium))
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                isSelected
                    ? Color.accentColor.opacity(0.15)
                    : isLocked
                        ? Color(.systemGray6).opacity(0.5)
                        : Color(.systemGray6)
            )
            .foregroundStyle(isSelected ? Color.accentColor : isLocked ? Color(.tertiaryLabel) : Color(.label))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .strokeBorder(
                        isSelected ? Color.accentColor.opacity(0.3) : .clear,
                        lineWidth: 1
                    )
            )
        }
        .disabled(isLocked)
    }

    private func roundTabLabel(_ key: RoundKey) -> String {
        switch key {
        case .group: return "Groups"
        case .round32: return "R32"
        case .round16: return "R16"
        case .quarterFinal: return "QF"
        case .semiFinal: return "SF"
        case .thirdPlace: return "3rd"
        case .final_: return "Final"
        }
    }

    // MARK: - Round Info Banner

    private var roundInfoBanner: some View {
        let state = viewModel.roundState(for: viewModel.currentRoundKey)?.state ?? .locked
        let isSubmitted = viewModel.isRoundSubmitted(viewModel.currentRoundKey)

        return Group {
            if isSubmitted {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(AppColors.success500)
                    Text("Submitted")
                        .font(.caption.weight(.medium))
                    Spacer()
                    if let sub = viewModel.roundSubmissions[viewModel.currentRoundKey.rawValue],
                       let at = sub.submittedAt {
                        Text(formatDeadline(at))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(AppColors.success500.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            } else if state == .open {
                if let deadline = viewModel.roundState(for: viewModel.currentRoundKey)?.deadline {
                    HStack(spacing: 6) {
                        Image(systemName: "clock")
                            .foregroundStyle(AppColors.warning500)
                        Text("Deadline: \(formatDeadline(deadline))")
                            .font(.caption.weight(.medium))
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(AppColors.warning500.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            } else if state == .completed {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle")
                        .foregroundStyle(.secondary)
                    Text("Round Completed")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            } else if state == .locked {
                HStack(spacing: 6) {
                    Image(systemName: "lock.fill")
                        .foregroundStyle(.tertiary)
                    Text("Round Locked")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.tertiary)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(.systemGray6).opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    // MARK: - Round Content

    @ViewBuilder
    private var roundContent: some View {
        if viewModel.currentRoundKey == .group {
            ProgressiveGroupStageView(
                viewModel: viewModel,
                readOnly: !canEditCurrentRound,
                expandedGroups: $groupsExpanded
            )
        } else {
            ProgressiveKnockoutRoundView(
                viewModel: viewModel,
                roundKey: viewModel.currentRoundKey,
                readOnly: !canEditCurrentRound
            )
        }
    }

    // MARK: - Status Bar

    private var statusBar: some View {
        HStack {
            Text(viewModel.progressText)
                .font(.caption.weight(.medium))

            Spacer()

            if canEditCurrentRound {
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
                    }
                }
            } else if viewModel.isRoundSubmitted(viewModel.currentRoundKey) {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.caption)
                        .foregroundStyle(AppColors.success500)
                    Text("Submitted")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        Group {
            if canEditCurrentRound {
                Button {
                    showSubmitConfirmation = true
                } label: {
                    HStack {
                        if viewModel.isSubmitting {
                            ProgressView()
                                .controlSize(.small)
                                .tint(.white)
                        }
                        Text("Submit \(viewModel.currentRoundKey.displayName)")
                            .font(.subheadline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(viewModel.isRoundComplete ? Color.accentColor : Color.gray)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .shadow(color: viewModel.isRoundComplete ? Color.accentColor.opacity(0.3) : .clear, radius: 8, y: 4)
                }
                .disabled(!viewModel.isRoundComplete || viewModel.isSubmitting)
                .padding(.horizontal)
                .padding(.vertical, 10)
                .padding(.bottom, 28)
            } else {
                EmptyView()
            }
        }
    }

    // MARK: - Helpers

    private func formatDeadline(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = formatter.date(from: iso)
        if date == nil {
            formatter.formatOptions = [.withInternetDateTime]
            date = formatter.date(from: iso)
        }
        guard let d = date else { return iso }

        let df = DateFormatter()
        df.dateStyle = .medium
        df.timeStyle = .short
        return df.string(from: d)
    }
}

// MARK: - Progressive Knockout Round View

/// Renders knockout matches for a specific round in progressive mode.
/// Uses actual team assignments from match data instead of bracket predictions.
struct ProgressiveKnockoutRoundView: View {
    @Bindable var viewModel: ProgressivePredictionEditViewModel
    let roundKey: RoundKey
    var readOnly: Bool = false

    var body: some View {
        let matches = viewModel.matchesForRound(roundKey)

        LazyVStack(spacing: 12) {
            ForEach(matches) { match in
                knockoutMatchCard(match: match, isFinal: match.stage == "final")
            }
        }
        .padding(.vertical, 8)
    }

    private func knockoutMatchCard(match: Match, isFinal: Bool = false) -> some View {
        let resolved = viewModel.resolvedTeamsForMatch(match.matchNumber)
        let bothResolved = resolved.home != nil && resolved.away != nil

        return VStack(spacing: 0) {
            if bothResolved || readOnly {
                MatchPredictionRow(
                    match: match,
                    isKnockout: true,
                    prediction: viewModel.predictions[match.matchId],
                    saveStatus: viewModel.saveStatus,
                    onScoreUpdate: { home, away in
                        viewModel.updateScore(matchId: match.matchId, homeScore: home, awayScore: away)
                    },
                    onPsoUpdate: { homePso, awayPso in
                        viewModel.updatePso(matchId: match.matchId, homePso: homePso, awayPso: awayPso)
                    },
                    readOnly: readOnly,
                    homeTeamOverride: resolved.home?.teamName,
                    awayTeamOverride: resolved.away?.teamName,
                    homeSubtitle: match.homeTeamPlaceholder,
                    awaySubtitle: match.awayTeamPlaceholder,
                    homeFlagOverride: flagUrl(for: resolved.home),
                    awayFlagOverride: flagUrl(for: resolved.away)
                )
                .padding(.horizontal)
            } else {
                // Teams not yet assigned
                disabledMatchRow(match: match, resolved: resolved)
                    .padding(.horizontal)
            }
        }
        .padding(.vertical, 4)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(
                    isFinal ? AppColors.accent400.opacity(0.6) : Color(.systemGray4),
                    lineWidth: isFinal ? 2 : 0.5
                )
        )
        .padding(.horizontal)
    }

    private func disabledMatchRow(match: Match, resolved: (home: GroupStanding?, away: GroupStanding?)) -> some View {
        HStack(spacing: 0) {
            Text(resolved.home?.teamName ?? match.homeTeamPlaceholder ?? "TBD")
                .font(.subheadline)
                .foregroundStyle(resolved.home != nil ? .primary : .secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .trailing)

            HStack(spacing: 6) {
                Text("?")
                    .font(.headline)
                    .foregroundStyle(.quaternary)
                    .frame(width: 38, height: 36)
                    .background(Color(.systemGray6).opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Text("-")
                    .font(.headline)
                    .foregroundStyle(.quaternary)
                Text("?")
                    .font(.headline)
                    .foregroundStyle(.quaternary)
                    .frame(width: 38, height: 36)
                    .background(Color(.systemGray6).opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .padding(.horizontal, 8)

            Text(resolved.away?.teamName ?? match.awayTeamPlaceholder ?? "TBD")
                .font(.subheadline)
                .foregroundStyle(resolved.away != nil ? .primary : .secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)

            Color.clear.frame(width: 20)
        }
        .padding(.vertical, 6)
    }

    private func flagUrl(for standing: GroupStanding?) -> String? {
        guard let standing else { return nil }
        return viewModel.teams.first(where: { $0.teamId == standing.teamId })?.flagUrl
    }

}
