import SwiftUI

/// Shows all 12 groups as collapsible sections with match prediction rows and live standings.
/// The first incomplete group is expanded by default. In read-only mode, all groups start collapsed.
struct GroupStageView: View {
    @Bindable var viewModel: PredictionEditViewModel
    var readOnly: Bool = false

    @State private var expandedGroups: Set<String> = []
    @State private var didSetDefaults = false
    @FocusState private var focusedField: ScoreFieldID?

    var body: some View {
        ScrollViewReader { proxy in
            LazyVStack(spacing: 12) {
                // Expand All / Collapse All toggle
                if !readOnly {
                    HStack {
                        Spacer()
                        Button {
                            withAnimation(.easeInOut(duration: 0.25)) {
                                if expandedGroups.count == GROUP_LETTERS.count {
                                    expandedGroups.removeAll()
                                } else {
                                    expandedGroups = Set(GROUP_LETTERS)
                                }
                            }
                        } label: {
                            Text(expandedGroups.count == GROUP_LETTERS.count ? "Collapse All" : "Expand All")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                    .padding(.horizontal, 20)
                }

                ForEach(GROUP_LETTERS, id: \.self) { letter in
                    groupSection(letter: letter)
                }

                // Third-place rankings at the bottom
                ThirdPlaceTableView(
                    rankedThirds: viewModel.rankedThirds,
                    qualifiedThirds: viewModel.qualifiedThirds
                )
                .padding(.horizontal)
                .padding(.top, 8)
                .padding(.bottom, 16)
            }
            .padding(.vertical, 8)
            .onChange(of: focusedField) { _, newField in
                guard let newField else { return }
                let matchId: String
                switch newField {
                case .home(let id): matchId = id
                case .away(let id): matchId = id
                }
                withAnimation(.easeInOut(duration: 0.3)) {
                    proxy.scrollTo("match_\(matchId)", anchor: .center)
                }
            }
        }
        .onAppear {
            guard !didSetDefaults else { return }
            didSetDefaults = true
            if readOnly {
                // In read-only mode, start with all groups collapsed
                return
            }
            // Expand first incomplete group by default
            for letter in GROUP_LETTERS {
                let matches = viewModel.matchesForGroup(letter)
                let allComplete = matches.allSatisfy { match in
                    guard let pred = viewModel.predictions[match.matchId] else { return false }
                    return pred.homeScore != nil && pred.awayScore != nil
                }
                if !allComplete {
                    expandedGroups.insert(letter)
                    break
                }
            }
            // If all groups complete, expand none (user can tap to open)
        }
    }

    // MARK: - Group Section

    private func groupSection(letter: String) -> some View {
        let isExpanded = expandedGroups.contains(letter)
        let matches = viewModel.matchesForGroup(letter)
        let completedCount = matches.filter { match in
            guard let pred = viewModel.predictions[match.matchId] else { return false }
            return pred.homeScore != nil && pred.awayScore != nil
        }.count
        let totalCount = matches.count
        return VStack(spacing: 0) {
            // Header
            Button {
                withAnimation(.easeInOut(duration: 0.25)) {
                    if isExpanded {
                        expandedGroups.remove(letter)
                    } else {
                        expandedGroups.insert(letter)
                    }
                }
            } label: {
                HStack {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 16)

                    Text("Group \(letter)")
                        .font(.subheadline.weight(.semibold))

                    Spacer()

                    if !readOnly {
                        GroupProgressRing(
                            completed: completedCount,
                            total: totalCount
                        )
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
                .background(Color(.systemGray5).opacity(0.6))
            }
            .buttonStyle(.plain)

            // Expanded content
            if isExpanded {
                VStack(spacing: 8) {
                    // Match prediction rows — each in its own card
                    ForEach(Array(matches.enumerated()), id: \.element.id) { index, match in
                        let nextMatchId = index + 1 < matches.count ? matches[index + 1].matchId : nil

                        PredictionMatchCard(
                            match: match,
                            viewModel: viewModel,
                            readOnly: readOnly,
                            focusedField: readOnly ? nil : $focusedField,
                            onAwayScoreEntered: {
                                if let nextMatchId {
                                    focusedField = .home(nextMatchId)
                                } else {
                                    focusedField = nil
                                }
                            }
                        )
                        .id("match_\(match.matchId)")
                    }

                    // Group standings table
                    let standings = viewModel.standingsForGroup(letter)
                    if !standings.isEmpty {
                        GroupStandingsTable(standings: standings)
                            .padding(.horizontal)
                            .padding(.vertical, 8)
                    }
                }
                .padding(.vertical, 8)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(Color(.systemGray4), lineWidth: 0.5)
        )
        .padding(.horizontal)
    }
}

// MARK: - Group Progress Ring

private struct GroupProgressRing: View {
    let completed: Int
    let total: Int

    private var progress: Double {
        total > 0 ? Double(completed) / Double(total) : 0
    }

    private var ringColor: Color {
        if completed == total && total > 0 { return .green }
        if completed > 0 { return .orange }
        return Color(.systemGray3)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(.systemGray4), lineWidth: 2.5)

            Circle()
                .trim(from: 0, to: progress)
                .stroke(ringColor, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                .rotationEffect(.degrees(-90))

            Text("\(completed)")
                .font(.system(size: 10, weight: .bold).monospacedDigit())
                .foregroundStyle(ringColor)
        }
        .frame(width: 26, height: 26)
    }
}

// MARK: - Match Card with Pulse Animation

/// Wraps a MatchPredictionRow in a card that pulses blue when completed.
private struct PredictionMatchCard: View {
    let match: Match
    @Bindable var viewModel: PredictionEditViewModel
    var readOnly: Bool
    var focusedField: FocusState<ScoreFieldID?>.Binding?
    var onAwayScoreEntered: (() -> Void)?

    @State private var blueOpacity: Double = 0.06
    @State private var isPulsing = false

    private var isMatchComplete: Bool {
        guard let pred = viewModel.predictions[match.matchId] else { return false }
        return pred.homeScore != nil && pred.awayScore != nil
    }

    var body: some View {
        MatchPredictionRow(
            match: match,
            isKnockout: false,
            prediction: viewModel.predictions[match.matchId],
            saveStatus: viewModel.saveStatus,
            onScoreUpdate: { home, away in
                viewModel.updateScore(matchId: match.matchId, homeScore: home, awayScore: away)
            },
            onPsoUpdate: { _, _ in },
            readOnly: readOnly,
            focusedField: focusedField,
            onAwayScoreEntered: onAwayScoreEntered
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(isMatchComplete
                    ? Color.accentColor.opacity(blueOpacity)
                    : Color(.secondarySystemGroupedBackground))
        )
        .padding(.horizontal, 10)
        .onChange(of: isMatchComplete) { oldVal, newVal in
            if newVal && !oldVal && !isPulsing {
                triggerHeartbeatPulse()
            } else if !newVal {
                blueOpacity = 0.06
            }
        }
    }

    private func triggerHeartbeatPulse() {
        isPulsing = true

        withAnimation(.easeOut(duration: 0.25)) {
            blueOpacity = 0.11
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            withAnimation(.easeIn(duration: 0.4)) {
                blueOpacity = 0.06
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                isPulsing = false
            }
        }
    }
}
