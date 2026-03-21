import SwiftUI

struct LeaderboardTabView: View {
    let leaderboardData: [LeaderboardEntryData]
    let response: LeaderboardResponse?
    let currentUserId: String?
    let awardsForEntry: (String) -> [PoolAward]
    let isCurrentUser: (String) -> Bool

    var body: some View {
        if leaderboardData.isEmpty {
            ContentUnavailableView("No Entries Yet", systemImage: "trophy", description: Text("The leaderboard will appear once entries are submitted."))
        } else {
            ScrollView {
                LazyVStack(spacing: 16) {
                    // Matchday MVP Banner
                    if let mvp = response?.matchdayMvp {
                        matchdayMVPBanner(mvp)
                    }

                    // Podium (top 3)
                    if leaderboardData.count >= 3 {
                        podiumView
                    }

                    // Legend
                    legendView

                    // Remaining entries (rank 4+)
                    let startIndex = min(3, leaderboardData.count)
                    if startIndex < leaderboardData.count {
                        ForEach(Array(leaderboardData[startIndex...].enumerated()), id: \.element.id) { index, entry in
                            leaderboardRow(entry: entry, rank: startIndex + index + 1)
                        }
                    }

                    // If fewer than 3, show all as rows
                    if leaderboardData.count < 3 {
                        ForEach(Array(leaderboardData.enumerated()), id: \.element.id) { index, entry in
                            leaderboardRow(entry: entry, rank: index + 1)
                        }
                    }

                    // Superlatives
                    if let superlatives = response?.superlatives, !superlatives.isEmpty {
                        superlativesSection(superlatives)
                    }

                    // Matchday Info
                    if let info = response?.matchdayInfo {
                        matchdayInfoBar(info)
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 20)
            }
        }
    }

    // MARK: - Matchday MVP Banner

    private func matchdayMVPBanner(_ mvp: MatchdayMVP) -> some View {
        HStack(spacing: 8) {
            Text("⭐")
                .font(.title3)
            VStack(alignment: .leading, spacing: 2) {
                Text("Matchday MVP")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text("\(mvp.entryName.isEmpty ? mvp.fullName : mvp.entryName) scored \(mvp.matchPoints) pts on Match \(mvp.matchNumber)")
                    .font(.subheadline.weight(.medium))
            }
            Spacer()
        }
        .padding(12)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Podium

    private var podiumView: some View {
        HStack(alignment: .bottom, spacing: 8) {
            // 2nd place
            podiumEntry(entry: leaderboardData[1], rank: 2, pedestalHeight: 105, medal: "🥈", ringColor: .gray)

            // 1st place
            podiumEntry(entry: leaderboardData[0], rank: 1, pedestalHeight: 130, medal: "🏆", ringColor: .yellow)

            // 3rd place
            podiumEntry(entry: leaderboardData[2], rank: 3, pedestalHeight: 85, medal: "🥉", ringColor: .orange)
        }
        .padding(.top, 8)
    }

    private func podiumEntry(entry: LeaderboardEntryData, rank: Int, pedestalHeight: CGFloat, medal: String, ringColor: Color) -> some View {
        VStack(spacing: 6) {
            // Medal
            ZStack {
                Circle()
                    .stroke(ringColor, lineWidth: 3)
                    .frame(width: 52, height: 52)
                Text(medal)
                    .font(.title2)
            }

            // Name
            Text(entry.entryName.isEmpty ? entry.fullName : entry.entryName)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .truncationMode(.tail)

            // Username
            Text("@\(entry.username)")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            // Level pill
            if let level = entry.level, let levelName = entry.levelName {
                LevelPillView(level: level, name: levelName)
            }

            // Form dots
            if let lastFive = entry.lastFive {
                FormDotsView(results: lastFive, streak: entry.currentStreak)
            }

            // Pedestal
            VStack(spacing: 4) {
                Text("\(entry.totalPoints)")
                    .font(.title3.weight(.black).monospacedDigit())
                    .foregroundStyle(.blue)

                Text("\(entry.matchPoints) + \(entry.bonusPoints)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if let hitRate = entry.hitRate, let exactCount = entry.exactCount {
                    Text("\(exactCount) exact · \(Int(hitRate))%")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: pedestalHeight)
            .background(
                LinearGradient(
                    colors: pedestalColors(for: rank),
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .frame(maxWidth: .infinity)
    }

    private func pedestalColors(for rank: Int) -> [Color] {
        switch rank {
        case 1: return [.yellow.opacity(0.3), .yellow.opacity(0.1), .yellow.opacity(0.05)]
        case 2: return [.gray.opacity(0.25), .gray.opacity(0.1), .gray.opacity(0.05)]
        case 3: return [.orange.opacity(0.25), .orange.opacity(0.1), .orange.opacity(0.05)]
        default: return [.clear]
        }
    }

    // MARK: - Legend

    private var legendView: some View {
        HStack(spacing: 12) {
            legendDot(color: .yellow, label: "Exact")
            legendDot(color: .green, label: "W+GD")
            legendDot(color: .blue, label: "Winner")
            legendDot(color: .red, label: "Miss")
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .padding(.vertical, 4)
    }

    private func legendDot(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
        }
    }

    // MARK: - Leaderboard Row

    private func leaderboardRow(entry: LeaderboardEntryData, rank: Int) -> some View {
        let isCurrent = isCurrentUser(entry.entryId)
        let entryAwards = awardsForEntry(entry.entryId)

        return HStack(spacing: 12) {
            // Rank + delta
            VStack(spacing: 2) {
                Text("#\(rank)")
                    .font(.subheadline.weight(.black).monospacedDigit())
                    .foregroundStyle(rankColor(rank))

                if let delta = entry.rankDelta, delta != 0 {
                    HStack(spacing: 1) {
                        Image(systemName: delta > 0 ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                            .font(.system(size: 8))
                        Text("\(abs(delta))")
                            .font(.system(size: 9, weight: .bold).monospacedDigit())
                    }
                    .foregroundStyle(delta > 0 ? .green : .red)
                }
            }
            .frame(width: 36)

            // Player info
            VStack(alignment: .leading, spacing: 3) {
                // Name + YOU badge
                HStack(spacing: 6) {
                    Text(entry.entryName.isEmpty ? entry.fullName : entry.entryName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)

                    if isCurrent {
                        Text("YOU")
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.blue.opacity(0.15))
                            .foregroundStyle(.blue)
                            .clipShape(Capsule())
                    }
                }

                // Username + level
                HStack(spacing: 6) {
                    Text("@\(entry.username)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if let level = entry.level, let levelName = entry.levelName {
                        LevelPillView(level: level, name: levelName)
                    }
                }

                // Award badges
                if !entryAwards.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(entryAwards) { award in
                            AwardBadgeView(award: award)
                        }
                    }
                }

                // Form dots
                if let lastFive = entry.lastFive {
                    FormDotsView(results: lastFive, streak: entry.currentStreak)
                }
            }

            Spacer()

            // Points
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(entry.totalPoints)")
                    .font(.headline.weight(.black).monospacedDigit())
                    .foregroundStyle(.blue)

                Text("\(entry.matchPoints) + \(entry.bonusPoints)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if let hitRate = entry.hitRate, let exactCount = entry.exactCount {
                    Text("\(exactCount) exact · \(Int(hitRate))%")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(isCurrent ? Color.blue.opacity(0.06) : Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isCurrent ? Color.blue.opacity(0.3) : Color(.separator).opacity(0.3), lineWidth: isCurrent ? 1.5 : 0.5)
        )
    }

    private func rankColor(_ rank: Int) -> Color {
        switch rank {
        case 1: return .yellow
        case 2: return .gray
        case 3: return .orange
        default: return .primary
        }
    }

    // MARK: - Superlatives

    private func superlativesSection(_ superlatives: [Superlative]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Pool Superlatives")
                .font(.headline)
                .padding(.top, 8)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(superlatives) { superlative in
                    VStack(spacing: 6) {
                        Text(superlative.emoji)
                            .font(.title2)
                        Text(superlative.title)
                            .font(.caption.weight(.semibold))
                            .multilineTextAlignment(.center)
                        Text(superlative.name)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.blue)
                            .lineLimit(1)
                        Text(superlative.detail)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(10)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
    }

    // MARK: - Matchday Info

    private func matchdayInfoBar(_ info: MatchdayInfo) -> some View {
        HStack {
            if let lastMatch = info.lastMatchNumber {
                Text("Last: Match \(lastMatch)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text("\(info.completedCount)/\(info.totalCount) played")
                .font(.caption2)
                .foregroundStyle(.secondary)

            if let nextDate = info.nextMatchDate {
                Spacer()
                Text("Next: \(formatDate(nextDate))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func formatDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: dateString) {
            let display = DateFormatter()
            display.dateFormat = "MMM d"
            return display.string(from: date)
        }
        // Try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: dateString) {
            let display = DateFormatter()
            display.dateFormat = "MMM d"
            return display.string(from: date)
        }
        return dateString
    }
}

// MARK: - Reusable Sub-views

struct FormDotsView: View {
    let results: [String]
    let streak: StreakInfo?

    var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(results.enumerated()), id: \.offset) { _, result in
                Circle()
                    .fill(dotColor(for: result))
                    .frame(width: 8, height: 8)
            }

            if let streak = streak, streak.length >= 3 {
                HStack(spacing: 1) {
                    Text(streak.type == "hot" ? "🔥" : "❄️")
                        .font(.system(size: 10))
                    Text("\(streak.length)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(streak.type == "hot" ? .red : .blue)
                }
            }
        }
    }

    private func dotColor(for result: String) -> Color {
        switch result {
        case "exact": return .yellow
        case "winner_gd": return .green
        case "winner": return .blue
        case "miss": return .red
        case "no_pick": return Color(.systemGray4)
        default: return Color(.systemGray4)
        }
    }
}

struct LevelPillView: View {
    let level: Int
    let name: String

    var body: some View {
        Text("Lv.\(level) \(name)")
            .font(.system(size: 9, weight: .semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(pillBackground)
            .foregroundStyle(pillForeground)
            .clipShape(Capsule())
    }

    private var pillBackground: Color {
        switch level {
        case 10: return .yellow
        case 8...9: return .orange.opacity(0.15)
        case 6...7: return .yellow.opacity(0.15)
        case 4...5: return .blue.opacity(0.15)
        default: return Color(.systemGray5)
        }
    }

    private var pillForeground: Color {
        switch level {
        case 10: return .white
        case 8...9: return .orange
        case 6...7: return .orange
        case 4...5: return .blue
        default: return .secondary
        }
    }
}

struct AwardBadgeView: View {
    let award: PoolAward

    var body: some View {
        HStack(spacing: 2) {
            Text(award.emoji)
                .font(.system(size: 10))
            Text(award.label)
                .font(.system(size: 9, weight: .medium))
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(badgeBackground)
        .foregroundStyle(badgeForeground)
        .clipShape(Capsule())
    }

    private var badgeBackground: Color {
        switch award.type {
        case "mvp": return .yellow.opacity(0.15)
        case "contrarian": return .purple.opacity(0.15)
        case "crowd": return .blue.opacity(0.15)
        case "hot": return .red.opacity(0.15)
        case "cold": return .cyan.opacity(0.15)
        default: return Color(.systemGray5)
        }
    }

    private var badgeForeground: Color {
        switch award.type {
        case "mvp": return .orange
        case "contrarian": return .purple
        case "crowd": return .blue
        case "hot": return .red
        case "cold": return .cyan
        default: return .secondary
        }
    }
}
