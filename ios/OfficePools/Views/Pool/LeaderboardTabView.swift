import SwiftUI

struct LeaderboardTabView: View {
    let leaderboard: [LeaderboardEntry]
    let pointsForEntry: (String) -> Int

    var body: some View {
        if leaderboard.isEmpty {
            ContentUnavailableView("No Entries Yet", systemImage: "trophy", description: Text("The leaderboard will appear once entries are submitted."))
        } else {
            List {
                ForEach(Array(leaderboard.enumerated()), id: \.element.id) { index, item in
                    LeaderboardRow(item: item, rank: index + 1, points: pointsForEntry(item.entry.entryId))
                }
            }
            .listStyle(.plain)
        }
    }
}

struct LeaderboardRow: View {
    let item: LeaderboardEntry
    let rank: Int
    let points: Int

    var body: some View {
        HStack(spacing: 12) {
            // Rank
            Text("\(rank)")
                .font(.headline.monospacedDigit())
                .frame(width: 32)
                .foregroundStyle(rankColor)

            // Name & entry
            VStack(alignment: .leading, spacing: 2) {
                Text(item.user.fullName)
                    .font(.subheadline.weight(.medium))

                Text(item.entry.entryName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Points
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(points)")
                    .font(.headline.monospacedDigit())

                Text("pts")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var rankColor: Color {
        switch rank {
        case 1: return .yellow
        case 2: return .gray
        case 3: return .orange
        default: return .primary
        }
    }

    @ViewBuilder
    private func rankMovement(_ delta: Int) -> some View {
        if delta > 0 {
            Image(systemName: "arrow.up")
                .font(.caption2)
                .foregroundStyle(.green)
        } else if delta < 0 {
            Image(systemName: "arrow.down")
                .font(.caption2)
                .foregroundStyle(.red)
        }
    }
}
