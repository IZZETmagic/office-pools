import SwiftUI

/// Displays the 12 third-place teams in a reorderable list.
/// Top 8 qualify for the Round of 32; bottom 4 are eliminated.
/// A visual "qualification line" separates positions 8 and 9.
struct BPThirdPlaceRankingView: View {
    @Bindable var viewModel: BracketPickerViewModel
    let readOnly: Bool

    @State private var localRanking: [String] = []

    var body: some View {
        VStack(spacing: 12) {
            // Help text
            VStack(alignment: .leading, spacing: 4) {
                Text("Rank the 12 third-place teams from strongest to weakest")
                    .font(SPTypography.body)
                    .foregroundStyle(Color.sp.ink)
                Text("Top 8 teams advance to the Round of 32. The bottom 4 are eliminated.")
                    .font(SPTypography.detail)
                    .foregroundStyle(Color.sp.slate)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)

            // Sortable list
            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("Third-Place Rankings")
                        .font(SPTypography.cardTitle)
                        .foregroundStyle(Color.sp.ink)
                    Spacer()
                    Text("\(localRanking.count) teams")
                        .font(SPTypography.detail)
                        .foregroundStyle(Color.sp.slate)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.sp.mist)

                Divider()

                if readOnly {
                    readOnlyList
                } else {
                    editableList
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
        .onAppear { localRanking = viewModel.thirdPlaceRanking }
        .onChange(of: viewModel.thirdPlaceRanking) { _, newValue in
            localRanking = newValue
        }
    }

    // MARK: - Editable List

    private var editableList: some View {
        List {
            ForEach(Array(localRanking.enumerated()), id: \.element) { idx, teamId in
                let rank = idx + 1
                let qualifies = rank <= 8

                VStack(spacing: 0) {
                    ThirdPlaceTeamRow(
                        team: viewModel.teamMap[teamId],
                        rank: rank,
                        qualifies: qualifies
                    )

                    // Qualification cutoff line between position 8 and 9
                    if rank == 8 {
                        qualificationLine
                    }
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }
            .onMove { indices, newOffset in
                localRanking.move(fromOffsets: indices, toOffset: newOffset)
                viewModel.updateThirdPlaceRanking(localRanking)
            }
        }
        .listStyle(.plain)
        .environment(\.editMode, .constant(.active))
        .frame(height: CGFloat(localRanking.count) * 56 + 30) // Extra for cutoff line
        .scrollDisabled(true)
    }

    // MARK: - Read-Only List

    private var readOnlyList: some View {
        VStack(spacing: 0) {
            ForEach(Array(localRanking.enumerated()), id: \.element) { idx, teamId in
                let rank = idx + 1
                let qualifies = rank <= 8

                ThirdPlaceTeamRow(
                    team: viewModel.teamMap[teamId],
                    rank: rank,
                    qualifies: qualifies
                )

                if rank == 8 {
                    qualificationLine
                } else if rank < localRanking.count {
                    Divider().padding(.leading, 44)
                }
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Qualification Line

    private var qualificationLine: some View {
        HStack(spacing: 8) {
            Rectangle()
                .fill(Color.sp.red.opacity(0.4))
                .frame(height: 1)

            Text("QUALIFICATION LINE")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Color.sp.red)
                .fixedSize()

            Rectangle()
                .fill(Color.sp.red.opacity(0.4))
                .frame(height: 1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }
}

// MARK: - Third Place Team Row

private struct ThirdPlaceTeamRow: View {
    let team: Team?
    let rank: Int
    let qualifies: Bool

    var body: some View {
        HStack(spacing: 8) {
            // Rank badge
            Text("\(rank)")
                .font(.caption.weight(.bold))
                .foregroundStyle(qualifies ? Color.sp.green : Color.sp.red)
                .frame(width: 26)
                .padding(.vertical, 3)
                .background(qualifies ? Color.sp.greenLight : Color.sp.redLight)
                .clipShape(RoundedRectangle(cornerRadius: 6))

            // Flag
            if let flagStr = team?.flagUrl, let url = URL(string: flagStr) {
                CachedAsyncImage(url: url, width: 24, height: 16, cornerRadius: 2)
            } else {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.sp.silver)
                    .frame(width: 24, height: 16)
            }

            // Team name + group
            VStack(alignment: .leading, spacing: 1) {
                Text(team?.countryName ?? "Unknown")
                    .font(SPTypography.body)
                    .lineLimit(1)
                Text("3rd in Group \(team?.groupLetter ?? "?")")
                    .font(.caption2)
                    .foregroundStyle(Color.sp.slate)
            }

            Spacer()

            // Status badge
            Text(qualifies ? "QUALIFIED" : "ELIMINATED")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(qualifies ? Color.sp.green : Color.sp.red)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(qualifies ? Color.sp.greenLight : Color.sp.redLight)
                .clipShape(RoundedRectangle(cornerRadius: 4))
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 8)
        .opacity(qualifies ? 1.0 : 0.6)
        .contentShape(Rectangle())
    }
}
