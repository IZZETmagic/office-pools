import SwiftUI

/// Table showing all 12 third-place teams ranked, with the top 8 advancing to the Round of 32.
struct ThirdPlaceTableView: View {
    let rankedThirds: [GroupStanding]
    let qualifiedThirds: [GroupStanding]

    private var qualifiedIds: Set<String> {
        Set(qualifiedThirds.map(\.teamId))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Third-Place Rankings")
                .font(.subheadline.weight(.semibold))

            if rankedThirds.isEmpty {
                Text("Complete group predictions to see third-place rankings.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            } else {
                VStack(spacing: 0) {
                    headerRow
                    ForEach(Array(rankedThirds.enumerated()), id: \.element.id) { index, standing in
                        thirdRow(rank: index + 1, standing: standing)
                        if index < rankedThirds.count - 1 {
                            Divider()
                        }
                    }
                }
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(Color(.systemGray4), lineWidth: 0.5)
                )
            }
        }
    }

    // MARK: - Header Row

    private var headerRow: some View {
        HStack(spacing: 0) {
            Text("#")
                .frame(width: 24, alignment: .center)
            Text("Team")
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("Grp")
                .frame(width: 32, alignment: .center)
            Text("Pts")
                .frame(width: 30, alignment: .center)
            Text("GD")
                .frame(width: 32, alignment: .center)
            Text("GF")
                .frame(width: 28, alignment: .center)
            Text("")
                .frame(width: 60, alignment: .center)
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color(.systemGray6))
    }

    // MARK: - Row

    private func thirdRow(rank: Int, standing: GroupStanding) -> some View {
        let advances = qualifiedIds.contains(standing.teamId)
        return HStack(spacing: 0) {
            Text("\(rank)")
                .frame(width: 24, alignment: .center)
            Text(standing.teamName)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(standing.groupLetter)
                .frame(width: 32, alignment: .center)
            Text("\(standing.points)")
                .frame(width: 30, alignment: .center)
            Text(gdString(standing.goalDifference))
                .frame(width: 32, alignment: .center)
            Text("\(standing.goalsFor)")
                .frame(width: 28, alignment: .center)
            Text(advances ? "Advance" : "Eliminated")
                .font(.caption2.weight(.medium))
                .foregroundStyle(advances ? AppColors.success600 : AppColors.error600)
                .frame(width: 60, alignment: .center)
        }
        .font(.caption.monospacedDigit())
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(advances ? AppColors.success500.opacity(0.06) : AppColors.error500.opacity(0.06))
    }

    // MARK: - Helpers

    private func gdString(_ gd: Int) -> String {
        if gd > 0 { return "+\(gd)" }
        return "\(gd)"
    }
}
