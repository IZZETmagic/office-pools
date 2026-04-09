import SwiftUI

/// Compact table showing standings for a single group (4 teams).
/// Uses an abbreviated mobile layout: Pos, Team, P, GD, Pts.
struct GroupStandingsTable: View {
    let standings: [GroupStanding]

    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        VStack(spacing: 0) {
            headerRow
            Divider()
            ForEach(Array(standings.enumerated()), id: \.element.id) { index, standing in
                standingRow(position: index + 1, standing: standing)
                if index < standings.count - 1 {
                    Divider()
                }
            }
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: SPDesign.Radius.sm))
    }

    // MARK: - Header Row

    private var headerRow: some View {
        HStack(spacing: 0) {
            Text("#")
                .frame(width: 24, alignment: .center)
            Text("Team")
                .frame(maxWidth: .infinity, alignment: .leading)
            if sizeClass != .compact {
                Text("W").frame(width: 28, alignment: .center)
                Text("D").frame(width: 28, alignment: .center)
                Text("L").frame(width: 28, alignment: .center)
                Text("GF").frame(width: 28, alignment: .center)
                Text("GA").frame(width: 28, alignment: .center)
            }
            Text("P").frame(width: 24, alignment: .center)
            Text("GD").frame(width: 32, alignment: .center)
            Text("Pts").frame(width: 32, alignment: .center)
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(Color.sp.slate)
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }

    // MARK: - Standing Row

    private func standingRow(position: Int, standing: GroupStanding) -> some View {
        HStack(spacing: 0) {
            Text("\(position)")
                .frame(width: 24, alignment: .center)
            Text(standing.teamName)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: .leading)
            if sizeClass != .compact {
                Text("\(standing.won)").frame(width: 28, alignment: .center)
                Text("\(standing.drawn)").frame(width: 28, alignment: .center)
                Text("\(standing.lost)").frame(width: 28, alignment: .center)
                Text("\(standing.goalsFor)").frame(width: 28, alignment: .center)
                Text("\(standing.goalsAgainst)").frame(width: 28, alignment: .center)
            }
            Text("\(standing.played)").frame(width: 24, alignment: .center)
            Text(gdString(standing.goalDifference)).frame(width: 32, alignment: .center)
            Text("\(standing.points)")
                .fontWeight(.semibold)
                .frame(width: 32, alignment: .center)
        }
        .font(SPTypography.mono(size: 12))
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(rowBackground(for: position))
    }

    // MARK: - Row Background

    private func rowBackground(for position: Int) -> Color {
        switch position {
        case 1, 2:
            return Color.sp.greenLight
        case 3:
            return Color.sp.amberLight
        default:
            return .clear
        }
    }

    // MARK: - Helpers

    private func gdString(_ gd: Int) -> String {
        if gd > 0 { return "+\(gd)" }
        return "\(gd)"
    }
}
