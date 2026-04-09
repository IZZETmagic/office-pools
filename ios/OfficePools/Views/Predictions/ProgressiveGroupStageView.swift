import SwiftUI

/// Group stage view for progressive tournament mode.
/// Functionally identical to GroupStageView but accepts ProgressivePredictionEditViewModel.
struct ProgressiveGroupStageView: View {
    @Bindable var viewModel: ProgressivePredictionEditViewModel
    var readOnly: Bool = false

    @Binding var expandedGroups: Set<String>
    @State private var didSetDefaults = false
    @FocusState private var focusedField: ScoreFieldID?

    var body: some View {
        ScrollViewReader { proxy in
            VStack(spacing: 12) {
                ForEach(GROUP_LETTERS, id: \.self) { letter in
                    groupSection(letter: letter)
                }

                ThirdPlaceTableView(
                    rankedThirds: viewModel.rankedThirds,
                    qualifiedThirds: viewModel.qualifiedThirds
                )
                .padding(.horizontal)
                .padding(.top, 8)
                .padding(.bottom, 16)
            }
            .padding(.top, 2)
            .padding(.bottom, 8)
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
            if readOnly { return }
            for letter in GROUP_LETTERS {
                let matches = viewModel.matchesForGroup(letter)
                let allComplete = matches.allSatisfy { match in
                    guard let pred = viewModel.predictions[match.matchId] else { return false }
                    return pred.homeScore != nil && pred.awayScore != nil
                }
                if !allComplete {
                    expandedGroups.insert(letter)
                    for match in matches {
                        let pred = viewModel.predictions[match.matchId]
                        if pred?.homeScore == nil {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                focusedField = .home(match.matchId)
                            }
                            break
                        } else if pred?.awayScore == nil {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                focusedField = .away(match.matchId)
                            }
                            break
                        }
                    }
                    break
                }
            }
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
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                        .frame(width: 16)

                    Text("Group \(letter)")
                        .font(SPTypography.cardTitle)
                        .foregroundStyle(Color.sp.ink)

                    Spacer()

                    if !readOnly {
                        ProgressiveGroupProgressRing(
                            completed: completedCount,
                            total: totalCount
                        )
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 14)
                .background(Color.white)
            }
            .buttonStyle(.plain)

            if isExpanded {
                Divider().padding(.horizontal)

                VStack(spacing: 8) {
                    ForEach(Array(matches.enumerated()), id: \.element.id) { index, match in
                        let nextMatchId = index + 1 < matches.count ? matches[index + 1].matchId : nil

                        ProgressivePredictionMatchCard(
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
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                .strokeBorder(Color.sp.silver, lineWidth: AppDesign.Border.thin)
        )
        .padding(.horizontal)
    }
}

// MARK: - Progressive Group Progress Ring

private struct ProgressiveGroupProgressRing: View {
    let completed: Int
    let total: Int

    private var progress: Double {
        total > 0 ? Double(completed) / Double(total) : 0
    }

    private var ringColor: Color {
        if completed == total && total > 0 { return Color.sp.green }
        if completed > 0 { return Color.sp.amber }
        return Color.sp.silver
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.sp.silver, lineWidth: 2.5)
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

// MARK: - Progressive Match Card

private struct ProgressivePredictionMatchCard: View {
    let match: Match
    @Bindable var viewModel: ProgressivePredictionEditViewModel
    var readOnly: Bool
    var focusedField: FocusState<ScoreFieldID?>.Binding?
    var onAwayScoreEntered: (() -> Void)?

    @State private var pulseScale: CGFloat = 1.0
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
                .fill(isMatchComplete ? Color.sp.primaryLight : Color.clear)
        )
        .scaleEffect(pulseScale)
        .padding(.horizontal, 10)
        .onChange(of: isMatchComplete) { oldVal, newVal in
            if newVal && !oldVal && !isPulsing {
                triggerHeartbeatPulse()
            }
        }
    }

    private func triggerHeartbeatPulse() {
        isPulsing = true
        withAnimation(.easeOut(duration: 0.15)) {
            pulseScale = 1.03
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                pulseScale = 1.0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                isPulsing = false
            }
        }
    }
}
