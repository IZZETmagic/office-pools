import SwiftUI

/// Displays all 12 groups as reorderable cards for bracket picker mode.
/// Users drag teams to predict the finishing order (1st-4th) in each group.
struct BPGroupRankingView: View {
    @Bindable var viewModel: BracketPickerViewModel
    let readOnly: Bool

    @State private var touchedGroups: Set<String> = []

    var body: some View {
        LazyVStack(spacing: 12) {
            // Progress header
            HStack {
                Text("\(touchedGroups.count)")
                    .font(.subheadline.weight(.bold))
                +
                Text(" / 12 groups ranked")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Spacer()

                if touchedGroups.count == 12 {
                    Label("All ranked", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(AppColors.success500)
                }
            }
            .padding(.horizontal)

            if touchedGroups.isEmpty && !readOnly {
                Text("Rankings initialized from FIFA rankings \u{2014} reorder to make your predictions")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            }

            // Group cards
            ForEach(GROUP_LETTERS, id: \.self) { letter in
                BPGroupCard(
                    groupLetter: letter,
                    teamIds: viewModel.groupRankings[letter] ?? [],
                    teamMap: viewModel.teamMap,
                    readOnly: readOnly,
                    onReorder: { newOrder in
                        touchedGroups.insert(letter)
                        viewModel.updateGroupRanking(groupLetter: letter, teamIds: newOrder)
                    }
                )
            }
        }
        .padding(.horizontal)
    }
}

// MARK: - Group Card

private struct BPGroupCard: View {
    let groupLetter: String
    let teamIds: [String]
    let teamMap: [String: Team]
    let readOnly: Bool
    let onReorder: ([String]) -> Void

    @State private var localTeamIds: [String] = []

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Group \(groupLetter)")
                    .font(.subheadline.weight(.bold))
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color(.systemGray6))

            Divider()

            // Team rows
            if readOnly {
                VStack(spacing: 0) {
                    ForEach(Array(localTeamIds.enumerated()), id: \.element) { idx, teamId in
                        BPTeamRow(
                            team: teamMap[teamId],
                            position: idx,
                            showDragHandle: false
                        )
                        if idx < localTeamIds.count - 1 {
                            Divider().padding(.leading, 44)
                        }
                    }
                }
                .padding(.vertical, 4)
            } else {
                List {
                    ForEach(localTeamIds, id: \.self) { teamId in
                        BPTeamRow(
                            team: teamMap[teamId],
                            position: localTeamIds.firstIndex(of: teamId) ?? 0,
                            showDragHandle: true
                        )
                        .listRowInsets(EdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    }
                    .onMove { indices, newOffset in
                        localTeamIds.move(fromOffsets: indices, toOffset: newOffset)
                        onReorder(localTeamIds)
                    }
                }
                .listStyle(.plain)
                .environment(\.editMode, .constant(.active))
                .frame(height: CGFloat(localTeamIds.count) * 50)
                .scrollDisabled(true)
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color(.systemGray4), lineWidth: 0.5)
        )
        .onAppear { localTeamIds = teamIds }
        .onChange(of: teamIds) { _, newValue in
            localTeamIds = newValue
        }
    }
}

// MARK: - Team Row

private struct BPTeamRow: View {
    let team: Team?
    let position: Int
    let showDragHandle: Bool

    private var positionLabel: String {
        switch position {
        case 0: return "1st"
        case 1: return "2nd"
        case 2: return "3rd"
        case 3: return "4th"
        default: return "\(position + 1)"
        }
    }

    private var positionColor: Color {
        switch position {
        case 0, 1: return AppColors.success500
        case 2: return AppColors.warning500
        default: return AppColors.neutral400
        }
    }

    private var positionBackground: Color {
        switch position {
        case 0, 1: return AppColors.success100
        case 2: return AppColors.warning100
        default: return AppColors.neutral100
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            // Position badge
            Text(positionLabel)
                .font(.caption2.weight(.bold))
                .foregroundStyle(positionColor)
                .frame(width: 30)
                .padding(.vertical, 3)
                .background(positionBackground)
                .clipShape(RoundedRectangle(cornerRadius: 6))

            // Flag
            if let flagStr = team?.flagUrl, let url = URL(string: flagStr) {
                CachedAsyncImage(url: url, width: 24, height: 16, cornerRadius: 2)
            } else {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color(.systemGray4))
                    .frame(width: 24, height: 16)
            }

            // Team name
            Text(team?.countryName ?? "Unknown")
                .font(.subheadline.weight(.medium))
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }
}
