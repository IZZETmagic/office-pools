import SwiftUI

struct LeaderboardTabView: View {
    let leaderboard: [LeaderboardEntry]

    var body: some View {
        if leaderboard.isEmpty {
            ContentUnavailableView("No Entries Yet", systemImage: "trophy", description: Text("The leaderboard will appear once entries are submitted."))
        } else {
            List {
                ForEach(leaderboard) { item in
                    LeaderboardRow(item: item)
                }
            }
            .listStyle(.plain)
        }
    }
}

struct LeaderboardRow: View {
    let item: LeaderboardEntry

    var body: some View {
        HStack(spacing: 12) {
            // Rank
            Text(rankDisplay)
                .font(.headline.monospacedDigit())
                .frame(width: 32)
                .foregroundStyle(rankColor)

            // Rank movement indicator
            if let delta = item.entry.rankDelta {
                rankMovement(delta)
            }

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
                Text("\(item.entry.totalPoints)")
                    .font(.headline.monospacedDigit())

                Text("pts")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var rankDisplay: String {
        if let rank = item.entry.currentRank {
            return "\(rank)"
        }
        return "-"
    }

    private var rankColor: Color {
        switch item.entry.currentRank {
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
