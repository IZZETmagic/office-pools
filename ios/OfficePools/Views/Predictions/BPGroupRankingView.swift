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
                    .font(SPTypography.body)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.sp.ink)
                +
                Text(" / 12 groups ranked")
                    .font(SPTypography.body)
                    .foregroundColor(Color.sp.slate)

                Spacer()

                if touchedGroups.count == 12 {
                    Label("All ranked", systemImage: "checkmark.circle.fill")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.green)
                }
            }
            .padding(.horizontal)

            if touchedGroups.isEmpty && !readOnly {
                Text("Rankings initialized from FIFA rankings \u{2014} reorder to make your predictions")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
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
                    .font(SPTypography.cardTitle)
                    .foregroundStyle(Color.sp.ink)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.sp.mist)

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
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: SPDesign.Radius.md)
                .strokeBorder(Color.sp.silver, lineWidth: AppDesign.Border.thin)
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
        case 0, 1: return Color.sp.green
        case 2: return Color.sp.amber
        default: return Color.sp.slate
        }
    }

    private var positionBackground: Color {
        switch position {
        case 0, 1: return Color.sp.greenLight
        case 2: return Color.sp.amberLight
        default: return Color.sp.mist
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
                    .fill(Color.sp.silver)
                    .frame(width: 24, height: 16)
            }

            // Team name
            Text(team?.countryName ?? "Unknown")
                .font(SPTypography.body)
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }
}
