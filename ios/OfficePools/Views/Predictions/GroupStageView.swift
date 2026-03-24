import SwiftUI

/// Shows all 12 groups as collapsible sections with match prediction rows and live standings.
/// The first incomplete group is expanded by default. In read-only mode, all groups start collapsed.
struct GroupStageView: View {
    @Bindable var viewModel: PredictionEditViewModel
    var readOnly: Bool = false

    @State private var expandedGroups: Set<String> = []
    @State private var didSetDefaults = false

    var body: some View {
        LazyVStack(spacing: 12) {
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
        let isGroupComplete = completedCount == totalCount && totalCount > 0

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
                        Text("\(completedCount)/\(totalCount)")
                            .font(.caption.weight(.medium).monospacedDigit())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(isGroupComplete ? Color.green.opacity(0.15) : (completedCount > 0 ? Color.yellow.opacity(0.15) : Color(.systemGray5)))
                            .foregroundStyle(isGroupComplete ? .green : (completedCount > 0 ? .orange : .secondary))
                            .clipShape(Capsule())
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
                .background(Color(.systemGray6))
            }
            .buttonStyle(.plain)

            // Expanded content
            if isExpanded {
                VStack(spacing: 0) {
                    // Match prediction rows
                    ForEach(matches) { match in
                        MatchPredictionRow(
                            match: match,
                            isKnockout: false,
                            prediction: viewModel.predictions[match.matchId],
                            saveStatus: viewModel.saveStatus,
                            onScoreUpdate: { home, away in
                                viewModel.updateScore(matchId: match.matchId, homeScore: home, awayScore: away)
                            },
                            onPsoUpdate: { _, _ in },
                            readOnly: readOnly
                        )
                        .padding(.horizontal)

                        if match.id != matches.last?.id {
                            Divider().padding(.horizontal)
                        }
                    }

                    // Group standings table
                    let standings = viewModel.standingsForGroup(letter)
                    if !standings.isEmpty {
                        GroupStandingsTable(standings: standings)
                            .padding(.horizontal)
                            .padding(.vertical, 8)
                    }
                }
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
